// Claude בתוך התוכנה: קריאת צילומים (חשבון גובים, איסוף יומי, הלוואות, ת״ז, חוזים) ופקודה חופשית לדף חשבון.
// במקור (claude.ai artifact) זה רץ דרך היכולת sample בדפדפן; כאן זה רץ בשרת דרך ה-API של Anthropic (ראה ai/claude.js).
//
// POST /api/ai/extract  {task, images:[dataURL], text?, schema?, collector?, page?, total?} → {ok:true, data}
// POST /api/ai/command  {id, version, thread:[{r:'u'|'a', t}]} → {kind:'q', question} | {kind:'done', summary, up, del, add, sk, lines, data?, version}
//   השרת לא שומר כלום בפקודה. הדפדפן מציג את רשימת השינויים, ורק אחרי לחיצה על ״אשר ושמור״ שולח PUT /api/accounts/:id.
// GET  /api/ai/status   → {configured, tasks}
import { ask, configured, parseImages, parseJson, MSG } from './ai/claude.js';
import * as P from './ai/prompts.js';
import { AI_TABS, aiPrompt, aiSchema, aiApply } from './ai/command.js';
import { knownCollectors } from '../data.js';
import { num, normTime, normStatus, phShow, cleanColl } from '../../public/js/calc.js';

const S = (v) => String(v == null ? '' : v).trim();
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: 'string' }, numT = { type: 'number' }, bool = { type: 'boolean' };
const arr = (items) => ({ type: 'array', items });

