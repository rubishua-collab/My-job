// דפי עבודה יומיים: ״פתיחת יום חדש״ ו״ניקוי הדף הנוכחי״ בכל טאב (חשבון בוקר, חשבון גובים, פיצול, איסוף יום)
// במקור היו בכל טאב ״חשבון חדש״ / ״רשימה חדשה״ שניקו טיוטה מקומית אחת. כאן כל יום נשמר בשרת כדף נפרד לפי תאריך,
// ולכן ״פתיחת יום חדש״ פותח דף לתאריך (קיים — נפתח הקיים, חדש — דף ריק), ו״ניקוי הדף הנוכחי״ מנקה רק את הדף והתאריך הפתוחים.
import { get, save, uid } from './api.js';
import { $, $$, esc, money, dmy, weekday, todayISO, toast, openSheet } from './ui.js';
import { calcMorning, calcCollectors, calcSplit, calcWork, wExpList, sum, normStatus } from './calc.js';

export const KIND_TAB = { morning: 'חשבון בוקר', collectors: 'חשבון גובים', split: 'פיצול', work: 'איסוף יום' };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// פתיחת דף לתאריך: אם כבר יש דף מאותו סוג באותו תאריך — פותחים אותו. אחרת נוצר דף ריק חדש (הסכומים מתחילים מאפס)
export async function openDay(kind, date) {
  const L = (await get('/api/accounts?kind=' + kind)).filter(a => a.date === date);
  if (L.length === 1) { location.hash = '#/acc/' + L[0].id; toast(`נפתח הדף הקיים של ${dmy(date)}`); return; }
  if (L.length > 1) {
    const s = openSheet(`<div class="hd"><h2>${KIND_TAB[kind]} · ${dmy(date)}</h2><button class="x" data-close>×</button></div>
      <p>יש ${L.length} דפים שמורים לתאריך הזה. איזה לפתוח?</p><div class="list">${L.map(a => `<a class="li noc link" href="#/acc/${a.id}" data-close style="text-decoration:none;color:inherit"><div class="t">${esc(a.title)}</div><div class="a">${a.headline ? money(a.headline.value) : ''}</div><div class="m"><span>${a.rows} שורות</span></div></a>`).join('')}</div>`);
    $$('a', s.el).forEach(x => x.addEventListener('click', () => s.close()));
    return;
  }
  location.hash = `#/new/${kind}?date=${date}&view=1`;
}

export function openDaySheet(kind, cur) {
  const def = cur && cur < todayISO() ? todayISO() : (cur ? addDays(cur, 1) : todayISO());
  const s = openSheet(`<div class="hd"><h2>פתיחת יום חדש · ${KIND_TAB[kind]}</h2><button class="x" data-close>×</button></div>
    <label class="f">בחר תאריך<input class="in" type="date" id="dd" value="${def}"></label>
    <div class="row" style="margin:8px 0">${[[-1, 'אתמול'], [0, 'היום'], [1, 'מחר']].map(([n, t]) => `<button class="chip" data-dn="${n}">${t} ${dmy(addDays(todayISO(), n))}</button>`).join('')}</div>
    <p class="small muted" id="ddinfo"></p>
    <button class="btn xl" id="ddgo" style="width:100%">פתח את הדף</button>
    <p class="small muted">תאריך חדש — נפתח דף נקי והסכומים מתחילים מאפס${kind === 'morning' ? ' (הקרן הקיימת מועברת אוטומטית מהקרן הסופית של החשבון הקודם)' : ''}. תאריך שכבר יש לו דף — נפתח הדף הקיים. דפים של ימים קודמים נשארים שמורים תחת התאריך שלהם.</p>`);
  const dd = $('#dd', s.el); let L = null;
  const info = async () => { L ||= await get('/api/accounts?kind=' + kind).catch(() => []); const n = L.filter(a => a.date === dd.value).length; $('#ddinfo', s.el).textContent = dd.value ? `${weekday(dd.value)} ${dmy(dd.value)}: ${n ? 'יש כבר דף שמור — הוא ייפתח' : 'אין דף — ייפתח דף נקי'}` : ''; };
  dd.onchange = info; info();
  $$('[data-dn]', s.el).forEach(b => b.onclick = () => { dd.value = addDays(todayISO(), +b.dataset.dn); info(); });
  $('#ddgo', s.el).onclick = () => { if (!dd.value) return; s.close(); openDay(kind, dd.value); };
}

