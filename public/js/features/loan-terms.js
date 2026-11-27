// רכיב תנאי ההלוואה ולוח הסילוקין — משותף ל״הלוואות״ (+ הלוואה חדשה) ול״בקשות להלוואה״ (בקשה חדשה / עריכה).
// אותו חישוב (lnSchedule מ-calc.js) ואותה תצוגה בשני המסכים: אותם נתונים → בדיוק אותו לוח.
// תנאים: סוג (חודשית / שבועית), ריבית לתקופה, חישוב לפי מספר תשלומים או לפי החזר קבוע, ותאריך תשלום ראשון (לא חובה).
import { $, esc } from '../ui.js';
import { lnSchedule, lnR2 } from '../calc.js';
import { lnFmt, lnMoney, lnD } from './loans-pdf.js';
import { loanFromTerms } from '../loan-renew.js';

// מזהים: במסך ההלוואות — המזהים הקיימים (בדיקות ותיעוד); בשאר — לפי קידומת
const LNID = { segM: 'ln-seg-m', segW: 'ln-seg-w', segN: 'ln-seg-n', segP: 'ln-seg-p', rate: 'ln-f-rate', rateL: 'ln-rate-l', n: 'ln-f-n', pay: 'ln-f-pay', payL: 'ln-pay-l', lN: 'ln-l-n', lP: 'ln-l-p', first: 'ln-f-first', prev: 'ln-prev', sched: 'ln-sched', schedW: 'ln-sched-wrap' };
const idOf = (px) => (k) => px === 'ln' ? LNID[k] : px + '-' + k;

export function termsFieldsHTML(px) {
  const I = idOf(px);
  return `<div class="ln-fld"><span>סוג</span><div class="ln-seg" role="group" aria-label="תדירות ההחזר"><button type="button" id="${I('segM')}" aria-pressed="true">חודשית</button><button type="button" id="${I('segW')}" aria-pressed="false">שבועית</button></div></div>
      <label class="ln-fld" for="${I('rate')}"><span id="${I('rateL')}">ריבית לחודש (%)</span><input class="in n" id="${I('rate')}" type="number" inputmode="decimal" min="0" step="any"></label>
      <div class="ln-fld"><span>חישוב לפי</span><div class="ln-seg" role="group" aria-label="חישוב לפי"><button type="button" id="${I('segN')}" aria-pressed="true">מספר תשלומים</button><button type="button" id="${I('segP')}" aria-pressed="false">החזר קבוע</button></div></div>
      <label class="ln-fld" for="${I('n')}" id="${I('lN')}">מספר תשלומים<input class="in n" id="${I('n')}" type="number" inputmode="numeric" min="1" step="1"></label>
      <label class="ln-fld" for="${I('pay')}" id="${I('lP')}" hidden><span id="${I('payL')}">החזר חודשי קבוע (₪)</span><input class="in n" id="${I('pay')}" type="number" inputmode="decimal" min="0" step="any"></label>
      <label class="ln-fld" for="${I('first')}">תאריך תשלום ראשון<input class="in" id="${I('first')}" type="date"><span class="small muted" style="font-weight:400">ריק = חודש / שבוע אחרי מתן ההלוואה</span></label>`;
}
export function termsOutHTML(px) {
  const I = idOf(px);
  return `<div class="ln-prev" id="${I('prev')}" aria-live="polite"></div>
    <div id="${I('schedW')}" hidden><h3 style="margin-bottom:8px">לוח הסילוקין</h3><div class="tbl-wrap ln-sched" id="${I('sched')}"></div></div>`;
}
// סיכום ולוח — אותה תצוגה בכל מקום
export function summaryHTML(L, s) {
  const unit = L.type === 'month' ? 'חודשי' : 'שבועי', last = s.rows[s.rows.length - 1];
  const it = (l, v) => '<div><span>' + l + '</span><b class="num">' + v + '</b></div>';
  let h = it('תשלום ' + unit + ' קבוע', lnFmt(s.pay)) + it('מספר תשלומים', s.rows.length) + it('סה״כ ריבית', lnFmt(s.totalInt)) + it('סה״כ להחזר', lnFmt(s.totalPay)) + it('תשלום ראשון', lnD(s.rows[0].date)) + it('תאריך התשלום האחרון', lnD(last.date));
  if (L.mode === 'pay') h += it('תשלום אחרון (סוגר)', lnFmt(last.payment));
  return h;
}
export function tableHTML(L, s) {
  return '<table class="ln-tbl"><thead><tr><th>#</th><th>תאריך</th><th>יתרת פתיחה</th><th>תשלום</th><th>ריבית</th><th>קרן</th><th>יתרת סגירה</th></tr></thead><tbody>' +
    s.rows.map(x => '<tr><td><span class="num">' + x.i + '</span></td><td><span class="num">' + lnD(x.date) + '</span></td><td>' + lnMoney(x.open) + '</td><td>' + lnMoney(x.payment) + '</td><td>' + lnMoney(x.interest) + '</td><td>' + lnMoney(x.principal) + '</td><td>' + lnMoney(x.close) + '</td></tr>').join('') +
    '</tbody><tfoot><tr><td colspan="3">סה״כ</td><td>' + lnMoney(s.totalPay) + '</td><td>' + lnMoney(s.totalInt) + '</td><td>' + lnMoney(L.amount) + '</td><td></td></tr></tfoot></table>';
}
export const loanFrom = loanFromTerms;

