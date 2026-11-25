// בקשות להלוואה ← פיצול ← איסוף יום.
// ״העבר ללשונית פיצול״: הבקשה מקושרת לפיצול ולאיסוף היום של תאריך העבודה (xfer). היא לא נכתבת לתוך השורות של
// הפיצול או של האיסוף, ולכן לא נספרת בגביות ובהוצאות — שני המסכים מציגים אותה מתוך הבקשה עצמה (_lreq).
// ״אשר שההלוואה ניתנה ללקוח״: באותה טרנזקציה — סימון המסירה בבקשה (given) והוצאה אחת ״מתן הלוואה״ על שם הגובה,
// באיסוף היום ובחשבון הגובים (עותק מקושר xk), כמו ״הוסף הוצאה״. מזהה ההוצאה נגזר ממזהה הבקשה (xL + מזהה),
// כך שלחיצה כפולה, ניסיון חוזר אחרי ניתוק או פתיחה משני מכשירים לא יוצרים הוצאה נוספת.
import { num, r2, cleanColl, CHANGE, NOC_SP } from '../../public/js/calc.js';
import { mainWork } from './day-expense.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hhmmIL = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
const dmyT = (d) => String(d).split('-').reverse().join('.');
export const LOAN_EXP = 'מתן הלוואה';
export const expKey = (reqId) => 'xL' + reqId;

// מה שמוצג בפיצול ובאיסוף היום (לתצוגה בלבד — לא נשמר בחשבון)
const view = (x) => ({ id: x.id, name: x.data.name, amount: r2(num(x.data.amount)), date: x.data.date || '', note: x.data.note || '', phone: x.data.phone || '', xfer: x.data.xfer, given: x.data.given || null });
export function attachLoanReqs(listDocs, getDoc, a) {
  if (!a || (a.kind !== 'split' && a.kind !== 'work')) return;
  const reqs = listDocs('loan_requests').filter(x => x.data && x.data.xfer && x.data.xfer.date === a.date);
  let out;
  if (a.kind === 'split') out = reqs.filter(x => x.data.xfer.splitId === a.id || !liveDoc(getDoc, x.data.xfer.splitId, 'split', a.date) && isNewestSplit(listDocs, a));
  else { const main = mainWork(listDocs, a.date); out = reqs.filter(x => x.data.xfer.workId === a.id || (!liveDoc(getDoc, x.data.xfer.workId, 'work', a.date) && main && main.id === a.id)); }
  a._lreq = out.map(view).sort((p, q) => String(p.xfer.at || '').localeCompare(String(q.xfer.at || '')));
}
function liveDoc(getDoc, id, kind, date) { const d = id ? getDoc('accounts', id) : null; return !!(d && !d.deleted && d.data.kind === kind && d.data.date === date); }
const newestSplit = (listDocs, date) => listDocs('accounts').filter(x => x.data.kind === 'split' && x.data.date === date).sort((p, q) => (q.data.updatedAt || q.data.createdAt || 0) - (p.data.updatedAt || p.data.createdAt || 0))[0] || null;
const isNewestSplit = (listDocs, a) => { const s = newestSplit(listDocs, a.date); return !!s && s.id === a.id; };

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, listDocs, putDoc, once, newId, now, logAudit } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };
  const reqOf = (id) => { const d = getDoc('loan_requests', String(id || '')); if (!d || d.deleted) throw err(404, 'הבקשה לא נמצאה (אולי נמחקה). רענן את המסך.'); return d; };

  // ״העבר ללשונית פיצול״
  r.post('/api/loan-req/xfer', (req, res, { user, body }) => {
    need(can.finance(user), 'אין לך הרשאה להעביר בקשות');
    return tx(() => once(body.opId, user, () => {
      const d = reqOf(body.id);
      if (d.data.xfer) return { ok: true, already: true, xfer: d.data.xfer, version: d.version }; // כבר הועברה — לא מעבירים פעמיים
      const date = ISO.test(body.date || '') ? body.date : null; if (!date) throw err(400, 'בחר תאריך עבודה');
      const t = now();
      let S = body.splitId ? getDoc('accounts', String(body.splitId)) : null;
      if (S && (S.deleted || S.data.kind !== 'split' || S.data.date !== date)) S = null;
      if (!S) S = newestSplit(listDocs, date);
      let splitId = S && S.id;
      if (!splitId) { splitId = newId('a'); putDoc('accounts', splitId, { kind: 'split', date, title: 'פיצול ' + dmyT(date), createdAt: t, v: 1, records: [], phones: ['סמיילי', 'גובאני', 'שילו'] }, { user, action: 'פתיחת פיצול לבקשת הלוואה' }); }
      const W = mainWork(listDocs, date); let workId = W && W.id;
      if (!workId) { workId = newId('a'); putDoc('accounts', workId, { kind: 'work', date, title: 'איסוף יום ' + dmyT(date), createdAt: t, v: 1, entries: [], expenses: [] }, { user, action: 'פתיחת איסוף יום לבקשת הלוואה' }); }
      const xfer = { date, splitId, workId, at: t, by: user.name };
      const out = putDoc('loan_requests', d.id, { ...d.data, xfer, updated: new Date(t).toISOString() }, { user, action: 'העברה לפיצול', item: d.data.name, note: 'תאריך עבודה ' + dmyT(date) });
      return { ok: true, xfer, version: out.version };
    }));
  });

  // ״אשר שההלוואה ניתנה ללקוח״
  r.post('/api/loan-req/give', (req, res, { user, body }) => {
    need(can.finance(user), 'אין לך הרשאה לאשר מסירה');
    return tx(() => once(body.opId, user, () => {
      const d = reqOf(body.id); const q = d.data;
      if (!q.xfer) throw err(409, 'הבקשה עוד לא הועברה לפיצול');
      if (q.given) return { ok: true, already: true, given: q.given, version: d.version }; // כבר אושרה — אין הוצאה נוספת
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
      const out = putDoc('loan_requests', d.id, { ...q, given, updated: new Date(t).toISOString() }, { user, action: 'אישור מסירת הלוואה', item: q.name, note: c + ' · ' + a + ' ₪' });
      logAudit({ user, action: 'מתן הלוואה', col: 'loan_requests', doc_id: d.id, item: q.name, after: given, note: c });
      return { ok: true, given, workId, version: out.version };
    }));
  });
}