// מעבר ליום הקודם / הבא שיש לו דף מאותו סוג
export async function stepDay(kind, date, dir) {
  const L = await get('/api/accounts?kind=' + kind);
  const ds = [...new Set(L.map(a => a.date))].sort();
  const t = dir < 0 ? ds.filter(d => d < date).pop() : ds.find(d => d > date);
  if (!t) { toast(dir < 0 ? 'אין דף מוקדם יותר' : 'אין דף מאוחר יותר'); return; }
  openDay(kind, t);
}

// מה בדיוק יימחק בכל טאב. keepMarked = באיסוף יום, להשאיר שורות שכבר סומנו (נאסף / לא נאסף / לעבור / לא ענו)
function plan(a, keepMarked) {
  const out = { lines: [], keep: [], apply: null };
  if (a.kind === 'morning') {
    const c = calcMorning(a); const pk = a.prev ? a.prev.final : null;
    out.lines = [`${(a.rows || []).length} שורות גבייה (ריבית ${money(c.interest)}, קרן ${money(c.principal)})`, `${(a.loans || []).filter(x => x && (x.n || +x.a)).length} הלוואות שיצאו (${money(c.loansTotal)})`, `משלוחים ${money(c.courier)}`];
    out.keep = [pk != null ? `הקרן הקיימת תחזור להיות הקרן הסופית של החשבון הקודם (${dmy(a.prev.date)}): ${money(pk)}` : `הקרן הקיימת (${money(+a.keren || 0)}) נשארת`];
    out.apply = d => { d.rows = []; d.loans = []; d.courier = 0; if (pk != null) d.keren = pk; delete d.fileTotals; delete d.raw; };
  } else if (a.kind === 'collectors') {
    const c = calcCollectors(a.entries || []);
    const nd = (a.entries || []).filter(e => e.k !== 'e').length, ne = (a.entries || []).filter(e => e.k === 'e').length;
    out.lines = [`${nd} שורות חוב/גבייה (${money(c.totalDebts)})`, `${ne} הוצאות (${money(c.totalExp)})`];
    out.apply = d => { d.entries = []; };
  } else if (a.kind === 'split') {
    const c = calcSplit(a.records || []);
    const moved = (a.xstash || []).length + (a.xmstash || []).length;
    out.lines = [`${(a.records || []).length} לקוחות ברשימת הפיצול (סה״כ ${money(c.all)})`, ...(moved ? [`${moved} שורות ששמורות בצד לצורך ״אפס העברה״`] : []), ...((a.xman || []).length ? [`${a.xman.length} שורות ידניות להעברה`] : [])];
    out.keep = ['רשימת האיסוף היומי לא משתנה — גם שורות שכבר הועברו אליה מהפיצול נשארות בה'];
    out.apply = d => { d.records = []; d.xstash = []; d.xmstash = []; d.xhide = []; d.xman = []; };
  } else if (a.kind === 'work') {
    const es = (a.entries || []).filter(e => e && (e.n || e.a)); const marked = es.filter(e => normStatus(e.s));
    const w = calcWork(es); const ex = sum(wExpList(a).map(x => x.a));
    const gone = keepMarked ? es.filter(e => !normStatus(e.s)) : es;
    out.lines = [`${gone.length} שורות איסוף${keepMarked && marked.length ? ' שעדיין לא סומנו' : ''} (מתוך ${es.length}, צפוי כולל ${money(w.total)})`, `${(a.expenses || []).length} הוצאות (${money(ex)})`];
    if (marked.length) out.keep = [keepMarked ? `${marked.length} שורות שכבר סומנו (נאסף ${money(w.gotTotal)}) נשארות` : `גם ${marked.length} שורות שכבר סומנו (נאסף ${money(w.gotTotal)}) יימחקו`];
    out.marked = marked.length;
    out.apply = d => { d.entries = keepMarked ? (d.entries || []).filter(e => e && normStatus(e.s)) : []; d.expenses = []; };
  }
  out.keep.push('שאר הטאבים, תשלומים שנרשמו, יתרות לקוחות, הלוואות, לקוחות, תבניות והגדרות לא משתנים', 'דפים של תאריכים אחרים לא משתנים');
  return out;
}

