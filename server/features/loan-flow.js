// בקשות להלוואה ← פיצול ← איסוף יום.
// ״העבר ללשונית פיצול״: הבקשה מקושרת לפיצול ולאיסוף היום של תאריך העבודה (xfer). היא לא נכתבת לתוך השורות של
// הפיצול או של האיסוף, ולכן לא נספרת בגביות ובהוצאות — שני המסכים מציגים אותה מתוך הבקשה עצמה (_lreq).
// ״אשר שההלוואה ניתנה ללקוח״: באותה טרנזקציה — סימון המסירה בבקשה (given) והוצאה אחת ״מתן הלוואה״ על שם הגובה,
// באיסוף היום ובחשבון הגובים (עותק מקושר xk), כמו ״הוסף הוצאה״. מזהה ההוצאה נגזר ממזהה הבקשה (xL + מזהה),
// כך שלחיצה כפולה, ניסיון חוזר אחרי ניתוק או פתיחה משני מכשירים לא יוצרים הוצאה נוספת.
import { num, r2, cleanColl, CHANGE, NOC_SP } from '../../public/js/calc.js';
import { mainWork } from './day-expense.js';
import { KIND_NAMES } from '../data.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hhmmIL = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
const dmyT = (d) => String(d).split('-').reverse().join('.');
export const LOAN_EXP = 'מתן הלוואה';
export const expKey = (reqId) => 'xL' + reqId;

