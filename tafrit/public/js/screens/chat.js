// "מלווה התזונה שלי" — עוזר AI. החשבון נעשה בשרת מול המאגר, ולכן הכמויות בכרטיסים זהות ליומן.
import { route } from '../app.js';
import { D, refresh } from '../data.js';
import { get, save, del } from '../api.js';
import { $, esc, n0, n1, kg, toast, on, openSheet } from '../ui.js';
import { suggestionHtml, addOption } from './today.js';
import { sourcesHtml } from './targets.js';
import { dmy } from '/shared/dates.js';

/** הסכמה לפני העברה ראשונה לספק AI חיצוני. מחזיר true אם אושר */
export function openAiConsent() {
  return new Promise(res => {
    const on1 = !!D.session.user?.aiConsent;
    const s = openSheet({ title: 'מלווה חכם — ספק AI חיצוני', body: `<div class="stack small">
      <div>כדי לענות בחופשיות, המלווה נעזר במודל Claude של חברת <b>Anthropic</b>.</div>
      <div><b>מה יישלח בכל שאלה:</b> השאלה שכתבת, 12 ההודעות האחרונות בשיחה, ומהיומן רק מה שנדרש לתשובה — היעד היומי, מה שאכלת ותכננת היום, השקילות והממוצע השבועי האחרונים, המטרה הפעילה, והעדפות מזון/אלרגיות לצורך הצעת ארוחות.</div>
      <div><b>מה לא יישלח:</b> שם, דוא״ל, סיסמה או מזהה החשבון.</div>
      <div>אפשר לבטל את ההסכמה בכל רגע ב״עוד ← החשבון שלי״. בלי הסכמה המלווה ממשיך לעבוד במצב בסיסי, בתוך השרת שלנו.</div></div>`,
      foot: on1 ? '<button class="btn danger" data-off>ביטול ההסכמה</button>' : '<button class="btn plain" data-no>המשך במצב בסיסי</button><button class="btn" data-yes>מאשר/ת</button>' , onClose: () => res(false) });
    on(s.el, '[data-yes]', 'click', async () => { await save('POST', '/api/account/ai-consent', { consent: true }); D.session.user.aiConsent = true; s.close(); res(true); });
    on(s.el, '[data-no]', 'click', () => { sessionStorage.setItem('tafrit-ai-asked', '1'); s.close(); res(false); });
    on(s.el, '[data-off]', 'click', async () => { await save('POST', '/api/account/ai-consent', { consent: false }); D.session.user.aiConsent = false; s.close(); toast('ההסכמה בוטלה. המלווה עובד במצב בסיסי'); res(false); });
  });
}

const QUICK = ['מה כדאי לי לאכול הערב?', 'איך אגיע לחלבון שלי בלי לבשל?', 'יש לי בבית ביצים, קוטג׳ ופיתה, מה אפשר להכין?', 'כמה נשאר לי היום?', 'למה המלצת להשאיר השבוע את אותן קלוריות?', 'איך חישבת לי את היעדים?'];

function cardsHtml(cards = [], seq) {
  return cards.map((c, i) => {
    const key = `${seq}:${i}`;
    if (c.type === 'meal') return `<div data-card="${key}"><div class="tiny muted" style="margin-bottom:4px">${esc(c.slotLabel)} · ${dmy(c.date)}</div>${suggestionHtml(c, key).replace(`data-addopt="${key}"`, `data-addcard="${key}"`)}</div>`;
    if (c.type === 'weight') return `<div class="sugg" data-card="${key}">${c.saved ? `✓ נשמר: <b>${kg(c.kg)}</b> ק״ג ל-${dmy(c.date)}${c.existed ? ` (עודכן מ-${kg(c.previous)})` : ''}${c.weekAvg ? `<div class="small muted">ממוצע השבוע: ${kg(c.weekAvg)} · ${esc(c.weekLabel)}</div>` : ''}` : `כבר רשום ${kg(c.previous)} ק״ג ל-${dmy(c.date)}.<button class="btn block sm" style="margin-top:8px" data-wupd="${key}">עדכן ל-${kg(c.kg)} ק״ג</button>`}</div>`;
    if (c.type === 'sources') return `<details class="how" data-card="${key}"><summary>על מה מבוססת ההמלצה?</summary>${sourcesHtml(c.items)}</details>`;
    return '';
  }).join('');
}