// חיבור הרכיב: ctx.base() → {amount, name, phone, date}; ctx.onChange(terms, L, s) אחרי כל שינוי
export function mountTerms(root, px, ctx = {}) {
  const I = idOf(px), q = (k) => root.querySelector('#' + I(k)) || $('#' + I(k));
  const T = { type: 'month', mode: 'n' };
  const get = () => ({ type: T.type, mode: T.mode, rate: q('rate').value, n: q('n').value, payAmt: q('pay').value, first: q('first').value });
  const loan = () => loanFrom(get(), ctx.base ? ctx.base() : {});
  const render = () => {
    const L = loan(), s = isNaN(L.rate) ? null : lnSchedule(L), box = q('prev');
    if (!s) {
      let m = L.mode === 'pay' ? 'מלא סכום, ריבית והחזר קבוע כדי לראות את החישוב' : 'מלא סכום, ריבית ומספר תשלומים כדי לראות את החישוב', bad = false;
      if (L.mode === 'pay' && L.amount > 0 && !isNaN(L.rate) && L.payAmt > 0 && L.payAmt <= lnR2(L.amount * L.rate / 100)) { m = 'ההחזר נמוך מדי: הריבית הראשונה היא ' + lnFmt(lnR2(L.amount * L.rate / 100)) + ', ההחזר חייב להיות גבוה ממנה כדי שהקרן תרד'; bad = true; }
      box.innerHTML = '<div class="msg' + (bad ? ' bad' : '') + '">' + esc(m) + '</div>'; q('schedW').hidden = true; q('sched').innerHTML = '';
    } else { box.innerHTML = summaryHTML(L, s); q('schedW').hidden = false; q('sched').innerHTML = tableHTML(L, s); }
    if (ctx.onChange) ctx.onChange(get(), L, s);
  };
  const setType = (t) => { T.type = t; q('segM').setAttribute('aria-pressed', String(t === 'month')); q('segW').setAttribute('aria-pressed', String(t === 'week')); q('rateL').textContent = t === 'month' ? 'ריבית לחודש (%)' : 'ריבית לשבוע (%)'; q('payL').textContent = t === 'month' ? 'החזר חודשי קבוע (₪)' : 'החזר שבועי קבוע (₪)'; render(); };
  const setMode = (m) => { T.mode = m; q('segN').setAttribute('aria-pressed', String(m === 'n')); q('segP').setAttribute('aria-pressed', String(m === 'pay')); q('lN').hidden = m !== 'n'; q('lP').hidden = m !== 'pay'; render(); };
  const set = (t = {}) => { q('rate').value = t.rate ?? ''; q('n').value = t.n ?? ''; q('pay').value = t.payAmt ?? ''; q('first').value = t.first || ''; T.type = t.type || 'month'; T.mode = t.mode || 'n'; setType(T.type); setMode(T.mode); };
  q('segM').onclick = () => setType('month'); q('segW').onclick = () => setType('week');
  q('segN').onclick = () => setMode('n'); q('segP').onclick = () => setMode('pay');
  ['rate', 'n', 'pay', 'first'].forEach(k => q(k).addEventListener('input', render));
  return { get, set, render, loan, setType, setMode, state: T };
}
