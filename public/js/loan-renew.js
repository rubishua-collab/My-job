// חידוש הלוואה: יתרת החוב של ההלוואה הקודמת (לפי התשלומים ששולמו בפועל) מקוזזת מההלוואה החדשה; ללקוח נמסר ההפרש.
// משותף לשרת (אישור המסירה, הרישום הכספי) ולמסכים (הכרטיס והטופס) — אותו חישוב בכל מקום.
// דוגמה: 5,000 ב-10 תשלומים של 750, שולמו 5 → יתרה 3,750. חידוש על 5,000 → ללקוח 1,250.
import { lnSchedule, lnPart, r2, num } from './calc.js';

// תנאי הלוואה (מהרכיב המשותף) + סכום/שם/תאריך → אובייקט הלוואה, כמו שנשמר ב״הלוואות״. משמש גם את השרת באישור המסירה
export function loanFromTerms(t, { amount, name = '', phone = '', date } = {}) {
  t = t || {};
  const L = { name, phone, amount: +amount, rate: parseFloat(t.rate), type: t.type === 'week' ? 'week' : 'month', date: date || t.date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }), mode: t.mode === 'pay' ? 'pay' : 'n', ...(t.first ? { first: t.first } : {}) };
  if (L.mode === 'pay') { L.payAmt = parseFloat(t.payAmt); const s = isNaN(L.rate) ? null : lnSchedule(L); L.n = s ? s.rows.length : 0; }
  else L.n = parseInt(t.n, 10);
  return L;
}
// צילום הלוח לשמירה בבקשה (מה שהוצג ונשלח ללקוח)
export function schedSnap(L) {
  const s = lnSchedule(L); if (!s) return null;
  return { pay: s.pay, totalPay: s.totalPay, totalInt: s.totalInt, n: s.rows.length, rows: s.rows.map(x => ({ i: x.i, date: x.date, open: x.open, payment: x.payment, interest: x.interest, principal: x.principal, close: x.close })) };
}

// יתרת החוב = סכום התשלומים שעוד לא שולמו (פחות תשלומים חלקיים שנרשמו עליהם)
export function loanOwe(L) {
  const s = L && lnSchedule(L); if (!s) return { owe: 0, rows: [] };
  const paid = L.paid || {}, rows = [];
  for (const x of s.rows) { if (paid[x.i]) continue; const left = r2(x.payment - lnPart(L, x.i).a); if (left > 0.004) rows.push({ i: x.i, left }); }
  return { owe: r2(rows.reduce((a, x) => a + x.left, 0)), rows };
}
// loans: (id) => הלוואה | null. מחזיר את שלושת הסכומים; אחרי המסירה — מה שנרשם בפועל (given)
export function renewCalc(q, loans) {
  const amount = r2(num(q && q.amount));
  if (q && q.given) return { kind: q.lk || 'new', amount: q.given.loanA != null ? q.given.loanA : amount, offset: q.given.offset || 0, hand: q.given.a != null ? q.given.a : amount, rows: [], prev: null };
  if (!q || q.lk !== 'renew') return { kind: 'new', amount, offset: 0, hand: amount, rows: [], prev: null };
  const prev = q.prevLoan ? loans(q.prevLoan) : null;
  if (!prev) return { kind: 'renew', amount, offset: 0, hand: amount, rows: [], prev: null, err: 'בחר את ההלוואה הקודמת שמחדשים' };
  if (prev.offsetBy && prev.offsetBy.req !== (q.id || q._id)) return { kind: 'renew', amount, offset: 0, hand: amount, rows: [], prev, err: 'ההלוואה הקודמת כבר קוזזה בחידוש אחר' };
  const O = loanOwe(prev);
  const hand = r2(amount - O.owe);
  return { kind: 'renew', amount, offset: O.owe, hand, rows: O.rows, prev, ...(hand < 0 ? { err: `יתרת החוב (${O.owe.toLocaleString('he-IL')} ₪) גדולה מסכום ההלוואה החדשה` } : {}) };
}
// תנאי ההחזר להלוואה החדשה: מהפירוט (״750 כפול 10״ / ״750 x 10״), אחרת מספר השיקים בלי ריבית (וסימון ״להשלמה״)
export function termsFrom(q, amount) {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(?:כפול|x|×|\*)\s*(\d{1,3})/i.exec(String(q.note || ''));
  if (m) { const pay = num(m[1].replace(/,/g, '')), n = +m[2]; if (pay > 0 && n >= 1) { const rate = solveRate(amount, pay, n); if (rate != null) return { n, rate }; } }
  const n = /^\d+$/.test(String(q.chk ?? '')) && +q.chk >= 1 ? +q.chk : 1;
  return { n, rate: 0, need: true };
}
// ריבית לתקופה (באחוזים) שבה n תשלומים של pay מחזירים את P. אם pay*n <= P — אין ריבית
export function solveRate(P, pay, n) {
  if (!(P > 0) || !(pay > 0) || !(n >= 1)) return null;
  if (pay * n <= P + 0.005) return 0;
  const f = (r) => P * r / (1 - Math.pow(1 + r, -n)) - pay;
  let lo = 1e-9, hi = 1; while (f(hi) < 0 && hi < 64) hi *= 2;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
  return Math.round(((lo + hi) / 2) * 100 * 1e6) / 1e6;
}