// ---- משימות קריאה. לכל משימה: הרשאה, מספר תמונות, ההנחיה המקורית, צורת התשובה ונרמול כמו במקור ----
const LINE_C = obj({ name: str, amount: numT, collector: str, uncertain: bool });
export const TASKS = {
  // app.html 2330-2351 (PROMPT + normalizeExtraction). entries: [{k:'d'|'e', n, a, c, u}]
  collectors: {
    perm: 'finance', maxImages: 1, needImages: true,
    prompt: () => P.PROMPT,
    schema: obj({ debts: arr(LINE_C), expenses: arr(LINE_C), note: str }),
    norm(res, body) {
      const out = []; if (!res || typeof res !== 'object') return { entries: out, note: '' };
      const take = (a, k) => { if (!Array.isArray(a)) return; for (const x of a) { if (!x || typeof x !== 'object') continue; const n = S(x.name); if (!n || P.TOTAL_RE.test(n)) continue; out.push({ k, n, a: num(x.amount), c: S(x.collector) || S(body.collector), u: !!x.uncertain }); } };
      take(res.debts, 'd'); take(res.expenses, 'e');
      return { entries: out, note: res.note ? String(res.note).slice(0, 120) : '' };
    },
  },
  // app.html 2769-2792 (PROMPT_W + normalizeW). entries: [{n, a, t, s, p, c, u}]
  list: {
    perm: 'finance', maxImages: 1, needImages: true,
    prompt: () => P.PROMPT_W,
    schema: obj({ items: arr(obj({ name: str, amount: numT, time: str, status: str, phone: str, collector: str, uncertain: bool })), note: str }),
    norm(res) {
      const out = []; if (!res || typeof res !== 'object' || !Array.isArray(res.items)) return { entries: out, note: '' };
      for (const x of res.items) { if (!x || typeof x !== 'object') continue; const n = S(x.name); if (!n || P.TOTAL_RE.test(n)) continue;
        const p = phShow(x.phone); const cc = cleanColl(x.collector);
        out.push({ n, a: num(x.amount), t: normTime(x.time), s: normStatus(x.status) || normStatus(x.time), p, c: cc, u: !!x.uncertain }); }
      return { entries: out, note: res.note ? String(res.note).slice(0, 120) : '' };
    },
  },
  // app.html 6166-6189 (PROMPT_L): הלוואות שניתנו מצילום. entries: [{n, a, u}] (שורות בלי סכום או שורות סיכום מדולגות)
  loans: {
    perm: 'finance', maxImages: 1, needImages: true,
    prompt: () => P.PROMPT_L,
    schema: obj({ items: arr(obj({ name: str, amount: numT, uncertain: bool })), note: str }),
    norm(res) {
      const items = res && Array.isArray(res.items) ? res.items : [], out = [];
      for (const x of items) { if (!x || typeof x !== 'object') continue; const n = S(x.name); const a = num(x.amount); if (!a || (n && P.TOTAL_RE.test(n))) continue; out.push({ n, a, u: !!x.uncertain }); }
      return { entries: out, note: res && res.note ? String(res.note).slice(0, 120) : '' };
    },
  },
  // app.html 8367-8376 (fxIdPrompt) + 8418 (נרמול). תמונה 1 = צד קדמי, תמונה 2 = ספח. רק בעלים/מנהל
  id_card: {
    perm: 'sensitive', maxImages: 2, needImages: true,
    prompt: (b, imgs) => P.fxIdPrompt(imgs.length),
    schema: obj({ firstName: str, lastName: str, idNumber: str, birthDate: str, address: str, notes: str }),
    norm(r) {
      const d = { firstName: S(r && r.firstName), lastName: S(r && r.lastName), idNumber: P.fxDigits(r && r.idNumber).slice(0, 9), birthDate: P.fxNormDate(r && r.birthDate), address: S(r && r.address), notes: S(r && r.notes) };
      d.idValid = !!d.idNumber && P.fxIdValid(d.idNumber);
      return d;
    },
  },
  // app.html 7756-7762 ייבוא חוזה מצילום מסך. התשובה כוללת custom עם שמות שדות חופשיים, ולכן בלי schema (JSON מהטקסט, כמו fxAsk במקור)
  contract_import: { perm: 'sensitive', maxImages: 1, needImages: true, prompt: () => P.CONTRACT_IMPORT_PROMPT, schema: null },
  // app.html 7807 בדיקת נוסח: text = הנוסח, form = פרטי הטופס (sgReadForm בלי k/q/w/m)
  contract_review: {
    perm: 'sensitive', maxImages: 0, needText: true,
    prompt: (b) => P.contractReviewPrompt(b.form && typeof b.form === 'object' ? b.form : {}, String(b.text)),
    schema: obj({ issues: arr(obj({ quote: str, problem: str, fix: str })) }),
  },
  // app.html 7850-7876 סריקת עמוד חוזה: טקסט מלא (לא JSON). page/total = מספר העמוד; כמה תמונות = רצועות של אותו עמוד
  contract_ocr: {
    perm: 'sensitive', maxImages: 5, needImages: true, format: 'text',
    prompt: (b, imgs) => P.sgOsPrompt(Math.max(1, +b.page || 1), Math.max(1, +b.total || 1), imgs.length),
    post: (r) => { let t = P.sgOsClean(r.text); if (/^\[\s*עמוד ריק\s*\]$/.test(t.trim())) t = ''; return { text: t, truncated: !!r.truncated }; },
  },
  // app.html 8121-8135 עוזר המילוי: text = החוזה עם הסימונים ⟦S1⟧…
  contract_detect: {
    perm: 'sensitive', maxImages: 0, needText: true,
    prompt: (b) => P.fxDetectPrompt(String(b.text)),
    schema: obj({ parties: arr(obj({ key: str, name: str, role: str })), slots: arr(obj({ id: str, field: str, party: str, label: str })), extra: arr(obj({ after: str, field: str, party: str, label: str })) }),
  },
  // הנחיה שבנה הדפדפן (למשל fxChatPrompt 8189, שתלוי במצב הטופס). text = ההנחיה המלאה, schema אופציונלי
  custom: { perm: 'sensitive', maxImages: 5, needText: true, prompt: (b) => String(b.text), schema: undefined },
};
TASKS.work = TASKS.list; TASKS.split = TASKS.list; // שמות נוספים לאותה משימה

// JSON schema מהדפדפן: רק אובייקט, וכל אובייקט בתוכו מקבל additionalProperties:false (חובה ב-structured outputs)
function cleanSchema(s, depth = 0) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || depth > 12) return s;
  const o = { ...s };
  if (o.type === 'object' || o.properties) { o.additionalProperties = false; if (o.properties) o.properties = Object.fromEntries(Object.entries(o.properties).map(([k, v]) => [k, cleanSchema(v, depth + 1)])); }
  if (o.items) o.items = cleanSchema(o.items, depth + 1);
  for (const k of ['anyOf', 'allOf']) if (Array.isArray(o[k])) o[k] = o[k].map(x => cleanSchema(x, depth + 1));
  return o;
}

// הגבלת קצב פשוטה לכל משתמש: עד 2 בקשות במקביל ועד 60 ב-10 דקות
const busy = new Map(), hist = new Map();
async function limited(user, fn, err) {
  const id = user.id, t = Date.now();
  const h = (hist.get(id) || []).filter(x => t - x < 10 * 60e3);
  if (h.length >= 60 || (busy.get(id) || 0) >= 2) throw err(429, MSG.rate_limited);
  h.push(t); hist.set(id, h); busy.set(id, (busy.get(id) || 0) + 1);
  try { return await fn(); } finally { busy.set(id, busy.get(id) - 1); }
}