// מה שמוצג בפיצול ובאיסוף היום (לתצוגה בלבד — לא נשמר בחשבון)
const view = (x) => ({ id: x.id, name: x.data.name, amount: r2(num(x.data.amount)), date: x.data.date || '', note: x.data.note || '', phone: x.data.phone || '', chk: x.data.chk ?? '', xfer: x.data.xfer, given: x.data.given || null });
export const chkOk = (v) => /^\d+$/.test(String(v ?? '').trim()) && +v >= 1 && +v <= 999;
// לאיזו לשונית הבקשה שובצה (xfer.kind; בקשה ישנה בלי kind = פיצול). הבקשה מוצגת רק בלשונית שנבחרה (בחשבון שנבחר, או בחשבון העדכני של אותו סוג ותאריך אם הוא נמחק).
// אחרי אישור המסירה, איסוף היום שבו נרשמה הוצאת ״מתן הלוואה״ מציג אותה גם (המסירה והרישום הכספי שם).
export function attachLoanReqs(listDocs, getDoc, a) {
  if (!a || !KIND_NAMES[a.kind]) return;
  const all = listDocs('loan_requests').filter(x => x.data && x.data.xfer);
  const lrs = a.kind === 'work' ? new Set((a.expenses || []).map(x => x && x.lr).filter(Boolean)) : new Set();
  const out = all.filter(x => {
    const X = x.data.xfer;
    if (a.kind === 'work' && (lrs.has(x.id) || (x.data.given && x.data.given.workId === a.id))) return true;
    const kind = X.kind || 'split', acc = X.accId || (kind === 'split' ? X.splitId : null); // בקשה ישנה בלי kind = ״הועברה לפיצול״
    if (kind !== a.kind) return false;
    return acc === a.id || (X.date === a.date && !liveDoc(getDoc, acc, a.kind, a.date) && isNewest(listDocs, a));
  });
  a._lreq = out.map(view).sort((p, q) => String(p.xfer.at || '').localeCompare(String(q.xfer.at || '')));
}
function liveDoc(getDoc, id, kind, date) { const d = id ? getDoc('accounts', id) : null; return !!(d && !d.deleted && d.data.kind === kind && d.data.date === date); }
const newestOf = (listDocs, kind, date) => kind === 'work' ? mainWork(listDocs, date) : listDocs('accounts').filter(x => x.data.kind === kind && x.data.date === date).sort((p, q) => (q.data.updatedAt || q.data.createdAt || 0) - (p.data.updatedAt || p.data.createdAt || 0))[0] || null;
const newestSplit = (listDocs, date) => newestOf(listDocs, 'split', date);
const isNewest = (listDocs, a) => { const s = newestOf(listDocs, a.kind, a.date); return !!s && s.id === a.id; };

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, listDocs, putDoc, once, newId, now, logAudit } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };
  const reqOf = (id) => { const d = getDoc('loan_requests', String(id || '')); if (!d || d.deleted) throw err(404, 'הבקשה לא נמצאה (אולי נמחקה). רענן את המסך.'); return d; };

  // הלשוניות שאפשר לשבץ אליהן בקשה — בשמות שמופיעים בתוכנה (KIND_NAMES), כך שהרשימה מתעדכנת עם התוכנה
  r.get('/api/loan-req/targets', (req, res, { user }) => { need(can.finance(user)); return Object.entries(KIND_NAMES).map(([kind, name]) => ({ kind, name })); });

  // ״העבר ללשונית״ / ״שנה לשונית״: שיבוץ הבקשה ללשונית ולתאריך העבודה. שינוי יעד מעביר את אותה בקשה (שדה אחד) — אין כפילות.
  // הסטטוס (ממתינה למסירה / נמסרה) לא משתנה; הרישום הכספי רק באישור המסירה.
  r.post('/api/loan-req/xfer', (req, res, { user, body }) => {
    need(can.finance(user), 'אין לך הרשאה להעביר בקשות');
    return tx(() => once(body.opId, user, () => {
      const d = reqOf(body.id), old = d.data.xfer || null;
      const kind = body.kind ? String(body.kind) : (old ? null : 'split');
      if (!kind) return { ok: true, already: true, xfer: old, version: d.version }; // קריאה ישנה בלי לשונית לבקשה שכבר הועברה
      if (!KIND_NAMES[kind]) throw err(400, 'לשונית לא מוכרת');
      const date = ISO.test(body.date || '') ? body.date : (old && old.date) || null; if (!date) throw err(400, 'בחר תאריך עבודה');
      let A = body.accId ? getDoc('accounts', String(body.accId)) : null;
      if (A && (A.deleted || A.data.kind !== kind || A.data.date !== date)) A = null;
      if (!A) A = newestOf(listDocs, kind, date);
      if (old && old.kind === kind && old.date === date && A && old.accId === A.id) return { ok: true, already: true, xfer: old, version: d.version, name: KIND_NAMES[kind] };
      const t = now(); let accId = A && A.id;
      if (!accId) {
        if (kind === 'morning') throw err(400, 'אין עדיין חשבון בוקר לתאריך ' + dmyT(date) + '. פתח אותו קודם, ואז העבר.');
        accId = newId('a');
        const base = { kind, date, title: KIND_NAMES[kind] + ' ' + dmyT(date), createdAt: t, v: 1 };
        putDoc('accounts', accId, kind === 'split' ? { ...base, records: [], phones: ['סמיילי', 'גובאני', 'שילו'] } : kind === 'work' ? { ...base, entries: [], expenses: [] } : { ...base, entries: [] }, { user, action: 'פתיחת ' + KIND_NAMES[kind] + ' לבקשת הלוואה' });
      }
      const xfer = { kind, accId, date, at: t, by: user.name, ...(kind === 'split' ? { splitId: accId } : {}), ...(kind === 'work' ? { workId: accId } : (old && old.workId && old.date === date ? { workId: old.workId } : {})),
        hist: ((old && old.hist) || []).concat(old ? [{ kind: old.kind || 'split', accId: old.accId || old.splitId || null, date: old.date, at: old.at }] : []).slice(-20) };
      const out = putDoc('loan_requests', d.id, { ...d.data, xfer, updated: new Date(t).toISOString() }, { user, action: old ? 'שינוי לשונית לבקשה' : 'העברה ללשונית', item: d.data.name, note: (old ? (KIND_NAMES[old.kind || 'split'] + ' ← ') : '') + KIND_NAMES[kind] + ' · ' + dmyT(date) });
      return { ok: true, xfer, version: out.version, name: KIND_NAMES[kind], moved: !!old };
    }));
  });

  // ״אשר שההלוואה ניתנה ללקוח״
  r.post('/api/loan-req/give', (req, res, { user, body }) => {
    need(can.finance(user), 'אין לך הרשאה לאשר מסירה');
    return tx(() => once(body.opId, user, () => {
      const d = reqOf(body.id); const q = d.data;
      if (!q.xfer) throw err(409, 'הבקשה עוד לא הועברה לפיצול');
      if (q.given) return { ok: true, already: true, given: q.given, version: d.version }; // כבר אושרה — אין הוצאה נוספת
      // מספר השיקים חובה לסגירת הבקשה: מהשדה שנשלח עם האישור, אחרת מה שכבר שמור בבקשה. בלי מספר תקין — לא נרשם כלום
      const chk = body.chk !== undefined && String(body.chk).trim() !== '' ? String(body.chk).trim() : String(q.chk ?? '').trim();
      if (!chkOk(chk)) { const e = err(400, 'כדי לסגור את הבקשה, יש להזין לכמה שיקים חולקה ההלוואה'); e.field = 'chk'; throw e; }
      const c = cleanColl(body.c); if (!c || c === CHANGE || c === NOC_SP) throw err(400, 'בחר איזה גובה מסר את הכסף');
      const a = r2(num(q.amount)); if (!(a > 0)) throw err(400, 'אין סכום הלוואה בבקשה');
      const date = q.xfer.date, t = now(), hh = hhmmIL(t), xk = expKey(d.id);
      const n = LOAN_EXP + ' — ' + String(q.name || '').trim();
      let W = q.xfer.workId ? getDoc('accounts', q.xfer.workId) : null;
      if (W && (W.deleted || W.data.kind !== 'work' || W.data.date !== date)) W = null;
      if (!W) W = mainWork(listDocs, date);
      let workId = W && W.id;
      const x = { _k: xk, n, a, c, t: hh, at: t, by: user.name, lr: d.id, lk: LOAN_EXP };
      if (W) {
        if (!(W.data.expenses || []).some(e => e && e._k === xk)) {
          const data = { ...W.data, expenses: (W.data.expenses || []).concat([x]), updatedAt: t };
          putDoc('accounts', W.id, data, { user, action: 'מתן הלוואה', item: c + ' · ' + q.name, note: a + ' ₪' });
        }
      } else {
        workId = newId('a');
        putDoc('accounts', workId, { kind: 'work', date, title: 'איסוף יום ' + dmyT(date), createdAt: t, v: 1, entries: [], expenses: [x] }, { user, action: 'מתן הלוואה', item: c + ' · ' + q.name });
      }
      // אותה הוצאה בחשבון הגובים של התאריך (אם יש) — עותק מקושר, כמו ״הוסף הוצאה״
      const colls = listDocs('accounts').filter(z => z.data.kind === 'collectors' && z.data.date === date).sort((p, o) => (o.data.updatedAt || o.data.createdAt || 0) - (p.data.updatedAt || p.data.createdAt || 0));
      const C = colls[0];
      if (C && !(C.data.entries || []).some(e => e && e.xk === xk)) {
        putDoc('accounts', C.id, { ...C.data, entries: (C.data.entries || []).concat([{ k: 'e', n, a, c, t: hh, xk }]), updatedAt: t }, { user, action: 'מתן הלוואה', item: c + ' · ' + q.name, note: a + ' ₪' });
      }
      const given = { c, at: t, t: hh, by: user.name, a, xk, workId };
      const out = putDoc('loan_requests', d.id, { ...q, chk: +chk, given, updated: new Date(t).toISOString() }, { user, action: 'אישור מסירת הלוואה', item: q.name, note: c + ' · ' + a + ' ₪' });
      logAudit({ user, action: 'מתן הלוואה', col: 'loan_requests', doc_id: d.id, item: q.name, after: given, note: c });
      return { ok: true, given, chk: +chk, workId, version: out.version };
    }));
  });
}
