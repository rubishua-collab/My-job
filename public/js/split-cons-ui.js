// ״פירוט חובות״ של שורה מאוחדת בפיצול: כל שורת מקור מהאקסל — סכום, הגובה שהופיע בקובץ והערה — והסה״כ.
import { esc, money, openSheet } from './ui.js';
import { num, r2, sum } from './calc.js';

export const consBtn = (r) => r && r.cons && Array.isArray(r.src) ? `<button type="button" class="btn ghost sm consd" data-consd="${esc(r._k)}" aria-label="פירוט חובות של ${esc(r.n)}">פירוט חובות (${r.src.length})</button>` : '';
export function openConsDetail(r) {
  if (!r || !Array.isArray(r.src)) return;
  const tot = r2(sum(r.src.map(x => num(x.a))));
  openSheet(`<div class="hd"><h2>פירוט חובות · ${esc(r.n)}</h2><button class="x" data-close>×</button></div>
    <p class="small muted" style="margin:0 0 6px">השורות מהקובץ שאוחדו לשורת גבייה אחת. הגבייה כולה אצל: <b>${esc(String(r.c || '').trim() || 'ללא גובה — בחר גובה בשורה')}</b>.</p>
    <div class="tbl-wrap"><table class="consd-t"><thead><tr><th>#</th><th class="a">סכום</th><th>גובה באקסל</th><th>הערה</th></tr></thead><tbody>
    ${r.src.map((x, i) => `<tr><td>${i + 1}</td><td class="a">${money(num(x.a))}</td><td>${esc(String(x.c || '').trim() || 'ללא גובה')}</td><td style="white-space:pre-wrap">${esc(x.note || '') || '—'}</td></tr>`).join('')}
    </tbody><tfoot><tr><td><b>סה״כ</b></td><td class="a"><b>${money(tot)}</b></td><td colspan="2" class="small muted">${r.src.length} שורות${tot !== r2(num(r.a)) ? ` · <span class="neg">הסכום בשורה ${money(num(r.a))}</span>` : ''}</td></tr></tfoot></table></div>
    <button class="btn xl" data-close style="width:100%;margin-top:10px">סגירה</button>`);
}
