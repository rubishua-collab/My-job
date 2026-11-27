// ״פירוט הלוואות שנמסרו״ — תיבה בסוף ה-PDF של כל חשבון איסוף יום (״PDF לוואטסאפ״ מהאיסוף, מתצוגת חשבון שמור
// ומ״שליחת PDF״ ברשימת החשבונות). לתצוגה בלבד: לא נספרת בסיכומים — הוצאת ״מתן הלוואה״ כבר בהוצאות השמורות.
// כל הלוואה לפי מזהה הבקשה, כך ששתי הלוואות לאותו לקוח מקבלות כל אחת את הפירוט שלה.
import { esc, fmt, dmy } from '../ui.js';

export const chkOk = (v) => /^\d+$/.test(String(v ?? '').trim()) && +v >= 1;
// html2canvas לא מסדר נכון שורה שמערבבת מספרים ועברית — כל מילה בתיבה נפרדת, ומספרים בתוך .num (LTR)
const words = (t) => String(t == null ? '' : t).split('\n').map(line => '<div class="lgv-ln">' + (line.trim() ? line.split(/\s+/).filter(Boolean).map(w => '<span class="lgv-w">' + esc(w) + '</span>').join(' ') : '&nbsp;') + '</div>').join('');
const num = (s) => '<span class="num">' + esc(s) + '</span>';

export function loansBoxHTML(list) {
  const seen = new Set();
  const L = (list || []).filter(q => q && q.given && q.id && !seen.has(q.id) && seen.add(q.id));
  if (!L.length) return '';
  return '<section class="rs lgv"><div class="lgv-box"><div class="lgv-h">פירוט הלוואות שנמסרו <span class="lgv-n">(' + L.length + ')</span></div>' +
    L.map(q => {
      const a = q.given.a != null ? q.given.a : q.amount;
      const chk = chkOk(q.chk) ? '<span class="lgv-w lgv-chk">מספר שיקים: ' + num(String(+q.chk)) + '</span>' : '<span class="lgv-w lgv-chk lgv-miss">מספר שיקים לא הוזן</span>';
      return '<div class="rl lgv-i" data-lr="' + esc(q.id) + '"><div class="lgv-top"><b class="lgv-nm">' + esc(q.name) + '</b><b class="lgv-a">' + num(fmt(a) + ' ₪') + '</b></div>' +
        (q.given.offset ? '<div class="lgv-m"><span class="lgv-w">חידוש: הלוואה ' + num(fmt(q.given.loanA) + ' ₪') + '</span> · <span class="lgv-w">קיזוז חוב קודם ' + num(fmt(q.given.offset) + ' ₪') + '</span></div>' : '') +
        '<div class="lgv-m"><span class="lgv-w">נמסר ע״י <b>' + esc(q.given.c) + '</b></span> · <span class="lgv-w">תאריך הבקשה ' + num(dmy(q.date)) + '</span> · <span class="lgv-w">שעת מסירה ' + num(q.given.t || '') + '</span></div>' +
        '<div class="lgv-note" data-note="' + esc(q.note || '') + '">' + (String(q.note || '').trim() ? '<div class="lgv-pt">' + words(q.note) + '</div>' : '') + '<div class="lgv-ln">' + chk + '</div></div></div>';
    }).join('') + '</div></section>';
}
// מאילו בקשות: אלה שהשרת צירף לחשבון (_lreq), רק שאושרו ונמסרו
export const givenOf = (a) => ((a && (a.loans || a._lreq)) || []).filter(q => q && q.given);

export const LGV_CSS = `
.report .lgv{margin-top:22px;padding-top:4px}
.report .lgv-box{font-variant-numeric:normal;direction:rtl;text-align:right;width:62%;margin-inline-end:auto;border:1.5px solid #1e4d8f;border-radius:10px;padding:10px 14px;background:#f6f9fd;font-size:16px;line-height:1.45}
.report .lgv-h{font-weight:800;font-size:17px;color:#163a6b;margin-bottom:4px}.report .lgv-n{font-weight:600;color:#555}
.report .lgv-i{padding:7px 0;border-top:1px solid #d6e0ee}.report .lgv-i:first-of-type{border-top:0}
.report .lgv-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.report .lgv-nm{font-size:17px}.report .lgv-a{white-space:nowrap;font-size:17px}
.report .lgv-w{display:inline-block;unicode-bidi:isolate;white-space:nowrap}.report .lgv .num{font-variant-numeric:normal}
.report .lgv-m{font-size:14px;color:#444}
.report .lgv-note{overflow-wrap:anywhere;font-size:15px;margin-top:3px;padding:3px 8px;background:#fff;border:1px solid #d6e0ee;border-radius:6px}
.report .lgv-chk{font-weight:700;color:#163a6b}.report .lgv-miss{color:#9a5b00}
.report .lgv-pt+.lgv-ln{margin-top:2px;border-top:1px dashed #d6e0ee;padding-top:2px}`;
let cssDone = false;
export function lgvStyle() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = LGV_CSS; document.head.appendChild(s); }
