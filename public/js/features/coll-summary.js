// ״סיכום גובים לסוף היום״ בתוך ״איסוף יום״ — במקום ״העבר לחשבון גובים״. מחושב ישירות מהאיסוף (אותם נתונים, בלי העתקה):
// לכל גובה — צפוי, נגבה בפועל, הוצאות, נטו למסירה (נגבה בפועל פחות הוצאות — הנטו הרשמי, באישור בעל התוכנה) ונשאר;
// ובקטן, לתקופת המעבר, ״צפוי פחות הוצאות״ כמו בחשבון גובים של התוכנה הקודמת. PDF לוואטסאפ של כל הסיכום.
import { accountPanel } from '../registry.js';
import { $, esc, dmy, weekday } from '../ui.js';
import { App } from '../app.js';
import { r2, sum, num, cleanColl, collKey, workGroups, wExpList, calcWork, NOC_SP } from '../calc.js';
import { RSEAL } from './work-tools-lib.js';
import { ensureStyle, sharePdf } from './work-tools-pdf.js';

const m = (n) => `<span class="money${(+n || 0) < 0 ? ' neg' : ''}">${(Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 })} ₪</span>`;

// אותה חלוקה לגובים כמו בכרטיסי הגובים במסך (workView)
export function collSummary(a) {
  const es = (a.entries || []).filter(e => e && (e.n || e.a)), xs = wExpList(a);
  let gs = workGroups(es, xs);
  if (!gs) {
    const names = [...new Map(xs.filter(x => collKey(x.c)).map(x => [collKey(x.c), cleanColl(x.c)])).values()];
    gs = es.length || !names.length ? [{ name: '', calc: calcWork(es), exp: xs, expTotal: sum(xs.map(x => x.a)) }]
      : names.map(n => { const xl = xs.filter(x => collKey(x.c) === collKey(n)); return { name: n, calc: calcWork([]), exp: xl, expTotal: sum(xl.map(x => x.a)) }; });
  }
  const rows = gs.map(g => ({ c: g.name || 'איסוף', n: g.calc.count, exp: r2(g.calc.total), got: r2(g.calc.gotTotal), x: r2(g.expTotal), net: r2(g.calc.gotTotal - g.expTotal), left: r2(g.calc.left), old: r2(g.calc.total - g.expTotal) }));
  const T = { c: 'סה״כ', n: sum(rows.map(r => r.n)), exp: r2(sum(rows.map(r => r.exp))), got: r2(sum(rows.map(r => r.got))), x: r2(sum(rows.map(r => r.x))), left: r2(sum(rows.map(r => r.left))) };
  T.net = r2(T.got - T.x); T.old = r2(T.exp - T.x);
  return { rows, T };
}
function summaryHTML(a) {
  const { rows, T } = collSummary(a);
  const tr = (r, tot) => `<tr class="${tot ? 'tot' : ''}"><td>${esc(r.c)}${tot ? '' : `<div class="cs-sub">${r.n} לקוחות · צפוי ${m(r.exp)}</div>`}</td><td class="a">${m(r.got)}</td><td class="a">${m(r.x)}</td><td class="a"><b>${m(r.net)}</b></td><td class="a">${m(r.left)}</td></tr>
    <tr class="cs-old${tot ? ' tot2' : ''}"><td colspan="5">צפוי פחות הוצאות (החישוב של התוכנה הקודמת): ${m(r.old)}</td></tr>`;
  return `<table class="rt cs-t"><thead><tr><th>גובה</th><th class="a">נגבה בפועל</th><th class="a">הוצאות</th><th class="a">נטו למסירה</th><th class="a">נשאר</th></tr></thead><tbody>${rows.map(r => tr(r)).join('')}</tbody><tfoot>${tr(T, true)}</tfoot></table>`;
}
function pdfHTML(a) {
  return '<header class="rhead">' + RSEAL + '<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">סיכום גובים לסוף היום</h2><div class="rsub">' + esc(weekday(a.date)) + ' · ' + esc(dmy(a.date)) + '</div></div></header>' +
    '<section class="rs">' + summaryHTML(a) + '</section><p class="cs-note">נטו למסירה = נגבה בפועל פחות הוצאות. ״נשאר״ = מה שעוד לא נגבה (כולל יתרה של גבייה חלקית).</p>';
}
function pdfText(a) {
  const { rows, T } = collSummary(a);
  return `סיכום גובים · ${dmy(a.date)}\n` + rows.map(r => `${r.c}: נגבה ${r.got.toLocaleString('he-IL')} ₪ · הוצאות ${r.x.toLocaleString('he-IL')} ₪ · נטו למסירה ${r.net.toLocaleString('he-IL')} ₪${r.left ? ` · נשאר ${r.left.toLocaleString('he-IL')} ₪` : ''}`).join('\n') + `\nסה״כ נטו למסירה: ${T.net.toLocaleString('he-IL')} ₪`;
}
const CSS = `.cs-t td,.cs-t th{padding:7px 8px}.cs-t .cs-sub{font-size:12.5px;color:var(--muted,#667)}.cs-t tr.cs-old td{font-size:12.5px;color:var(--muted,#667);padding-top:0;border-top:0}
.cs-card .tbl-wrap{overflow-x:visible}.cs-card table{width:100%}@media (max-width:520px){.cs-t td,.cs-t th{padding:6px 4px;font-size:13.5px}}
.report .cs-note{font-size:13px;color:#555;margin-top:8px}`;
let styled = false; const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };

accountPanel('work', (ctx) => {
  if (!App.can.finance) return '';
  const a = ctx.a; if (!(a.entries || []).some(e => e && (e.n || e.a)) && !(a.expenses || []).some(x => x && (x.n || x.a))) return '';
  style();
  return `<div class="card cs-card no-print" id="cs-card"><div class="row sp"><h2>סיכום גובים לסוף היום</h2><span class="small muted">במקום ״העבר לחשבון גובים״ — מחושב מהאיסוף</span></div>
    <div class="tbl-wrap">${summaryHTML(a)}</div>
    <p class="small muted" style="margin:6px 0">נטו למסירה = מה שנגבה בפועל פחות ההוצאות של הגובה. ״נשאר״ = מה שעוד לא נגבה (כולל יתרה של גבייה חלקית). כל שינוי באיסוף (״נאסף״, תשלום חלקי, הוצאה) מתעדכן כאן מיד.</p>
    <div class="row"><button class="btn ghost sm" type="button" id="cs-pdf">PDF סיכום גובים לוואטסאפ</button></div><div id="cs-share" style="margin-top:8px"></div></div>`;
}, (ctx) => {
  const b = $('#cs-pdf', ctx.view); if (!b) return;
  b.onclick = () => { ensureStyle(); const a = ctx.a; sharePdf(pdfHTML(a), { ...a, coll: 'סיכום גובים' }, pdfText(a), $('#cs-share', ctx.view), b); };
});