const todayIL = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });

export async function register(ctx) {
  const { r, err, need, can, getDoc, logAudit } = ctx;

  r.get('/api/ai/status', (req, res, { user }) => ({ configured: configured(), tasks: Object.keys(TASKS).filter(k => can[TASKS[k].perm](user)), command: can.finance(user) }));

  r.post('/api/ai/extract', async (req, res, { user, body }) => {
    const T = TASKS[body.task]; if (!T) throw err(400, 'משימה לא מוכרת');
    need(can[T.perm](user), T.perm === 'sensitive' ? 'קריאת תעודות זהות וחוזים זמינה רק לבעלים ולמנהל' : undefined);
    if (!configured()) throw err(503, 'קריאת תמונות דורשת חיבור ל-Claude: הגדר ANTHROPIC_API_KEY');
    const imgs = parseImages(body.images, T.maxImages);
    if (T.needImages && !imgs.length) throw err(400, 'לא נבחר צילום');
    if (T.needText && !S(body.text)) throw err(400, 'חסר טקסט');
    if (String(body.text || '').length > 300000) throw err(413, 'הטקסט ארוך מדי');
    let schema = T.schema;
    if (schema === undefined) schema = body.schema && typeof body.schema === 'object' ? cleanSchema(body.schema) : null;
    let prompt = T.prompt(body, imgs);
    // טקסט נוסף מהמשתמש למשימות צילום (למשל הערה) — נוסף אחרי ההנחיה המקורית
    if (!T.needText && S(body.text)) prompt += '\n\nהערה מהמשתמש:\n' + String(body.text).slice(0, 4000);
    const out = await limited(user, () => ask({ images: imgs, prompt, schema, effort: 'low', format: T.format || 'json', task: body.task }), err);
    let data;
    if (T.format === 'text') data = T.post(out);
    else data = T.norm ? { ...out.data, ...T.norm(out.data, body) } : out.data;
    if (body.task === 'id_card') logAudit({ user, action: 'קריאת ת״ז ב-Claude' }); // בלי הפרטים עצמם
    return { ok: true, data };
  });

  r.post('/api/ai/command', async (req, res, { user, body }) => {
    need(can.finance(user));
    if (!configured()) throw err(503, 'פקודות לתוכנה דורשות חיבור ל-Claude: הגדר ANTHROPIC_API_KEY');
    const d = getDoc('accounts', String(body.id || '')); if (!d || d.deleted) throw err(404, 'החשבון לא נמצא');
    const kind = d.data.kind; if (!AI_TABS[kind]) throw err(400, 'אין פקודות לסוג החשבון הזה');
    if (body.version != null && +body.version !== d.version) throw Object.assign(err(409, 'החשבון עודכן ממכשיר אחר. רענן ונסה שוב.'), { current: d.version });
    const thread = (Array.isArray(body.thread) ? body.thread : []).slice(-10).map(m => ({ r: m && m.r === 'a' ? 'a' : 'u', t: S(m && m.t).slice(0, 2000) })).filter(m => m.t);
    if (!thread.length || thread[thread.length - 1].r !== 'u') throw err(400, 'כתוב מה לעשות בדף');
    const prompt = aiPrompt(kind, d.data, thread, { collectors: knownCollectors(), today: todayIL() });
    if (Buffer.byteLength(prompt) > 250000) throw err(400, 'יש בדף יותר מדי שורות בשביל פקודה אחת.');
    const { data: ans } = await limited(user, () => ask({ prompt, schema: aiSchema(kind), effort: 'medium', task: 'command:' + kind }), err);
    logAudit({ user, action: 'פקודה ל-Claude', col: 'accounts', doc_id: d.id, note: thread.filter(m => m.r === 'u').map(m => m.t).join(' / ').slice(0, 500) });
    // 6066-6071: שאלה בלי שינויים → מחזירים את השאלה
    const q = ans && typeof ans.question === 'string' ? ans.question.trim() : '';
    const ch = ans && Array.isArray(ans.changes) ? ans.changes : [], sc = ans && ans.scalars && typeof ans.scalars === 'object' ? ans.scalars : {};
    if (q && !ch.length && !Object.keys(sc).length) return { kind: 'q', question: q, version: d.version };
    const a = aiApply(kind, d.data, ch, sc);
    const n = a.up + a.del + a.add;
    return { kind: 'done', summary: S(ans && ans.summary), up: a.up, del: a.del, add: a.add, sk: a.sk, lines: a.lines, data: n ? a.doc : undefined, version: d.version };
  });
}
