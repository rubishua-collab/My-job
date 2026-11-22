// ״מחיקת רישום״: מחיקת רישום שמור וביטול ההשפעה שלו על החשבון (בשרת, בטרנזקציה אחת — ראה server/features/acc-remove.js)
import { get, save, uid } from './api.js';
import { $, esc, money, dmy, weekday, toast, openSheet } from './ui.js';

export async function openRemoveSheet(id, onDone) {
  let p;
  try { p = await get(`/api/accounts/${encodeURIComponent(id)}/remove-plan`); }
  catch (e) { toast(e.message); return; }
  const fx = p.kind === 'morning'
    ? (!p.delta
      ? `<li>הרישום לא שינה את הקרן (קרן קיימת ${money(p.keren)} = קרן סופית ${money(p.final)}). הקרן שהועברה נשארת בחשבון, ושום חשבון אחר לא משתנה.</li>`
      : `<li>השורות ברישום שינו את הקרן ב־<b>${money(p.delta)}</b>. השינוי הזה יבוטל פעם אחת:</li>
         ${p.adjust.length ? p.adjust.map(x => `<li>״${esc(x.title)}״ (${dmy(x.date)}): קרן קיימת ${money(x.from)} ← <b>${money(x.to)}</b>, קרן סופית ${money(x.finalFrom)} ← <b>${money(x.finalTo)}</b></li>`).join('') : '<li>אין חשבון בוקר מאוחר יותר — הקרן הנוכחית תחזור להיות הקרן הסופית של החשבון הקודם.</li>'}
         ${p.stop ? `<li>״${esc(p.stop.title)}״ (${dmy(p.stop.date)}) והחשבונות שאחריו לא משתנים — הקרן הקיימת שם (${money(p.stop.keren)}) הוזנה בנפרד ולא הועברה מהרישום הזה.</li>` : ''}`)
    : `<li>הסיכומים, יתרות הלקוחות, מסך ״היום״ והדוחות יחושבו מחדש בלי השורות של הרישום הזה.</li>${p.kind === 'work' ? '<li>אם הועברו לרשימה הזו שורות מהפיצול, הן נשארות שמורות בפיצול ואפשר להחזיר אותן שם ב״אפס העברה״.</li>' : ''}`;
  const s = openSheet(`<div class="hd"><h2>מחיקת רישום</h2><button class="x" data-close>×</button></div>
    <div class="note warn"><b>${esc(p.title || p.kindName)}</b><br>${esc(p.kindName)} · ${esc(weekday(p.date))} ${dmy(p.date)} · ${p.rows} שורות</div>
    <p style="font-weight:800;font-size:18px">למחוק את הרישום ולבטל את השינויים שהוא יצר בחשבון?</p>
    <ul>${fx}<li>חשבונות אחרים מאותו תאריך ורישומים שנעשו אחריו נשארים כמו שהם.</li><li>אחרי המחיקה אפשר לפתוח מחדש ${esc(p.kindName)} לאותו תאריך בכפתור ״פתיחת יום חדש״.</li></ul>
    <div id="rmerr"></div>
    <div class="row"><button class="btn ghost xl" id="rmno" style="flex:1">ביטול</button><button class="btn danger xl" id="rmgo" style="flex:1">מחק רישום</button></div>`);
  $('#rmno', s.el).onclick = () => s.close();
  const opId = uid();
  $('#rmgo', s.el).onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'מוחק…';
    try {
      const r = await save('POST', `/api/accounts/${encodeURIComponent(id)}/remove`, { opId, baseVersion: p.version }, { label: 'מחיקת רישום', queue: false });
      s.close();
      toast(r.already ? 'הרישום כבר נמחק' : (r.adjusted && r.adjusted.length ? `הרישום נמחק · הקרן עודכנה ב־${r.adjusted.length} חשבונות בוקר` : 'הרישום נמחק'));
      onDone && onDone(r);
    } catch (e) {
      ev.target.disabled = false; ev.target.textContent = 'מחק רישום';
      $('#rmerr', s.el).innerHTML = `<div class="note err">${esc(e.network ? 'אין קליטה — הרישום לא נמחק. לחץ שוב ״מחק רישום״ (המחיקה לא תתבצע פעמיים).' : e.message)}</div>`;
    }
  };
}
