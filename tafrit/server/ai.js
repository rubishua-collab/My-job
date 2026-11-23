// "מלווה התזונה שלי": Claude עם כלים. החשבון נעשה בכלים (tools.js) מול המאגר; המודל מנסח ומחליט מה לשאול.
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFS, runTool, localReply } from './tools.js';
import { chatAppend, chatList } from './db.js';
import { israelDate, israelTime, hebDay } from '../shared/dates.js';

export const MODEL = process.env.TAFRIT_MODEL || 'claude-opus-5-5';
export const aiEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client = null;
const getClient = () => (client ||= new Anthropic());

const SYSTEM = `אתה "מלווה התזונה שלי" באפליקציה "תפריט יומי רובי". אתה עוזר AI ולא איש מקצוע רפואי.
כתוב בעברית פשוטה, חמה וקצרה (2–5 משפטים), בלי כותרות ובלי טבלאות.

כללים:
- כל מספר (קלוריות, חלבון, גרמים, משקל, ממוצעים, יעדים) חייב לבוא מתוצאת כלי. אל תחשב בראש ואל תמציא כמויות.
- לפני המלצה על אוכל קרא ל-get_status, ואז ל-suggest_meal. ההצעות מוצגות למשתמש ככרטיסים עם כפתור "הוסף לתכנון", אז אל תחזור על כל הפריטים — תן משפט שמסביר למה הן מתאימות למה שהוא רשם היום.
- התייחס למה שהמשתמש רשם בפועל: מה אכל ("אכלתי"), מה מתוכנן, כמה נשאר. פריט מתוכנן לא נחשב נאכל. יום שלא סומן כמתועד במלואו לא נחשב יום של אפס אכילה.
- סיים בפעולה אחת שאפשר לעשות מיד.
- אם חסר פרט שמשנה את ההמלצה (למשל אם יש זמן לבשל, או לאיזו ארוחה), שאל שאלה ממוקדת אחת במקום לנחש.
- "הבוקר שקלתי X" → log_weight. אם הכלי מחזיר שכבר יש שקילה לאותו יום, אמור זאת ובקש אישור (הכרטיס מאפשר לעדכן).
- שאלות "למה" על היעד → weekly_review ו/או explain_targets. אל תסיק משקילה בודדת כמה קלוריות נשרפו.
- כשאתה מסביר על מה מבוססת המלצה, קרא ל-get_sources עם המקורות הרלוונטיים, והבחן במפורש בין ממצא מחקרי (מקור, שנה) לבין החלטת תוכנה של האפליקציה (למשל כמה שקילות נדרשות כדי להציג מגמה).
- המטרה הפעילה מופיעה ב-get_status (active_plan). התייחס אליה, ובסיכום השבועי השווה בין מגמת ממוצעי המשקל לבין המטרה. כל שינוי יעד או תוכנית מוצג למשתמש לאישור במסכים — אל תכריז שהיעד שונה.
- אל תבקש ואל תציין פרטים מזהים (שם, דוא״ל, טלפון). אין לך גישה לנתונים של משתמשים אחרים.
- במחלת כליה, הפרעת אכילה, הריון, סוכרת עם תרופות או כל הנחיה רפואית — אל תשנה יעדים; הפנה לדיאטן/רופא ועבוד לפי היעדים שהוזנו.`;

const MAX_STEPS = 8;

/** שיחה אחת: הודעת משתמש → תשובה + כרטיסים. היסטוריית הצ׳אט נשמרת ב-DB. */
export async function chat(user, message) {
  const uid = user.id;
  const text = String(message || '').trim().slice(0, 2000);
  if (!text) throw Object.assign(new Error('הודעה ריקה'), { status: 400 });
  chatAppend(uid, 'user', { text });
  // מצב בסיסי: בלי ספק חיצוני; גם כשאין למשתמש הסכמה לשליחה לספק AI
  if (!aiEnabled() || !user.ai_consent_at) {
    const rep = localReply(uid, text);
    const reply = { ...rep, mode: 'basic', ...(aiEnabled() && !user.ai_consent_at ? { notice: 'עניתי במצב בסיסי, בלי לשלוח מידע לספק AI. אפשר לאשר שליחה בהגדרות.' } : {}) };
    chatAppend(uid, 'assistant', reply);
    return reply;
  }
  const cards = [];
  // ההקשר: 12 ההודעות האחרונות בטקסט (הכרטיסים כבר שמורים במסך)
  const hist = chatList(uid, 13).slice(0, -1).filter(m => m.content?.text).slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.text }));
  while (hist.length && hist[0].role !== 'user') hist.shift();
  const messages = [...merge(hist), { role: 'user', content: `${text}\n\n(עכשיו: ${hebDay(israelDate())} ${israelDate()} ${israelTime()} שעון ישראל)` }];
  if (messages.length > 1 && messages[messages.length - 2].role === 'user') messages.splice(messages.length - 2, 1);
  let finalText = '';
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await getClient().beta.messages.create({
        model: MODEL, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOL_DEFS,
        messages,
      });
      if (res.stop_reason === 'refusal') { finalText = 'אני לא יכול לעזור בבקשה הזו. אפשר לשאול על ארוחות, שקילות או היעדים שלך.'; break; }
      messages.push({ role: 'assistant', content: res.content });
      const uses = res.content.filter(b => b.type === 'tool_use');
      const texts = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (res.stop_reason !== 'tool_use' || !uses.length) { finalText = texts; break; }
      const results = uses.map(u => {
        let out; let isErr = false;
        try { out = runTool(uid, u.name, u.input || {}, cards); } catch (e) { out = { error: e.message }; isErr = true; }
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), ...(isErr ? { is_error: true } : {}) };
      });
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    // נפילה למצב בסיסי, כדי שהמשתמש עדיין יקבל תשובה מחושבת
    const rep = localReply(uid, text);
    const reply = { ...rep, mode: 'basic', notice: e instanceof Anthropic.AuthenticationError ? 'מפתח Claude לא תקין — עברתי למצב בסיסי.' : e instanceof Anthropic.RateLimitError ? 'יותר מדי בקשות ל-Claude כרגע — עניתי במצב בסיסי.' : 'לא הצלחתי להתחבר ל-Claude — עניתי במצב בסיסי.' };
    console.error('[ai]', e?.status || '', e?.message);
    chatAppend(uid, 'assistant', reply);
    return reply;
  }
  const reply = { text: finalText || 'הנה מה שמצאתי:', cards: dedupe(cards), mode: 'ai' };
  chatAppend(uid, 'assistant', reply);
  return reply;
}

function merge(list) { const out = []; for (const m of list) { if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + m.content; else out.push({ ...m }); } return out; }
function dedupe(cards) { const seen = new Set(); return cards.filter(c => { const k = c.type === 'meal' ? c.id : c.type + JSON.stringify(c.items || c.date); if (seen.has(k)) return false; seen.add(k); return true; }); }