route('chat', async (el) => {
  const msgs = await get('/api/chat');
  const byKey = new Map();
  const msgHtml = m => {
    if (m.role === 'user') return `<div class="msg u">${esc(m.content.text)}</div>`;
    (m.content.cards || []).forEach((c, i) => byKey.set(`${m.seq}:${i}`, c));
    return `<div class="msg a">${m.content.notice ? `<div class="tiny muted">${esc(m.content.notice)}</div>` : ''}${esc(m.content.text)}${m.content.cards?.length ? `<div class="cards">${cardsHtml(m.content.cards, m.seq)}</div>` : ''}</div>`;
  };
  el.innerHTML = `<div class="top"><div><h1>מלווה התזונה שלי</h1><div class="sub"><span class="ai-badge">עוזר AI</span> ${D.session.ai ? '' : '· מצב בסיסי (בלי חיבור ל-Claude)'}</div></div><button class="btn xs plain" data-clear>ניקוי</button></div>
    <div class="chat" id="msgs">${msgs.length ? msgs.map(msgHtml).join('') : `<div class="msg a">שלום! אני רואה את הפרופיל, היעדים והיומן שלך. אפשר לשאול מה לאכול, לרשום שקילה ("הבוקר שקלתי 119.8") או לשאול למה היעד נקבע כך. הכמויות שאציע מחושבות מול המאגר, כמו ביומן.</div>`}</div>
    <div class="composer"><div class="quick">${QUICK.map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="row" id="cf"><input class="in grow" id="ci" placeholder="כתוב למלווה…" autocomplete="off" enterkeyhint="send"><button class="btn" id="cs" aria-label="שלח">שלח</button></form></div>`;
  const box = $('#msgs', el);
  const scroll = () => window.scrollTo(0, document.body.scrollHeight);
  scroll();
  const send = async text => {
    if (!text.trim()) return;
    if (D.session.ai && !D.session.user.aiConsent && !sessionStorage.getItem('tafrit-ai-asked')) await openAiConsent();
    $('#ci', el).value = ''; $('#cs', el).disabled = true;
    box.insertAdjacentHTML('beforeend', `<div class="msg u">${esc(text)}</div><div class="msg a" id="typing">חושב…</div>`); scroll();
    try {
      const r = await save('POST', '/api/chat', { message: text }, { quiet: true });
      const list = await get('/api/chat'); const last = list[list.length - 1];
      $('#typing', el)?.remove();
      box.insertAdjacentHTML('beforeend', msgHtml(last)); scroll();
      await refresh();
    } catch (e) { $('#typing', el).textContent = 'לא הצלחתי לענות: ' + e.message; }
    $('#cs', el).disabled = false;
  };
  $('#cf', el).onsubmit = e => { e.preventDefault(); send($('#ci', el).value); };
  on(el, '[data-q]', 'click', (e, b) => send(b.dataset.q));
  on(el, '[data-clear]', 'click', async () => { await del('/api/chat'); location.reload(); });
  on(el, '[data-addcard]', 'click', async (e, b) => { const c = byKey.get(b.dataset.addcard); await addOption(c.date, c.slot, c); b.disabled = true; b.textContent = 'נוסף לתכנון ✓'; toast(`נוסף ל${c.slotLabel}`); });
  on(el, '[data-wupd]', 'click', async (e, b) => { const c = byKey.get(b.dataset.wupd); await save('PUT', '/api/weights/' + c.date, { kg: c.kg }); await refresh(); b.outerHTML = `<div class="note ok" style="margin-top:8px">עודכן ל-${kg(c.kg)} ק״ג — נספר פעם אחת.</div>`; });
});
