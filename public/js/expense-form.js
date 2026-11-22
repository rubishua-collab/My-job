// טופס ״הוסף הוצאה״ — משותף ל״פיצול״ ול״איסוף יום״. מקלידים שם גובה (הצעות מרשימת הגובים בלבד — לא לקוחות),
// סכום ותיאור. ההוצאה נשמרת פעם אחת ברשימת איסוף היום של התאריך הפתוח (server/features/day-expense.js).
import { get, save, uid } from './api.js';
import { $, $$, esc, dmy, toast, openSheet } from './ui.js';
import { num, collKey, cleanColl, CHANGE, NOC_SP } from './calc.js';

let COLLS = null;
export async function collectorsList() {
  if (!COLLS) COLLS = (await get('/api/collectors').catch(() => [])).map(cleanColl).filter(c => c && c !== CHANGE && c !== NOC_SP);
  return COLLS;
}
// התאמות: שם מלא זהה → נבחר אוטומטית; אחרת הצעות (מתחיל ב… קודם, ואז מכיל)
export function matchCollectors(list, typed) {
  const q = collKey(typed); if (!q) return { exact: null, sugg: [] };
  const exact = list.filter(c => collKey(c) === q);
  const starts = list.filter(c => collKey(c) !== q && collKey(c).startsWith(q));
  const inside = list.filter(c => !collKey(c).startsWith(q) && collKey(c).includes(q));
  return { exact: exact.length === 1 ? exact[0] : null, sugg: exact.length > 1 ? exact : exact.concat(starts, inside).slice(0, 8) };
}

export async function openExpenseForm({ date, workId, onSaved }) {
  const list = await collectorsList();
  let chosen = '';
  const s = openSheet(`<div class="hd"><h2>הוסף הוצאה</h2><button class="x" data-close>×</button></div>
    <p class="small muted" style="margin:0">ההוצאה תשויך לרשימה של הגובה בתאריך ${dmy(date)} ותופיע גם ב״פיצול״ וגם ב״איסוף יום״.</p>
    <label class="f" style="margin-top:8px">שם הגובה<input class="in" id="xf-c" autocomplete="off" placeholder="התחל להקליד שם גובה" aria-describedby="xf-cs"></label>
    <div id="xf-cs" class="small" role="status" aria-live="polite"></div><div id="xf-sug" class="chips" style="margin:6px 0"></div>
    <div class="grid"><label class="f">סכום (₪)<input class="in n" id="xf-a" inputmode="decimal" placeholder="150"></label>
    <label class="f">על מה<input class="in" id="xf-n" placeholder="למשל דלק"></label></div>
    <div id="xf-err"></div><button class="btn xl" id="xf-save" style="width:100%;margin-top:10px">שמור הוצאה</button>`);
  const inp = $('#xf-c', s.el);
  const paint = () => {
    const m = matchCollectors(list, inp.value);
    if (m.exact) chosen = m.exact; else if (chosen && collKey(chosen) !== collKey(inp.value)) chosen = '';
    $('#xf-cs', s.el).innerHTML = chosen ? `<span class="ok-t">✓ נבחר הגובה: <b>${esc(chosen)}</b></span>` : (inp.value.trim() ? (m.sugg.length ? 'בחר גובה מהרשימה:' : '<span class="neg">אין גובה בשם הזה ברשימת הגובים</span>') : '');
    $('#xf-sug', s.el).innerHTML = chosen ? '' : m.sugg.map(c => `<button type="button" class="chip" data-xc="${esc(c)}">${esc(c)}</button>`).join('');
  };
  inp.addEventListener('input', paint);
  $('#xf-sug', s.el).addEventListener('click', (e) => { const b = e.target.closest('[data-xc]'); if (!b) return; chosen = b.dataset.xc; inp.value = chosen; paint(); $('#xf-a', s.el).focus(); });
  const opId = uid();
  $('#xf-save', s.el).onclick = async (ev) => {
    paint();
    const a = num($('#xf-a', s.el).value), n = $('#xf-n', s.el).value.trim(), err = (m) => { $('#xf-err', s.el).innerHTML = `<div class="note err">${esc(m)}</div>`; };
    if (!chosen) return err('בחר גובה מרשימת הגובים');
    if (!(a > 0)) return err('חסר סכום להוצאה');
    ev.target.disabled = true; ev.target.textContent = 'שומר…';
    try {
      const r = await save('POST', '/api/day-expense', { date, workId, c: chosen, a, n, opId }, { queue: false, label: 'הוספת הוצאה' });
      s.close(); toast(`ההוצאה נשמרה: ${chosen} · ${n || 'הוצאה'} — ${a.toLocaleString('he-IL')} ₪`); onSaved && onSaved(r);
    } catch (e) { ev.target.disabled = false; ev.target.textContent = 'שמור הוצאה'; err('השמירה נכשלה — נסה שוב. ' + (e.network ? 'אין קליטה.' : e.message)); }
  };
  setTimeout(() => inp.focus(), 50);
}