const clean = (a) => { const d = structuredClone(a); ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete d[k]); return d; };

export function clearPageSheet(ctx) {
  const a = ctx.a; let keepMarked = true;
  const s = openSheet(`<div class="hd"><h2>ניקוי הדף הנוכחי</h2><button class="x" data-close>×</button></div><div id="clbody"></div>`);
  const drawS = () => {
    const p = plan(a, keepMarked);
    $('#clbody', s.el).innerHTML = `<div class="note warn"><b>טאב: ${KIND_TAB[a.kind]}</b><br><b>תאריך: ${esc(weekday(a.date))} ${dmy(a.date)}</b> · ${esc(a.title || '')}</div>
      <h3>מה יימחק מהדף הזה בלבד</h3><ul>${p.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      ${p.marked ? `<label class="row" style="margin:6px 0;font-weight:700"><input type="checkbox" id="clkeep" class="ck" ${keepMarked ? 'checked' : ''}> להשאיר שורות שכבר סומנו (נאסף / לא נאסף / לעבור / לא ענו)</label>` : ''}
      <h3>מה נשאר</h3><ul>${p.keep.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="small muted">הניקוי נרשם ביומן השינויים, ואפשר לבטל אותו מיד בכפתור ״בטל ניקוי״ שיופיע.</p>
      <div id="clerr"></div><div class="row"><button class="btn danger xl" id="clgo" style="flex:2">אישור ניקוי</button><button class="btn ghost" id="clno" data-close style="flex:1">ביטול</button></div>`;
    const k = $('#clkeep', s.el); if (k) k.onchange = () => { keepMarked = k.checked; drawS(); };
    $('#clno', s.el).onclick = () => s.close();
    $('#clgo', s.el).onclick = async (ev) => {
      ev.target.disabled = true;
      const before = clean(a); const data = clean(a); p.apply(data);
      try {
        const r = await save('PUT', '/api/accounts/' + a.id, { data, baseVersion: a._version, opId: uid(), note: 'ניקוי הדף הנוכחי' }, { label: 'ניקוי ' + KIND_TAB[a.kind], queue: false });
        s.close(); await ctx.reload();
        undoToast(ctx, before, r.version);
      } catch (e) { ev.target.disabled = false; $('#clerr', s.el).innerHTML = `<div class="note err">${esc(e.status === 409 ? 'הדף עודכן בינתיים ממכשיר אחר. סגור, בדוק את הדף ונסה שוב.' : e.message)}</div>`; }
    };
  };
  drawS();
}

function undoToast(ctx, before, version) {
  document.getElementById('undoclr')?.remove();
  const el = document.createElement('div'); el.id = 'undoclr'; el.className = 'note ok no-print';
  el.style.cssText = 'position:fixed;inset-inline:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;display:flex;gap:8px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.2)';
  el.innerHTML = `<span style="flex:1">הדף נוקה (${KIND_TAB[before.kind]} · ${dmy(before.date)})</span><button class="btn sm" id="undogo">בטל ניקוי</button><button class="x" id="undox" aria-label="סגור">×</button>`;
  document.body.appendChild(el);
  const t = setTimeout(() => el.remove(), 20000);
  $('#undox', el).onclick = () => { clearTimeout(t); el.remove(); };
  $('#undogo', el).onclick = async () => {
    clearTimeout(t);
    try { await save('PUT', '/api/accounts/' + ctx.id, { data: before, baseVersion: version, opId: uid(), note: 'ביטול ניקוי' }, { label: 'ביטול ניקוי', queue: false }); el.remove(); await ctx.reload(); toast('הניקוי בוטל, הדף חזר'); }
    catch (e) { el.querySelector('span').textContent = 'הביטול נכשל: ' + e.message; }
  };
  addEventListener('hashchange', () => { clearTimeout(t); el.remove(); }, { once: true });
}
