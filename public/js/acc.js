// חשבונות: חשבון בוקר, פיצול, חשבון גובים, איסוף יום
import { get, save, uid } from './api.js';
import { $, $$, esc, fmt, money, dmy, weekday, todayISO, when, toast, openSheet, viewState } from './ui.js';
import { App, onLive } from './app.js';
import { calcMorning, calcCollectors, calcSplit, workGroups, calcWork, wExpList, normName, num, r2, sum, collKey, cleanColl, normStatus, normTime, CHANGE, NOC_SP } from './calc.js';
import { normPhone, phoneProblem, fmtPhone } from './phone.js';
import { openSendSheet } from './wa-ui.js';
import { openPrivate } from './features/wa-private.js';
import { R } from './registry.js';
import { openDaySheet, clearPageSheet, stepDay } from './day-tools.js';
import { openRemoveSheet } from './acc-remove.js';
import { openPdfSheet } from './acc-pdf.js';
import { mgGroups, mgTotal, customerCount, unmerge, partStatus, collNotes, collShare } from './split-merge.js';
import { SaveCtl, watchHeader, paintSave } from './savectl.js';
import { timesHTML } from './acc-times.js';
import { openExpenseForm } from './expense-form.js';

const KINDS = { morning: 'חשבון בוקר', split: 'פיצול', collectors: 'חשבון גובים', work: 'איסוף יום' };

export async function renderAccounts(view) {
  const vs = viewState.get('accounts');
  const my = App.nav;
  const L = await get('/api/accounts');
  if (App.nav !== my) return;
  const kind = vs.kind || '';
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow" id="acount">${L.length} חשבונות שמורים</div><h1>חשבונות</h1></div>
    ${App.can.finance ? `<button class="btn sm" id="newday">פתיחת יום חדש</button> <button class="btn sm" id="newacc">+ חשבון חדש</button>` : ''}</div>
    <div class="search"><input class="in" id="aq" type="search" placeholder="חיפוש לפי תאריך או כותרת…" value="${esc(vs.q || '')}"></div>
    <div class="chips" style="margin-bottom:10px">${[['', 'הכול'], ...Object.entries(KINDS)].map(([k, t]) => `<button class="chip" data-k="${k}" aria-pressed="${kind === k}">${t}</button>`).join('')}</div>
    <div id="alist"></div>`;
  const draw = () => {
    const q = $('#aq').value.trim(); const k = viewState.get('accounts').kind || '';
    const rows = L.filter(a => (!k || a.kind === k) && (!q || (a.title + ' ' + dmy(a.date) + ' ' + a.date).includes(q)));
    const canDel = App.me && App.me.role === 'owner';
    $('#acount').textContent = L.length + ' חשבונות שמורים';
    $('#alist').innerHTML = rows.length ? `<div class="list">${rows.map(a => `<div class="accrow" data-id="${a.id}"><a class="li noc link" href="#/acc/${a.id}" style="text-decoration:none;color:inherit"><div class="t">${esc(a.title || KINDS[a.kind])} <span class="pill ${a.kind === 'morning' ? 'acc' : a.kind === 'work' ? 'ok' : a.kind === 'collectors' ? 'warn' : ''}">${KINDS[a.kind]}</span></div>
      <div class="a">${a.headline ? money(a.headline.value) + `<div class="small muted">${esc(a.headline.label)}</div>` : ''}</div>
      <div class="m"><span>${esc(weekday(a.date))} ${dmy(a.date)}</span><span>${a.rows} שורות</span><div class="acctimes" data-times="${a.id}">${timesHTML(a.times)}</div></div></a><div class="accbtns"><button class="accpdf" data-pdf="${a.id}" aria-label="שליחת PDF ${esc(a.title || '')}">שליחת<br>PDF</button>${canDel ? `<button class="accdel" data-rm="${a.id}" aria-label="מחיקת רישום ${esc(a.title || '')}">מחיקת<br>רישום</button>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">לא נמצאו חשבונות</div>';
  };
  $('#alist').onclick = (e) => {
    const pb = e.target.closest('[data-pdf]'); if (pb) { e.preventDefault(); openPdfSheet(pb.dataset.pdf); return; }
    const b = e.target.closest('[data-rm]'); if (!b) return;
    e.preventDefault();
    openRemoveSheet(b.dataset.rm, () => { const i = L.findIndex(x => x.id === b.dataset.rm); if (i >= 0) L.splice(i, 1); draw(); });
  };
  $('#aq').oninput = () => { viewState.set('accounts', { q: $('#aq').value }); draw(); };
  $$('.chip', view).forEach(b => b.onclick = () => { viewState.set('accounts', { kind: b.dataset.k }); $$('.chip', view).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  const ndb = $('#newday'); if (ndb) ndb.onclick = () => {
    const k = viewState.get('accounts').kind;
    if (k) return openDaySheet(k);
    const s = openSheet(`<div class="hd"><h2>פתיחת יום חדש</h2><button class="x" data-close>×</button></div><p>באיזה טאב?</p><div class="grid" style="grid-template-columns:1fr">${Object.entries(KINDS).map(([k, t]) => `<button class="btn ghost xl" data-dk="${k}">${t}</button>`).join('')}</div>`);
    $$('[data-dk]', s.el).forEach(b => b.onclick = () => { s.close(); openDaySheet(b.dataset.dk); });
  };
  const nb = $('#newacc'); if (nb) nb.onclick = () => {
    const s = openSheet(`<div class="hd"><h2>חשבון חדש</h2><button class="x" data-close>×</button></div><div class="grid" style="grid-template-columns:1fr">
      <label class="f">תאריך<input class="in" type="date" id="nd" value="${todayISO()}"></label>
      ${Object.entries(KINDS).map(([k, t]) => `<button class="btn ghost xl" data-nk="${k}">${t}</button>`).join('')}</div>`);
    $$('[data-nk]', s.el).forEach(b => b.onclick = () => { const d = $('#nd', s.el).value; s.close(); location.hash = `#/new/${b.dataset.nk}?date=${d}`; });
  };
  draw();
}

export async function renderNew(view, [kind], q) {
  view.innerHTML = '<div class="boot">פותח חשבון…</div>';
  // מזהה הפעולה נשמר לפי הכתובת, כך שרענון או לחיצה כפולה לא יוצרים חשבון נוסף
  const k = 'newop:' + kind + ':' + (q.get('date') || '');
  let op = sessionStorage.getItem(k); if (!op) { op = uid(); sessionStorage.setItem(k, op); }
  const r = await save('POST', '/api/accounts', { kind, date: q.get('date') || todayISO(), opId: op }, { label: 'פתיחת חשבון' });
  sessionStorage.removeItem(k);
  location.replace(q.get('view') === '1' ? `#/acc/${r.id}` : `#/acc/${r.id}?edit=1`);
}

// ---------- מסך חשבון ----------
let LAST_ACC = null;
export async function renderAccount(view, [id], q) {
  const my = App.nav;
  if (LAST_ACC !== id) { const v = viewState.get('acc:' + id); if (v.sel && v.sel.length) viewState.set('acc:' + id, { sel: [] }); } LAST_ACC = id;
  const a = await get('/api/accounts/' + id);
  if (App.nav !== my) return; // בינתיים עברו למסך אחר (למשל לעריכה) — לא מציירים מעליו
  const st = viewState.get('acc:' + id);
  const ctx = { a, id, view, q, sel: new Set(st.sel || []), filter: st.filter || '', coll: st.coll || '', nav: my };
  if (q.get('edit') === '1' && App.can.finance) return renderEditor(ctx);
  draw(ctx);
  const hl = q.get('hl'); if (hl) { const el = view.querySelector(`[data-key="${CSS.escape(hl)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '3px solid var(--gold)'; } }
  return onLive(async (e) => {
    if (e.col !== 'accounts' || e.id !== id || !(e.version > ctx.a._version)) return; // גרסה שכבר מוצגת (או ישנה ממנה) — אין מה לרענן
    if (markBusy(ctx)) { ctx.liveLater = true; return; } // סימון ״נאסף״ באמצע שמירה — מרעננים אחרי שהוא מסתיים, לא באמצע
    if (document.querySelector('#sheet:not([hidden])')) return;
    const ae = document.activeElement; if (ae && view.contains(ae) && ae.matches('input,textarea,select')) return; // באמצע הקלדה — לא מציירים מחדש
    if (await freshLoad(ctx) && !ctx.mkOwn?.has(e.version)) toast('עודכן ממכשיר אחר' + (e.by ? ' (' + e.by + ')' : ''));
  });
}

function header(ctx, extra = '') {
  const a = ctx.a;
  return `<div class="band"><div class="grow"><div class="eyebrow">${KINDS[a.kind]} · ${esc(weekday(a.date))}</div><h1>${esc(a.title || KINDS[a.kind])}</h1><div class="acctimes band-t" data-acctimes>${timesHTML(a._times)}</div></div>
  <div class="row no-print">${App.can.finance ? `<a class="btn sm" href="#/acc/${a.id}?edit=1">עריכה</a>` : ''}${SaveCtl.button('id="hsave"')}<button class="btn sm" data-act="print">הדפסה</button>${(R.accountActions[a.kind] || []).concat(R.accountActions['*'] || []).map((x, i) => (!x.can || x.can(App, a)) ? `<button class="btn sm" data-xact="${i}">${esc(x.label)}</button>` : '').join('')}${extra}</div></div>
  <div class="daybar no-print"><button class="btn ghost sm" id="dprev">‹ יום קודם</button><button class="btn ghost sm" id="dnext">יום הבא ›</button>${App.can.finance ? `<span class="grow"></span><button class="btn sm" id="dnew">פתיחת יום חדש</button><button class="btn danger sm" id="dclear">ניקוי הדף הנוכחי</button>` : ''}</div>`;
}

// items לשליחה: {ref,name,phone,amount,time,collector,date}
function itemsOf(ctx) {
  const a = ctx.a;
  if (a.kind === 'split') {
    const one = r => ({ ref: r._k, name: r.n, first: r.fn, phone: r.ph, amount: num(r.a), time: r.t || '', collector: r.c || '', date: dmy(a.date), side: !!r.side, h: r.h, note: r.note });
    const recs = (a.records || []).filter(r => r.n || r.a);
    if (ctx.coll) return recs.map(one);
    const G = mgGroups(recs), seen = new Set(), out = [];
    for (const r of recs) {
      const g = r.mg && G.get(r.mg);
      if (!g) { out.push(one(r)); continue; }
      if (seen.has(r.mg)) continue; seen.add(r.mg);
      const ph = (g.find(x => normPhone(x.ph)) || {}).ph || '';
      const times = g.map(x => x.t).filter(Boolean).sort();
      out.push({ ref: 'mg:' + r.mg, mg: r.mg, parts: g, name: String(r.n || '').trim(), first: r.fn, phone: ph, amount: mgTotal(g), time: times[0] || '', collector: '', date: dmy(a.date), side: g.every(x => x.side), note: '' });
    }
    return out;
  }
  if (a.kind === 'work') return (a.entries || []).filter(e => e.n || e.a).map(e => ({ ref: e._k, name: e.n, phone: e.p, amount: num(e.a), time: normStatus(e.s) ? '' : (e.t || ''), collector: cleanColl(e.c), date: dmy(a.date), s: normStatus(e.s), by: e.by }));
  if (a.kind === 'collectors') return (a.entries || []).filter(e => e.k !== 'e').map(e => ({ ref: e._k, name: e.n, phone: '', amount: num(e.a), time: e.t || '', collector: (e.c || '').trim(), date: dmy(a.date), by: e.by }));
  if (a.kind === 'morning') return (a.rows || []).map(r => ({ ref: r._k, name: r.n, phone: '', amount: r2((+r.i || 0) + (+r.p || 0)), time: '', collector: '', date: dmy(a.date), i: r.i, p: r.p }));
  return [];
}
const matches = (it, f) => {
  if (!f) return true; const q = normName(f); const d = f.replace(/\D/g, '');
  return normName(it.name).includes(q) || normName(it.collector).includes(q) || normName(it.by || '').includes(q) || (d.length >= 3 && String(it.phone || '').replace(/\D/g, '').includes(d)) || (it.time && it.time.includes(f));
};

function draw(ctx) {
  if (ctx.nav !== undefined && ctx.nav !== App.nav) return; // רענון מאוחר של מסך שכבר עזבנו (למשל אחרי מעבר לעריכה) — לא מציירים מעל המסך הנוכחי
  const { a, view } = ctx;
  const all = itemsOf(ctx); ctx.items = all;
  const vis = all.filter(it => matches(it, ctx.filter) && (!ctx.coll || collKey(it.collector) === collKey(ctx.coll)));
  ctx.visible = new Set(vis.map(v => v.ref));
  const xc = a.kind === 'work' ? (a.expenses || []).map(x => cleanColl(x.c)) : a.kind === 'split' && a._day ? a._day.exp.map(x => cleanColl(x.c)) : [];
  const colls = [...new Set((a.kind === 'split' ? (a.records || []).map(r => String(r.c || '').trim()) : all.map(i => i.collector)).concat(xc).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'he'));
  let body = '';
  if (a.kind === 'morning') body = morningView(ctx, vis);
  else if (a.kind === 'collectors') body = collectorsView(ctx, vis);
  else if (a.kind === 'split') body = splitView(ctx, vis);
  else if (a.kind === 'work') body = workView(ctx, vis);
  view.innerHTML = header(ctx) + `
  <div class="search no-print"><div class="saverow"><input class="in" id="fq" type="search" placeholder="סינון: שם, טלפון, גובה, שליח או שעה…" value="${esc(ctx.filter)}" autocomplete="off">${SaveCtl.button('id="ssave"')}${a.kind === 'split' && App.can.finance ? '<button class="btn sm mgbtn" id="mgbtn">איחוד חובות לפי לווה</button>' : ''}</div>
  ${colls.length > 1 ? `<div class="chips" style="margin-top:8px">${['', ...colls].map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${ctx.coll === c}">${c ? esc(c) : 'כל הגובים'}</button>`).join('')}</div>` : ''}</div>
  ${body}${(R.accountPanels[a.kind] || []).concat(R.accountPanels['*'] || []).map(f => { try { return f(ctx) || ''; } catch (e) { console.error(e); return ''; } }).join('')}${App.can.send ? actionBar(ctx, vis) : ''}`;
  bind(ctx); if (App.can.send && ctx.sel.size) exactCount(ctx);
  paintSave(); // ״שמור שינויים״ גם בפס החיפוש הדביק — נשאר בראש המסך בזמן גלילה
  timesHooks(ctx);
}
// ״שמור״ בלי שינוי מעדכן רק את מועד השמירה; אחרי כל שמירה מוצלחת המועדים במסך מתרעננים מהמאגר
function timesHooks(ctx) {
  let op = uid();
  SaveCtl.register('acc-touch', { isDirty: () => false, save: async () => true, touch: async () => { try { const r = await save('POST', `/api/accounts/${ctx.id}/saved`, { opId: op }, { queue: false, label: 'שמירה' }); op = uid(); ctx.a._times = r.times; paintTimes(ctx.a._times); return true; } catch { return false; } } });
  SaveCtl.after(async () => { try { const a = await get('/api/accounts/' + ctx.id); ctx.a._times = a._times; paintTimes(a._times); } catch { /* */ } });
}
const paintTimes = (t) => $$('[data-acctimes]').forEach(el => { el.innerHTML = timesHTML(t); });
function persist(ctx) { viewState.set('acc:' + ctx.id, { sel: [...ctx.sel], filter: ctx.filter, coll: ctx.coll }); }
const ck = (ctx, ref) => App.can.send ? `<input type="checkbox" class="ck" data-ref="${esc(ref)}" ${ctx.sel.has(ref) ? 'checked' : ''} aria-label="בחר">` : '';

// מספר הנמענים המדויק מחושב בשרת: אחרי איחוד שורות, השלמת מספרים מההיסטוריה, דילוג על מספרים חסרים/שגויים, עצירת מספרים משותפים ובקשות הסרה
let countSeq = 0;
async function exactCount(ctx) {
  const chosen = ctx.items.filter(i => ctx.sel.has(i.ref)); const my = ++countSeq;
  const btn = $('#sendwa', ctx.view); const info = $('#sendinfo', ctx.view);
  if (!chosen.length) { if (btn) { btn.textContent = 'שלח בוואטסאפ ל־0 לקוחות'; btn.disabled = true; } if (info) info.textContent = ''; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'סופר נמענים…'; }
  try {
    const r = await save('POST', '/api/wa/prepare', { items: chosen.map(i => ({ ref: i.ref, name: i.name, phone: i.phone, amount: i.amount, time: i.time, collector: i.collector, date: i.date })), merge: true }, { queue: false });
    if (my !== countSeq) return;
    const n = r.recipients.filter(x => !x.optOut).length;
    if (btn) { btn.textContent = `שלח בוואטסאפ ל־${n} לקוחות`; btn.disabled = !n; }
    const extra = [r.skipped.length && `${r.skipped.length} בלי מספר תקין`, r.blocked.length && `${r.blocked.length} מספרים משותפים לבדיקה`, r.recipients.filter(x => x.optOut).length && `${r.recipients.filter(x => x.optOut).length} ביקשו הסרה`].filter(Boolean);
    if (info) info.textContent = extra.length ? 'לא כולל: ' + extra.join(' · ') : '';
  } catch (e) { if (btn) { btn.textContent = 'שלח בוואטסאפ'; btn.disabled = false; } }
}
function actionBar(ctx, vis) {
  const allVisSel = vis.length && vis.every(v => ctx.sel.has(v.ref));
  const min = waMin();
  return `<div class="actionbar sendbar no-print${min ? ' is-min' : ''}" id="sendbar">
    <button type="button" class="wa-tab" id="watab" aria-expanded="false" aria-controls="wabody">וואטסאפ פרטי <span aria-hidden="true">⌃</span>${ctx.sel.size ? ` <span class="pill">${ctx.sel.size} נבחרו</span>` : ''}</button>
    <div class="wa-body" id="wabody"><div class="wa-top"><b>וואטסאפ פרטי</b><button type="button" class="btn plain sm wa-minbtn" id="wamin" aria-expanded="true" aria-controls="wabody">מזער <span aria-hidden="true">⌄</span></button></div><div class="row sp"><label class="row" style="font-weight:700;cursor:pointer"><input type="checkbox" id="selall" class="ck" style="width:24px;height:24px" ${allVisSel ? 'checked' : ''}> בחר את כל תוצאות הסינון (${vis.length})</label>
    ${ctx.sel.size ? `<button class="btn plain sm" id="selnone">נקה בחירה (${ctx.sel.size} שורות)</button>` : ''}</div>
    <button class="btn wa ${ctx.sel.size ? 'xl' : ''}" id="sendpriv" ${ctx.sel.size ? '' : 'disabled'}>וואטסאפ פרטי · הכן הודעה אישית ל־${ctx.sel.size} שורות</button>
    <button class="btn ghost" id="sendwa" disabled>שלח בוואטסאפ ל־0 לקוחות</button><div id="sendinfo" class="small muted">הכפתור התחתון שולח דרך החשבון העסקי (יעבוד אחרי אישור Meta)</div></div></div>`;
}

function bind(ctx) {
  const { view } = ctx;
  ctx.reload = async () => { await freshLoad(ctx, true); };
  const acts = (R.accountActions[ctx.a.kind] || []).concat(R.accountActions['*'] || []);
  $$('[data-xact]', view).forEach(b => b.onclick = () => acts[+b.dataset.xact].run(ctx));
  $('#dprev', view).onclick = () => stepDay(ctx.a.kind, ctx.a.date, -1);
  $('#dnext', view).onclick = () => stepDay(ctx.a.kind, ctx.a.date, 1);
  const dn = $('#dnew', view); if (dn) dn.onclick = () => openDaySheet(ctx.a.kind, ctx.a.date);
  const dc = $('#dclear', view); if (dc) dc.onclick = () => clearPageSheet(ctx);
  (R.panelBinders[ctx.a.kind] || []).concat(R.panelBinders['*'] || []).forEach(f => { try { f(ctx); } catch (e) { console.error(e); } });
  const fq = $('#fq', view); let t;
  fq.oninput = () => { clearTimeout(t); t = setTimeout(() => { ctx.filter = fq.value; persist(ctx); const pos = fq.selectionStart; draw(ctx); const n = $('#fq', ctx.view); n.focus(); n.setSelectionRange(pos, pos); }, 180); };
  $$('[data-c]', view).forEach(b => b.onclick = () => { ctx.coll = b.dataset.c; persist(ctx); draw(ctx); });
  $$('input.ck[data-ref]', view).forEach(c => c.onchange = () => { c.checked ? ctx.sel.add(c.dataset.ref) : ctx.sel.delete(c.dataset.ref); persist(ctx); refreshBar(ctx); });
  bindBar(ctx);
  $$('[data-row]', view).forEach(el => el.onclick = (e) => { if (e.target.closest('input,button,a,select,label,textarea,.ied')) return; rowSheet(ctx, el.dataset.row); });
  bindInline(ctx);
  $$('[data-mark]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); quickMark(ctx, b); });
  $$('[data-mkretry]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); const m = ctx.mk?.get(b.dataset.mkretry); if (m) runMark(ctx, b.dataset.mkretry, m.s, m.reason, m.opId); });
  $$('[data-mkx]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); ctx.mk?.delete(b.dataset.mkx); redraw(ctx); });
  $$('[data-delent]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); delEntrySheet(ctx, b.dataset.delent); });
  $$('[data-assign]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); assignSheet(ctx, b.dataset.assign); });
}
function refreshBar(ctx) {
  const vis = ctx.items.filter(i => ctx.visible.has(i.ref));
  const bar = $('.actionbar', ctx.view); if (!bar) return;
  bar.outerHTML = actionBar(ctx, vis); bindBar(ctx); clearTimeout(ctx.ct); ctx.ct = setTimeout(() => exactCount(ctx), 250);
  $$('[data-ref]', ctx.view).forEach(c => { c.checked = ctx.sel.has(c.dataset.ref); c.closest('.li')?.classList.toggle('sel', c.checked); });
}
// מזעור סרגל הפעולות בעריכה (״שמור שינויים״ / ״שמור וסיים״ / ״ביטול״) — תצוגה בלבד: הערכים, הגלילה והשמירה לא משתנים
const EDMIN = 'yh:edmin';
function edMin() { try { return localStorage.getItem(EDMIN) === '1'; } catch { return false; } }
function setEdMin(on) {
  try { localStorage.setItem(EDMIN, on ? '1' : '0'); } catch { /* */ }
  const bar = document.getElementById('edbar'); if (!bar) return; const y = window.scrollY;
  bar.classList.toggle('is-min', on); bar.classList.add(on ? 'wa-closing' : 'wa-opening'); setTimeout(() => bar.classList.remove('wa-closing', 'wa-opening'), 220);
  window.scrollTo(0, y); const f = document.getElementById(on ? 'edtab' : 'edmin'); if (f) f.focus({ preventScroll: true });
}
// מזעור חלון ״וואטסאפ פרטי״: נשמר במכשיר (גם בין מסכים). רק מחליף מחלקה — הבחירה, הסינון והגלילה לא משתנים
const WAMIN = 'yh:wamin';
function waMin() { try { return localStorage.getItem(WAMIN) === '1'; } catch { return false; } }
function setWaMin(on) {
  try { localStorage.setItem(WAMIN, on ? '1' : '0'); } catch { /* */ }
  const bar = document.getElementById('sendbar'); if (!bar) return;
  const y = window.scrollY;
  bar.classList.toggle('is-min', on); bar.classList.add(on ? 'wa-closing' : 'wa-opening');
  setTimeout(() => bar.classList.remove('wa-closing', 'wa-opening'), 220);
  window.scrollTo(0, y);
  const f = document.getElementById(on ? 'watab' : 'wamin'); if (f) f.focus({ preventScroll: true });
}
function bindBar(ctx) {
  const v = ctx.view;
  const mn = $('#wamin', v); if (mn) mn.onclick = (e) => { e.stopPropagation(); setWaMin(true); };
  const tb = $('#watab', v); if (tb) tb.onclick = (e) => { e.stopPropagation(); setWaMin(false); };
  const sa = $('#selall', v); if (sa) sa.onchange = () => { for (const r of ctx.visible) sa.checked ? ctx.sel.add(r) : ctx.sel.delete(r); persist(ctx); refreshBar(ctx); };
  const sn = $('#selnone', v); if (sn) sn.onclick = () => { ctx.sel.clear(); persist(ctx); refreshBar(ctx); };
  const sp = $('#sendpriv', v); if (sp) sp.onclick = () => openPrivate(ctx.items.filter(i => ctx.sel.has(i.ref)), { col: 'accounts', id: ctx.a.id, title: ctx.a.title, kind: ctx.a.kind });
  const sw = $('#sendwa', v); if (sw) sw.onclick = () => {
    const chosen = ctx.items.filter(i => ctx.sel.has(i.ref));
    openSendSheet(chosen, { col: 'accounts', id: ctx.a.id, title: ctx.a.title, kind: ctx.a.kind }, { split: ctx.a.kind === 'split' });
  };
}

// ---------- חשבון בוקר ----------
function morningView(ctx, vis) {
  const a = ctx.a; const c = calcMorning(a);
  const visSet = new Set(vis.map(v => v.ref));
  const rowsI = (a.rows || []).filter(r => r.i && visSet.has(r._k)), rowsP = (a.rows || []).filter(r => r.p && visSet.has(r._k));
  const tbl = (rows, f) => `<div class="tbl-wrap"><table><thead><tr><th></th><th>#</th><th>לקוח</th><th class="a">סכום</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-key="${esc(r._k)}"><td>${ck(ctx, r._k)}</td><td>${i + 1}</td><td>${esc(r.n)}</td><td class="a">${money(r[f])}</td></tr>`).join('')}<tr class="tot"><td></td><td></td><td>סה״כ ${f === 'i' ? 'ריבית' : 'קרן'}</td><td class="a">${money(f === 'i' ? c.interest : c.principal)}</td></tr></tbody></table></div>`;
  const prev = a.prev; const chain = prev ? r2(c.keren - prev.final) : null;
  return `<div class="rep">
  ${prev ? `<div class="note ${chain ? 'warn' : 'ok'}">${chain ? `הקרן הקיימת (${fmt(c.keren)}) שונה מהקרן הסופית של החשבון הקודם מ-${dmy(prev.date)} (${fmt(prev.final)}) בהפרש של ${fmt(chain)} ₪.` : `✓ הקרן הקיימת שווה לקרן הסופית של החשבון הקודם (${dmy(prev.date)}) — הקרן נספרת פעם אחת בלבד.`}</div>` : '<div class="note info">זה חשבון הבוקר הראשון — הקרן הקיימת היא הקרן הפותחת.</div>'}
  ${ctx.filter || ctx.coll ? '<div class="note warn">מוצגות רק השורות שתואמות לסינון. הסיכומים מחושבים על כל החשבון.</div>' : ''}
  <h3><span class="n">1</span>ריבית שנגבתה</h3>${tbl(rowsI, 'i')}
  <h3><span class="n">2</span>קרן שנגבתה</h3>${tbl(rowsP, 'p')}
  <h3><span class="n">3</span>חלוקת הריבית</h3><div class="tbl-wrap"><table><tbody>
    <tr><td>ריבית (100%)</td><td class="a">${money(c.interest)}</td></tr><tr><td>רובי (${fmt(c.rp)}%)</td><td class="a">${money(c.robi)}</td></tr>
    <tr><td>הקו (${fmt(c.lp)}%)</td><td class="a">${money(c.line)}</td></tr><tr><td>פחות משלוחים</td><td class="a">${money(-c.courier)}</td></tr>
    <tr class="tot"><td>הקו אחרי משלוחים</td><td class="a">${money(c.lineRem)}</td></tr></tbody></table></div>
  <h3><span class="n">4</span>בניית הקרן</h3><div class="tbl-wrap"><table><tbody>
    <tr><td>קרן שנגבתה</td><td class="a">${money(c.principal)}</td></tr><tr><td>הקו אחרי משלוחים</td><td class="a">${money(c.lineRem)}</td></tr>
    <tr><td>קרן קיימת</td><td class="a">${money(c.keren)}</td></tr><tr class="tot"><td>סה״כ כל הקרנות</td><td class="a">${money(c.kerenTotal)}</td></tr></tbody></table></div>
  <h3><span class="n">5</span>הלוואות</h3><div class="tbl-wrap"><table><thead><tr><th>#</th><th>הלוואה</th><th class="a">סכום</th></tr></thead><tbody>${(a.loans || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.n)}</td><td class="a">${money(l.a)}</td></tr>`).join('')}<tr class="tot"><td></td><td>סה״כ הלוואות</td><td class="a">${money(c.loansTotal)}</td></tr></tbody></table></div>
  <h3><span class="n">6</span>סיכום סופי</h3><div class="tbl-wrap"><table><tbody>
    <tr><td>הקו אחרי משלוחים</td><td class="a">${money(c.lineRem)}</td></tr><tr><td>קרן שנגבתה</td><td class="a">${money(c.principal)}</td></tr><tr><td>קרן קיימת</td><td class="a">${money(c.keren)}</td></tr>
    <tr><td>סה״כ כל הקרנות</td><td class="a">${money(c.kerenTotal)}</td></tr><tr><td>פחות הלוואות</td><td class="a">${money(-c.loansTotal)}</td></tr>
    <tr class="final ${c.final < 0 ? 'negbg' : ''}"><td>סה״כ סופי</td><td class="a">${money(c.final)}</td></tr></tbody></table></div>
  ${a.kerenFix ? `<p class="small muted">תיקון שרשרת קרן מתועד: ${esc(a.kerenFix.note || '')}</p>` : ''}
  <p class="small muted">לשליחת וואטסאפ מחשבון בוקר, המספר נלקח מהיסטוריית הלקוח (פיצול/איסוף) כשיש לו מספר אחד בלבד.</p></div>`;
}

// ---------- חשבון גובים ----------
function collectorsView(ctx, vis) {
  const a = ctx.a; const c = calcCollectors(a.entries || []);
  const visSet = new Set(vis.map(v => v.ref));
  const byKey = new Map((a.entries || []).map(e => [e, e._k]));
  // calcCollectors מחזיר שורות בלי מפתח; משייכים לפי סדר (שם+סכום) בתוך הגובה
  const rowsOf = (g, k) => { const src = (a.entries || []).filter(e => ((e.c || '').trim() || 'ללא גובה') === g.c && (k === 'e' ? e.k === 'e' : e.k !== 'e')); return src.slice().sort((x, y) => String(x.n || '(ללא שם)').localeCompare(String(y.n || '(ללא שם)'), 'he')); };
  return `${c.groups.map(g => { const debts = rowsOf(g, 'd').filter(e => visSet.has(e._k)); if (!debts.length && (ctx.filter || ctx.coll)) return ''; const exps = rowsOf(g, 'e'); return `<div class="card"><div class="row sp"><h2>${esc(g.c)}</h2><span class="muted small">${g.debts.length} חובות · ${g.exps.length} הוצאות</span></div>
    <div class="grid" style="margin-bottom:8px"><div><div class="muted small">גבייה ברוטו</div><b>${money(g.debtTotal)}</b></div><div><div class="muted small">הוצאות</div><b>${money(g.expTotal)}</b></div><div><div class="muted small">נטו אחרי הוצאות</div><b>${money(g.net)}</b></div></div>
    <div class="list">${debts.map(e => `<div class="li ${ctx.sel.has(e._k) ? 'sel' : ''}" data-key="${esc(e._k)}">${ck(ctx, e._k)}<div class="t">${esc(e.n || '(ללא שם)')}</div><div class="a">${money(num(e.a))}</div><div class="m">${e.t ? `<span class="num">${esc(e.t)}</span>` : ''}${e.by && e.by !== '@' ? `<span>גובה אחראי: ${esc(g.c)} · אסף בפועל: ${esc(e.by)}</span>` : ''}</div></div>`).join('')}</div>
    ${exps.length ? `<details style="margin-top:8px"><summary>הוצאות (${exps.length}) · ${money(g.expTotal)}</summary><div class="list">${exps.map(e => `<div class="li noc"><div class="t">${esc(e.n)}</div><div class="a">${money(num(e.a))}</div></div>`).join('')}</div></details>` : ''}</div>`; }).join('')}
  <div class="card"><h2>סיכום כללי</h2><div class="tbl-wrap"><table><thead><tr><th>גובה</th><th class="a">גבייה ברוטו</th><th class="a">הוצאות</th><th class="a">נטו</th></tr></thead><tbody>${c.groups.map(g => `<tr><td>${esc(g.c)}</td><td class="a">${money(g.debtTotal)}</td><td class="a">${money(g.expTotal)}</td><td class="a">${money(g.net)}</td></tr>`).join('')}
  <tr class="tot"><td>סה״כ</td><td class="a">${money(c.totalDebts)}</td><td class="a">${money(c.totalExp)}</td><td class="a">${money(c.totalNet)}</td></tr></tbody></table></div>
  ${c.dups.length ? `<div class="note warn">שמות שמופיעים אצל יותר מגובה אחד: ${c.dups.map(d => esc(d.n) + ' (' + d.cs.map(esc).join(', ') + ')').join(' · ')}</div>` : ''}
  ${c.noCollector ? '<div class="note warn">יש שורות בלי גובה.</div>' : ''}</div>`;
}

// ---------- פיצול ----------
function splitView(ctx, vis) {
  const a = ctx.a; const visSet = new Set(vis.map(v => v.ref));
  const c = calcSplit(a.records || []); const MG = mgGroups(a.records || []);
  const merged = ctx.coll ? [] : vis.filter(v => v.mg);
  const hiddenIn = (b) => ctx.coll ? 0 : r2(sum(b.sections.flatMap(s => s.rows).filter(r => r.mg && MG.get(r.mg)).map(r => num(r.a))));
  const mrow = (it) => `<div class="li mgrow ${ctx.sel.has(it.ref) ? 'sel' : ''}" data-key="${esc(it.ref)}">${ck(ctx, it.ref)}<div class="t">${esc(it.name)} — ${money(it.amount)} <span class="pill acc">${it.parts.length} חובות</span></div><div class="a">${money(it.amount)}</div>
    <div class="m" style="flex-basis:100%"><div class="mgp-notes">הערות: ${esc(collNotes(it.parts))}</div></div>
    <div class="m" style="flex-basis:100%"><details class="mgdet2"><summary>פירוט</summary><div class="tbl-wrap"><table><thead><tr><th>גובה</th><th class="a">סכום</th><th>שעה</th><th>סטטוס</th></tr></thead><tbody>${it.parts.map(x => `<tr><td>${esc(String(x.c || '').trim() || 'ללא גובה')}</td><td class="a">${money(num(x.a))}</td><td>${esc(x.t || '')}</td><td>${esc(partStatus(x))}</td></tr>`).join('')}</tbody><tfoot><tr><td><b>סה״כ</b></td><td class="a"><b>${money(it.amount)}</b></td><td></td><td></td></tr></tfoot></table></div>${App.can.finance ? `<button class="btn plain sm" data-mgun="${esc(it.mg)}">בטל איחוד</button>` : ''}</details></div></div>`;
  const rec = (r) => `<div class="li ${ctx.sel.has(r._k) ? 'sel' : ''}" data-key="${esc(r._k)}">${ck(ctx, r._k)}<div class="t">${esc(r.n)} ${r.pp ? `<span class="pill acc">חלק ${esc(r.pp)}</span>` : ''}${r.mg && MG.get(r.mg) ? ` <span class="pill acc">חוב מאוחד · סה״כ ${money(mgTotal(MG.get(r.mg)))}</span>${ctx.coll ? ` <span class="pill acc">חלקו של ${esc(String(r.c || '').trim())} ${money(collShare(MG.get(r.mg), r.c))}</span>` : ''}` : ''}${r.h === 'קשה' ? ' <span class="pill err">קשה</span>' : ''}${r.na ? ' <span class="pill acc">לא ענו</span>' : ''}</div><div class="a">${money(num(r.a))}</div>
    <div class="m">${r.t ? `<span class="num">${esc(r.t)}</span>` : ''}${r.ph ? `<span>${esc(fmtPhone(r.ph))}</span>` : '<span class="neg">אין טלפון</span>'}${r.gnote ? `<span class="wnote">✎ ${esc(r.gnote)}</span>` : ''}${r.note ? `<span>${esc(r.note)}</span>` : ''}</div></div>`;
  const D = a._day; const dxOf = (cn) => D ? D.exp.filter(x => collKey(cleanColl(x.c)) === collKey(cn)) : [];
  const dayBox = (cn) => { if (!D) return ''; const xs = dxOf(cn), et = r2(sum(xs.map(x => num(x.a)))), got = D.got[collKey(cn)] || 0; if (!xs.length && !got) return '';
    return `<div class="dayx">${xs.length ? `<h3 style="margin:10px 0 4px">הוצאות</h3><div class="list">${xs.map(x => `<div class="li noc"><div class="t">${x.t ? `<span class="num">${esc(x.t)}</span> · ` : ''}${esc(String(x.n || '').trim() || 'הוצאה')}</div><div class="a">${money(num(x.a))}</div></div>`).join('')}</div>` : ''}
      <dl class="kv" style="margin-top:6px"><dt>נגבה בפועל (איסוף יום)</dt><dd>${money(got)}</dd><dt>סה״כ הוצאות</dt><dd>${money(et)}</dd><dt>נטו למסירה</dt><dd><b>${money(r2(got - et))}</b></dd></dl></div>`; };
  const blockNames = new Set(c.blocks.map(b => collKey(b.c)));
  const xOnlyCards = D ? [...new Map(D.exp.filter(x => collKey(cleanColl(x.c)) && !blockNames.has(collKey(cleanColl(x.c)))).map(x => [collKey(cleanColl(x.c)), cleanColl(x.c)])).values()]
    .filter(cn => !ctx.filter && (!ctx.coll || collKey(ctx.coll) === collKey(cn))).map(cn => `<div class="card"><div class="row sp"><h2>${esc(cn)}</h2><b>${money(0)}</b></div><div class="muted small">אין גביות בפיצול היום</div>${dayBox(cn)}</div>`).join('') : '';
  const blocks = c.blocks.map(b => { const rows = b.sections.flatMap(s => s.rows.map(r => ({ r, s: s.t }))).filter(x => visSet.has(x.r._k)); if (!rows.length && (ctx.filter || ctx.coll) && !(dxOf(b.c).length && !ctx.filter && collKey(ctx.coll) === collKey(b.c))) return '';
    const hid = hiddenIn(b);
    return `<div class="card"><div class="row sp"><h2>${esc(b.c === CHANGE ? 'לשנות במערכת' : b.c === NOC_SP ? 'ללא גובה (להשלים)' : b.c)}</h2><b>${money(b.total)}</b></div><div class="muted small">${b.count} לקוחות${hid ? ` · כולל ${money(hid)} של לווים מאוחדים (מוצגים למעלה ב״לווים מאוחדים״)` : ''}</div>
    <div class="list" style="margin-top:8px">${b.sections.map(s => { const rs = s.rows.filter(r => visSet.has(r._k)); return (s.t ? `<div class="grp"><span>${esc(s.t)}</span><span class="s">${money(s.total)}</span></div>` : '') + rs.map(rec).join(''); }).join('')}</div>${dayBox(b.c)}</div>`; }).join('') + xOnlyCards;
  const sides = c.sides.filter(r => visSet.has(r._k));
  const mcard = merged.length ? `<div class="card mgcard"><div class="row sp"><h2>לווים מאוחדים</h2><b>${money(r2(sum(merged.map(m => m.amount))))}</b></div><div class="muted small">שורה אחת לכל לווה, עם הסכום הכולל לתשלום היום. החשבון של כל גובה נשאר בכרטיס שלו (בחר את הגובה למעלה).</div><div class="list" style="margin-top:8px">${merged.map(mrow).join('')}</div></div>` : '';
  const fx = (a._foreign || []);
  const fwarn = fx.length && App.can.finance ? `<div class="note warn no-print" id="fornote"><b>נמצאו ${fx.length} שורות שהגיעו מחשבון של יום אחר</b> (העתק זהה של שורות מ־${[...new Set(fx.map(x => dmy(x.from)))].join(', ')}): ${fx.slice(0, 6).map(x => esc(x.n) + ' ' + money(num(x.a))).join(' · ')}${fx.length > 6 ? ' …' : ''}<br><button class="btn danger sm" id="forrm" style="margin-top:6px">הסר אותן מהחשבון הזה בלבד</button> <span class="small">החשבון של היום הקודם לא משתנה. אפשר גם לייבא שוב את האקסל של היום.</span></div>` : '';
  return `${fwarn}${mcard}${blocks}${sides.length ? `<div class="card"><div class="row sp"><h2>לא נגבה היום</h2><b>${money(c.sideTotal)}</b></div><div class="list">${sides.map(rec).join('')}</div></div>` : ''}
  <div class="card"><h2>סיכום</h2><dl class="kv"><dt>לקוחות</dt><dd>${customerCount(a.records)}</dd><dt>סה״כ גובים</dt><dd>${money(c.grand)}</dd>${c.specialTotal ? `<dt>לשנות / ללא גובה</dt><dd>${money(c.specialTotal)}</dd>` : ''}${c.sideTotal ? `<dt>לא נגבה היום</dt><dd>${money(c.sideTotal)}</dd>` : ''}<dt>סה״כ הכול</dt><dd>${money(c.all)}</dd></dl>
  ${MG.size && ctx.coll ? `<details class="mgview" style="margin-top:8px"><summary>לקוחות עם כמה חובות (${MG.size})</summary><div class="list">${[...MG.values()].map(g => `<div class="li noc"><div class="t">${esc(String(g[0].n || '').trim())}</div><div class="a">${money(mgTotal(g))}</div><div class="m">${g.map(x => `<span>${esc(String(x.c || '').trim() || 'ללא גובה')} — ${money(num(x.a))}</span>`).join('')}</div></div>`).join('')}</div></details>` : ''}
  ${c.dups.filter(d => !MG.size || !(a.records || []).some(r => r.mg && normName(r.n) === normName(d.n))).length ? `<div class="note warn">אותו שם אצל כמה גובים: ${c.dups.filter(d => !(a.records || []).some(r => r.mg && normName(r.n) === normName(d.n))).map(d => esc(d.n) + ' (' + d.cs.map(esc).join(', ') + ')').join(' · ')}</div>` : ''}</div>`;
}

// ---------- איסוף יום ----------
function workView(ctx, vis) {
  const a = ctx.a; const visSet = new Set(vis.map(v => v.ref));
  const es = (a.entries || []).filter(e => e && (e.n || e.a));
  const rawExp = (a.expenses || []).filter(x => x && (x.n || x.a));
  const expOf = (name) => rawExp.filter(x => !name ? true : name === NOC_SP ? !collKey(cleanColl(x.c)) : collKey(cleanColl(x.c)) === collKey(name));
  // גובה שיש לו רק הוצאה (עוד בלי גביות היום) מקבל כרטיס משלו
  const xOnly = () => { const names = [...new Map(rawExp.filter(x => collKey(cleanColl(x.c))).map(x => [collKey(cleanColl(x.c)), cleanColl(x.c)])).values()]; return names.map(n => { const xl = wExpList({ expenses: expOf(n) }); const et = sum(xl.map(x => x.a)); return { name: n, calc: calcWork([]), exp: xl, expTotal: et, net: r2(0 - et) }; }); };
  const groups = workGroups(es, wExpList(a)) || (!es.length && rawExp.some(x => collKey(cleanColl(x.c))) ? xOnly() : [{ name: '', calc: calcWork(es), exp: wExpList(a), expTotal: sum(wExpList(a).map(x => x.a)), net: r2(calcWork(es).total - sum(wExpList(a).map(x => x.a))) }]);
  const byIdx = es; // calcWork מחזיר i = אינדקס בתוך הרשימה של הקבוצה
  const html = groups.map(g => {
    const list = g.name ? es.filter(e => (g.name === NOC_SP ? !collKey(cleanColl(e.c)) : collKey(cleanColl(e.c)) === collKey(g.name))) : es;
    const rows = g.calc.rows.map(r => list[r.i]).filter(e => e && visSet.has(e._k));
    const gx = expOf(g.name);
    const keepForExp = gx.length && !ctx.filter && (!ctx.coll || collKey(ctx.coll) === collKey(g.name));
    if (!rows.length && (ctx.filter || ctx.coll) && !keepForExp) return '';
    // נטו למסירה = נגבה בפועל פחות ההוצאות של הגובה באותו יום. הצפוי והנשאר — חובות הלקוחות בלבד
    const netGot = r2(g.calc.gotTotal - g.expTotal);
    return `<div class="card wgcard" data-wg="${esc(g.name)}"><div class="row sp"><h2>${esc(g.name || 'איסוף')}</h2><span class="muted small">${g.calc.count} לקוחות</span></div>
    <div class="grid" style="margin-bottom:8px"><div><div class="muted small">גבייה ברוטו (צפוי)</div><b>${money(g.calc.total)}</b></div><div><div class="muted small">נגבה בפועל</div><b class="wg-got">${money(g.calc.gotTotal)}</b></div><div><div class="muted small">נשאר</div><b>${money(g.calc.left)}</b></div>
    ${App.can.finance ? `<div><div class="muted small">סה״כ הוצאות</div><b class="wg-exp">${money(g.expTotal)}</b></div><div class="wg-netbox"><div class="muted small">נטו למסירה</div><b class="wg-net">${money(netGot)}</b></div>` : ''}</div>
    <div class="list">${rows.map(e => workRow(ctx, e, g.name)).join('')}</div>
    ${gx.length && App.can.finance ? `<div class="wg-x"><h3 style="margin:10px 0 4px">הוצאות</h3><div class="list">${gx.map(x => `<div class="li noc"><div class="t">${x.t ? `<span class="num">${esc(x.t)}</span> · ` : ''}${esc(String(x.n || '').trim() || 'הוצאה')}</div><div class="a">${money(num(x.a))}</div></div>`).join('')}</div></div>` : ''}
    ${App.can.finance && g.name ? `<div class="small muted" style="margin-top:6px">צפוי פחות הוצאות (החישוב של התוכנה הקודמת): ${money(g.net)}</div>` : ''}</div>`;
  }).join('');
  const all = calcWork(es); const ex = sum(wExpList(a).map(x => x.a));
  return `<div class="kpis"><div class="kpi"><div class="l">צפוי</div><div class="v">${money(all.total)}</div></div><div class="kpi good"><div class="l">נגבה</div><div class="v">${money(all.gotTotal)}</div></div><div class="kpi bad"><div class="l">נשאר</div><div class="v">${money(all.left)}</div></div>${App.can.finance ? `<div class="kpi"><div class="l">הוצאות</div><div class="v">${money(ex)}</div></div>` : ''}</div>
  ${html}${App.can.finance ? '<p class="small muted">״נטו למסירה״ = נגבה בפועל פחות ההוצאות של הגובה באותו יום. ״גבייה ברוטו (צפוי)״ ו״נשאר״ — חובות הלקוחות בלבד.</p>' : ''}
  <button class="btn ghost no-print" id="hist">היסטוריית סימונים ותיקונים</button>`;
}
function workRow(ctx, e, gname) {
  const s = normStatus(e.s); const mk = ctx.mk && ctx.mk.get(e._k); const busy = mk && mk.st === 'saving';
  const courier = e.by && e.by !== '@' ? `<span>גובה אחראי: <b>${esc(cleanColl(e.c) || gname)}</b> · אסף בפועל: <b>${esc(e.by)}</b></span>` : (e.by === '@' ? `<span>נאסף ע״י הגובה</span>` : '');
  return `<div class="li ${s === 'נאסף' ? 'got' : ''} ${ctx.sel.has(e._k) ? 'sel' : ''} link" data-row="${esc(e._k)}" data-key="${esc(e._k)}">${ck(ctx, e._k)}
    <div class="t">${!s && e.t ? (App.can.finance ? `<button type="button" class="ef num" data-ef="t" data-efk="${esc(e._k)}" aria-label="עריכת השעה ${esc(e.t)} של ${esc(e.n)}">${esc(e.t)}</button> · ` : `<span class="num">${esc(e.t)}</span> · `) : ''}${esc(e.n)} ${s ? `<span class="pill ${s === 'נאסף' ? 'ok' : s === 'לא נאסף' ? 'err' : s === 'לא ענו' ? 'acc' : 'warn'}">${esc(s)}</span>` : ''}${e.h === 'קשה' ? ' <span class="pill err">קשה</span>' : ''}${e.pp ? ` <span class="pill acc">חלק ${esc(e.pp)}</span>` : ''}</div>
    ${(e._notes || []).length ? `<div class="wnotes">${e._notes.map(t => `<div class="wnote">✎ ${esc(t)}</div>`).join('')}</div>` : ''}
    <div class="a">${App.can.finance ? `<button type="button" class="ef" data-ef="a" data-efk="${esc(e._k)}" aria-label="עריכת הסכום של ${esc(e.n)}">${money(num(e.a))}</button>` : money(num(e.a))}${s === 'נאסף' && e.ga != null && e.ga !== '' ? `<div class="small muted">נגבה ${money(e.ga)}</div>` : ''}</div>
    <div class="m">${courier}${e.p ? `<a href="tel:${esc(e.p)}">${esc(fmtPhone(e.p))}</a>` : '<span class="neg">אין טלפון</span>'}${e.pmt ? `<span>${esc(e.pmt)}</span>` : ''}${e.mk ? `<span>סומן ע״י ${esc(e.mk.u)} ${when(e.mk.at)}</span>` : ''}</div>
    <div class="st no-print"${busy ? ' aria-busy="true"' : ''}>${['נאסף', 'לא נאסף', 'לעבור', 'לא ענו'].map(x => `<button data-s="${x}" aria-pressed="${s === x}" data-mark="${esc(e._k)}|${s === x ? '' : x}"${busy ? ' disabled' : ''}>${x}</button>`).join('')}</div>
    ${busy ? `<div class="mkst no-print" role="status">⏳ שומר ${mk.s ? '״' + esc(mk.s) + '״' : 'ביטול סימון'}…</div>` : ''}
    ${mk && mk.st === 'err' ? `<div class="mkerr note err no-print" role="alert"><b>${mk.s ? '״' + esc(mk.s) + '״' : 'ביטול הסימון'} לא נשמר.</b> ${esc(mk.msg)}<div class="row" style="margin-top:6px"><button class="btn sm" data-mkretry="${esc(e._k)}">נסה שוב</button><button class="btn ghost sm" data-mkx="${esc(e._k)}">סגור</button></div></div>` : ''}
    ${ctx.edit && ctx.edit.key === e._k ? inlineEditor(ctx, e) : ''}
    ${App.can.finance ? `<div class="delent no-print"><button class="btn sm ghost" data-edrow="${esc(e._k)}" aria-label="ערוך גבייה של ${esc(e.n)}"${ctx.edit && ctx.edit.key === e._k && ctx.edit.fields.length > 1 ? ' aria-expanded="true"' : ''}>✎ ערוך גבייה</button><button class="btn sm${collKey(cleanColl(e.c)) ? ' ghost' : ''}" data-assign="${esc(e._k)}" aria-label="${collKey(cleanColl(e.c)) ? 'העבר לגובה אחר' : 'שייך לגובה'}: ${esc(e.n)}">${collKey(cleanColl(e.c)) ? '⇄ העבר לגובה אחר' : '👤 שייך לגובה'}</button><button class="btn danger sm" data-delent="${esc(e._k)}" aria-label="מחק גבייה של ${esc(e.n)}">🗑 מחק גבייה</button></div>` : ''}</div>`;
}
// ״מחק גבייה״: מוחק רק את השורה שנבחרה (לפי המזהה שלה), בשרת. השורה יורדת מהמסך רק אחרי שהמחיקה נשמרה.
function delEntrySheet(ctx, key) {
  const e = (ctx.a.entries || []).find(x => x._k === key); if (!e) return;
  const g = cleanColl(e.c) || 'ללא גובה', t = normStatus(e.s) ? '' : (e.t || '');
  const s = openSheet(`<div class="hd"><h2>מחיקת גבייה</h2><button class="x" data-close>×</button></div>
    <p style="font-size:17px;font-weight:700">למחוק מרשימת הגביות של ${esc(g)} את הגבייה של ${esc(e.n)} בסך ${fmt(num(e.a))} ₪${t ? ' לשעה ' + esc(t) : ''}?</p>
    <dl class="kv"><dt>לקוח</dt><dd>${esc(e.n)}</dd><dt>סכום</dt><dd>${money(num(e.a))}</dd><dt>גובה</dt><dd>${esc(g)}</dd><dt>תאריך</dt><dd>${esc(weekday(ctx.a.date))} ${dmy(ctx.a.date)}</dd><dt>שעה</dt><dd>${t ? esc(t) : 'ללא שעה'}</dd>${normStatus(e.s) ? `<dt>סטטוס</dt><dd>${esc(normStatus(e.s))}</dd>` : ''}</dl>
    <p class="small muted">תימחק רק הגבייה הזו מרשימת האיסוף של היום. כרטיס הלקוח, החוב המקורי, תשלומים שנרשמו וגביות אחרות של ${esc(e.n)} לא משתנים.</p>
    <div id="delerr"></div>
    <div class="row"><button class="btn ghost xl" id="delno" style="flex:1">ביטול</button><button class="btn danger xl" id="delok" style="flex:1">מחק גבייה</button></div>`);
  $('#delno', s.el).onclick = () => s.close();
  const opId = uid();
  $('#delok', s.el).onclick = async (ev) => {
    const b = ev.target; b.disabled = true; b.textContent = 'מוחק…'; SaveCtl.saving();
    try {
      const r = await save('POST', `/api/accounts/${ctx.a.id}/del-entry`, { key, opId }, { queue: false, label: 'מחיקת גבייה' });
      ctx.a.entries = (ctx.a.entries || []).filter(x => x._k !== key); if (r.version) ctx.a._version = r.version;
      ctx.sel.delete(key); persist(ctx); s.close(); draw(ctx); SaveCtl.saved();
      toast(`הגבייה של ${e.n} (${fmt(num(e.a))} ₪) נמחקה מהרשימה של ${g}`);
    } catch (err) {
      SaveCtl.failed(); b.disabled = false; b.textContent = 'מחק גבייה';
      $('#delerr', s.el).innerHTML = `<div class="note err">המחיקה לא נשמרה — השורה נשארה ברשימה. ${esc(err.network ? 'אין קליטה.' : err.message)} לחץ שוב ״מחק גבייה״ כדי לנסות שוב (המחיקה לא תתבצע פעמיים).</div>`;
    }
  };
}
// סימון מהיר בשורה (״נאסף״ וכו׳). לכל שורה שמירה אחת בכל רגע; לכל ניסיון מזהה פעולה קבוע (opId) — לחיצה כפולה
// או ״נסה שוב״ אחרי תשובה שאבדה לא נרשמים פעמיים. בזמן השמירה השורה מציגה ״שומר…״ ורענון חי מחכה לסיומה,
// כך שתשובה ישנה מהשרת לא מציירת מצב קודם מעל סימון חדש.
const markBusy = (ctx) => !!ctx.mk && [...ctx.mk.values()].some(m => m.st === 'saving');
function redraw(ctx) { const y = window.scrollY; draw(ctx); window.scrollTo(0, y); }
// טעינה מחדש מהשרת: רק התשובה האחרונה, ורק אם היא לא ישנה ממה שכבר מוצג
async function freshLoad(ctx, force = false) {
  const my = ctx.loadSeq = (ctx.loadSeq || 0) + 1;
  const a = await get('/api/accounts/' + ctx.id);
  if (my !== ctx.loadSeq || (ctx.nav !== undefined && ctx.nav !== App.nav)) return false;
  if (markBusy(ctx)) { ctx.liveLater = true; return false; }
  if (!force && !(a._version > ctx.a._version)) return false;
  if (a._version < ctx.a._version) return false;
  ctx.a = a; redraw(ctx); return true;
}
async function quickMark(ctx, b) {
  const [key, s] = b.dataset.mark.split('|');
  const m0 = ctx.mk && ctx.mk.get(key);
  if (m0 && (m0.st === 'saving' || (m0.st === 'done' && Date.now() < m0.until))) return; // לחיצה כפולה / לחיצה מיד אחרי השמירה
  const e = (ctx.a.entries || []).find(x => x._k === key); if (!e) return;
  const prev = normStatus(e.s);
  // תיקון סימון קיים (למשל ״נאסף״ שסומן בטעות) — מבקשים סיבה ומתעדים
  let reason = '';
  if (prev === 'נאסף' && s !== 'נאסף') { reason = prompt(`לבטל את הסימון ״נאסף״ של ${e.n}? כתוב סיבה לתיעוד (לא חובה):`, ''); if (reason === null) return; }
  runMark(ctx, key, s, reason, m0 && m0.st === 'err' && m0.s === s ? m0.opId : uid());
}
async function runMark(ctx, key, s, reason, opId) {
  ctx.mk = ctx.mk || new Map(); ctx.mkOwn = ctx.mkOwn || new Set();
  if (ctx.mk.get(key)?.st === 'saving') return;
  const name = ((ctx.a.entries || []).find(x => x._k === key) || {}).n || '';
  ctx.mk.set(key, { st: 'saving', s, reason, opId }); redraw(ctx); SaveCtl.saving();
  try {
    const r = await save('POST', `/api/accounts/${ctx.a.id}/mark`, { key, s, reason, opId }, { queue: false, label: 'סימון איסוף של ' + name });
    ctx.mkOwn.add(r.version);
    const cur = (ctx.a.entries || []).find(x => x._k === key); // השורה ברשימה המוצגת עכשיו (לא עותק ישן)
    if (cur && r.entry) { Object.assign(cur, r.entry); if (r.entry.ga === undefined) delete cur.ga; }
    if (r.version > ctx.a._version) { if (r.version > ctx.a._version + 1) ctx.liveLater = true; ctx.a._version = r.version; } // שינויים אחרים שעוד לא הוצגו — נטען אחרי הסיום
    if (r.replay) ctx.liveLater = true;
    ctx.mk.set(key, { st: 'done', until: Date.now() + 700 });
    SaveCtl.saved(); toast(s ? `${name}: ${s}` : 'הסימון בוטל');
  } catch (err) {
    SaveCtl.failed();
    ctx.mk.set(key, { st: 'err', s, reason, opId, msg: err.network ? 'לא התקבל אישור מהשרת (בעיית קליטה). לחץ ״נסה שוב״ — הסימון לא יירשם פעמיים.' : err.message });
    // כשהקליטה חוזרת — ניסיון חוזר אוטומטי מהשורה, עם אותו מזהה פעולה
    if (err.network) window.addEventListener('online', () => { const m = ctx.mk.get(key); if (m && m.st === 'err' && m.opId === opId && ctx.nav === App.nav) runMark(ctx, key, s, reason, opId); }, { once: true });
  }
  if (ctx.nav !== undefined && ctx.nav !== App.nav) return;
  redraw(ctx);
  if (ctx.liveLater && !markBusy(ctx)) { ctx.liveLater = false; freshLoad(ctx).catch(() => {}); }
}
const EF_NAMES = { n: 'שם', p: 'טלפון', a: 'סכום', t: 'שעה', h: 'קושי', c: 'גובה' };
const hTxt = (b, af) => af._e ? Object.keys(af).filter(k => k !== '_e').map(k => `${EF_NAMES[k] || k}: ${esc(String(b[k] ?? '') || '—')} ← ${esc(String(af[k] ?? '') || '—')}`).join(' · ') : af.c !== undefined ? `גובה אחראי: ${esc(b.c || 'ללא גובה')} ← ${esc(af.c)}` : `${esc(b.s || 'ממתין')} ← ${esc(af.s || 'ממתין')}${af.by && af.by !== b.by ? ' · אסף: ' + esc(af.by === '@' ? 'הגובה' : af.by) : ''}`;
// ---------- עריכה בתוך השורה ----------
// לחיצה על השעה / הסכום פותחת את השדה הזה בלבד; ״ערוך גבייה״ פותח את כל השדות של אותה גבייה (כמו בעריכה הרגילה).
// השמירה מעדכנת רק את הגבייה שנבחרה לפי המזהה שלה. בכישלון — השדות נשארים פתוחים עם מה שהוקלד, ו״שמור״ שוב.
const ALL_EF = ['n', 'p', 'a', 't', 'h', 'c'];
const efVal = (e, k) => k === 'a' ? String(num(e.a)) : k === 'c' ? cleanColl(e.c) : String(e[k] ?? '');
function inlineEditor(ctx, e) {
  const E = ctx.edit, v = (k) => E.vals[k] ?? efVal(e, k), dis = E.busy ? ' disabled' : '';
  const L = (k, inner, wide) => `<label class="f${wide ? ' ied-w' : ''}">${EF_NAMES[k]}${inner}</label>`;
  const fld = {
    n: () => L('n', `<input class="in" data-ei="n" value="${esc(v('n'))}" autocomplete="off"${dis}>`, true),
    p: () => L('p', `<input class="in num" data-ei="p" type="tel" inputmode="tel" value="${esc(v('p'))}" autocomplete="off"${dis}>`),
    a: () => L('a', `<input class="in num" data-ei="a" inputmode="decimal" value="${esc(v('a'))}" autocomplete="off"${dis}>`),
    t: () => L('t', `<input class="in num" data-ei="t" type="time" value="${esc(normTime(v('t')) || '')}"${dis}>`),
    h: () => L('h', `<select class="in" data-ei="h"${dis}>${['', 'קשה', 'לא קשה'].map(x => `<option value="${x}" ${v('h') === x ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select>`),
    c: () => L('c', `<select class="in" data-ei="c"${dis}><option value="">ללא גובה</option>${[...new Set((ctx.collList || []).concat(v('c') ? [v('c')] : []))].map(x => `<option ${collKey(x) === collKey(v('c')) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`),
  };
  return `<div class="ied no-print" data-ied="${esc(e._k)}">${E.fields.length > 1 ? '<b class="ied-h">עריכת גבייה</b>' : ''}<div class="ied-f">${E.fields.map(k => fld[k]()).join('')}</div>
    ${E.err ? `<div class="note err" role="alert">${esc(E.err)}</div>` : ''}
    <div class="row ied-b"><button type="button" class="btn" data-esave${dis}>${E.busy ? 'שומר…' : 'שמור'}</button><button type="button" class="btn ghost" data-ecancel${dis}>ביטול</button></div></div>`;
}
function openInline(ctx, key, fields) {
  const e = (ctx.a.entries || []).find(x => x._k === key); if (!e) return;
  if (ctx.edit && ctx.edit.busy) return;
  ctx.edit = { key, fields, vals: {}, busy: false, err: '', opId: uid(), sent: '' };
  if (fields.includes('c') && !ctx.collList) import('./expense-form.js').then(m => m.collectorsList()).then(l => { ctx.collList = l; if (ctx.edit && ctx.edit.key === key) { redraw(ctx); focusInline(ctx); } }).catch(() => {});
  redraw(ctx); focusInline(ctx);
}
function focusInline(ctx) {
  const box = ctx.edit && ctx.view.querySelector(`[data-ied="${CSS.escape(ctx.edit.key)}"]`); if (!box) return;
  const f = ctx.edit.focus || ctx.edit.fields[0]; const el = $(`[data-ei="${f}"]`, box) || $('[data-ei]', box); if (!el) return;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  if (f === 'a' && el.select) el.select(); // הסכום הקיים מסומן ומוכן לעריכה
  if (f === 't' && el.showPicker && !ctx.edit.picked) { ctx.edit.picked = true; try { el.showPicker(); } catch { /* */ } }
  // השדה הפתוח צריך להיות גלוי: מתחת לשורת החיפוש הדביקה ומעל סרגל הלשוניות (פס הוואטסאפ מוסתר בזמן עריכה)
  const top = (($('.search', ctx.view) || box).getBoundingClientRect().bottom || 0) + 8, bottom = innerHeight - 90, rc = box.getBoundingClientRect();
  if (rc.bottom > bottom) window.scrollBy(0, Math.min(rc.bottom - bottom, rc.top - top)); else if (rc.top < top) window.scrollBy(0, rc.top - top);
}
async function saveInline(ctx) {
  const E = ctx.edit; if (!E || E.busy) return;
  const e = (ctx.a.entries || []).find(x => x._k === E.key); if (!e) { ctx.edit = null; return redraw(ctx); }
  const set = {}; for (const k of E.fields) if (k in E.vals && String(E.vals[k]) !== efVal(e, k)) set[k] = E.vals[k];
  if (!Object.keys(set).length) { ctx.edit = null; return redraw(ctx); } // לא שונה כלום
  const sig = JSON.stringify(set); if (E.sent && E.sent !== sig) E.opId = uid(); E.sent = sig; // ניסיון חוזר עם אותם ערכים — אותו מזהה פעולה
  E.busy = true; E.err = ''; redraw(ctx); SaveCtl.saving();
  try {
    const r = await save('POST', `/api/accounts/${ctx.a.id}/entry`, { key: E.key, set, opId: E.opId }, { queue: false, label: 'עריכת גבייה של ' + e.n });
    const cur = (ctx.a.entries || []).find(x => x._k === E.key); // השורה ברשימה המוצגת עכשיו
    if (cur && r.entry) { for (const k of ALL_EF) if (!(k in r.entry)) delete cur[k]; Object.assign(cur, r.entry); }
    if (r.version > ctx.a._version) ctx.a._version = r.version;
    ctx.edit = null; SaveCtl.saved(); toast('הגבייה של ' + ((cur || e).n) + ' עודכנה');
  } catch (err) {
    E.busy = false; SaveCtl.failed();
    E.err = 'לא נשמר — ' + (err.network ? 'אין תשובה מהשרת (בעיית קליטה).' : err.message) + ' לחץ ״שמור״ כדי לנסות שוב.';
  }
  if (ctx.nav !== undefined && ctx.nav !== App.nav) return;
  redraw(ctx); if (ctx.edit) focusInline(ctx);
}
function bindInline(ctx) {
  const { view } = ctx;
  $$('[data-ef]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); openInline(ctx, b.dataset.efk, [b.dataset.ef]); });
  $$('[data-edrow]', view).forEach(b => b.onclick = (ev) => { ev.stopPropagation(); const k = b.dataset.edrow; if (ctx.edit && ctx.edit.key === k && ctx.edit.fields.length > 1 && !ctx.edit.busy) { ctx.edit = null; return redraw(ctx); } openInline(ctx, k, ALL_EF); });
  const box = ctx.edit && view.querySelector(`[data-ied="${CSS.escape(ctx.edit.key)}"]`); if (!box) return;
  box.onclick = (ev) => ev.stopPropagation();
  $$('[data-ei]', box).forEach(i => {
    const upd = () => { if (ctx.edit) { ctx.edit.vals[i.dataset.ei] = i.value; ctx.edit.focus = i.dataset.ei; } };
    i.oninput = upd; i.onchange = upd;
    i.onkeydown = (ev) => { if (ev.key === 'Enter' && i.tagName === 'INPUT') { ev.preventDefault(); upd(); saveInline(ctx); } else if (ev.key === 'Escape') { ctx.edit = null; redraw(ctx); } };
  });
  $('[data-esave]', box).onclick = () => { $$('[data-ei]', box).forEach(i => { ctx.edit.vals[i.dataset.ei] = i.value; }); saveInline(ctx); };
  $('[data-ecancel]', box).onclick = () => { ctx.edit = null; redraw(ctx); };
}
// ״שייך לגובה״ / ״העבר לגובה אחר״: שומר רק את הגובה האחראי (c). ״אסף בפועל״, הסטטוס והסכום שנגבה לא משתנים.
// אחרי שמירה מוצלחת הכרטיס עובר מיד לקבוצה של הגובה (וגם לסינון שלו), בלי לצאת מהמסך — גם כשיש חיפוש פעיל.
async function assignSheet(ctx, key) {
  const e = (ctx.a.entries || []).find(x => x._k === key); if (!e) return;
  const cur = cleanColl(e.c), has = !!collKey(cur);
  let list = []; try { const { collectorsList } = await import('./expense-form.js'); list = await collectorsList(); } catch { /* */ }
  let chosen = '', busy = false; const opId = uid();
  const s = openSheet(`<div class="hd"><h2>${has ? 'העבר לגובה אחר' : 'שייך לגובה'}</h2><button class="x" data-close>×</button></div>
    <dl class="kv"><dt>לקוח</dt><dd>${esc(e.n)}</dd><dt>סכום</dt><dd>${money(num(e.a))}</dd><dt>שעה</dt><dd>${esc(e.t || '—')}</dd><dt>גובה אחראי עכשיו</dt><dd>${esc(cur || 'ללא גובה')}</dd>${e.by ? `<dt>אסף בפועל</dt><dd>${esc(e.by === '@' ? 'הגובה עצמו' : e.by)}</dd>` : ''}</dl>
    <label class="f" style="margin-top:10px">הגובה האחראי על השורה<select class="in" id="asel"><option value="">בחר גובה…</option>${list.filter(c => collKey(c) !== collKey(cur)).map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
    <p class="small muted">משנה רק את הגובה האחראי על הגבייה של ${esc(e.n)} ביום הזה. ״אסף בפועל״, הסטטוס והסכום שנגבה לא משתנים.</p>
    <div id="aerr" role="alert"></div>
    <div class="row"><button class="btn ghost xl" data-close style="flex:1">ביטול</button><button class="btn xl" id="asave" style="flex:1" disabled>שמור שיוך</button></div>`);
  const sel = $('#asel', s.el), btn = $('#asave', s.el);
  sel.onchange = () => { chosen = sel.value; btn.disabled = !chosen || busy; $('#aerr', s.el).innerHTML = ''; };
  btn.onclick = async () => {
    if (!chosen || busy) return;
    busy = true; btn.disabled = true; sel.disabled = true; btn.textContent = 'שומר…'; SaveCtl.saving();
    try {
      const r = await save('POST', `/api/accounts/${ctx.a.id}/assign`, { key, c: chosen, opId }, { queue: false, label: 'שיוך לגובה' });
      const row = (ctx.a.entries || []).find(x => x._k === key); // השורה ברשימה המוצגת עכשיו
      if (row) { row.c = r.entry.c; row.ca = r.entry.ca; }
      if (r.version > ctx.a._version) ctx.a._version = r.version;
      if (ctx.coll && collKey(ctx.coll) !== collKey(r.entry.c)) { ctx.coll = r.entry.c; persist(ctx); } // סינון לפי גובה אחר — עוברים לסינון של הגובה החדש כדי שהכרטיס יישאר במסך
      s.close(); draw(ctx); SaveCtl.saved();
      const el = ctx.view.querySelector(`[data-key="${CSS.escape(key)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2400); }
      toast(`${e.n} שויך לגובה ${r.entry.c}`);
    } catch (err) {
      busy = false; sel.disabled = false; btn.disabled = !chosen; btn.textContent = 'שמור שיוך'; SaveCtl.failed();
      $('#aerr', s.el).innerHTML = `<div class="note err">השיוך לא נשמר — ${esc(err.network ? 'אין תשובה מהשרת (בעיית קליטה).' : err.message)} לחץ שוב ״שמור שיוך״ כדי לנסות שוב (לא יירשם פעמיים).</div>`;
    }
  };
}
async function rowSheet(ctx, key) {
  const e = ctx.a.entries.find(x => x._k === key); if (!e) return;
  const colls = await get('/api/collectors').catch(() => []);
  const s = openSheet(`<div class="hd"><h2>${esc(e.n)}</h2><button class="x" data-close>×</button></div>
    <dl class="kv"><dt>סכום</dt><dd>${money(num(e.a))}</dd><dt>שעה</dt><dd>${esc(e.t || '—')}</dd><dt>גובה אחראי</dt><dd>${esc(cleanColl(e.c) || 'ללא גובה')}${App.can.finance ? ` <button class="btn sm ghost" id="rassign">${collKey(cleanColl(e.c)) ? 'העבר לגובה אחר' : 'שייך לגובה'}</button>` : ''}</dd><dt>טלפון</dt><dd>${e.p ? `<a href="tel:${esc(e.p)}">${esc(fmtPhone(e.p))}</a>` : '—'}</dd></dl>
    <div class="grid" style="margin-top:12px">
    <label class="f">סטטוס<select class="in" id="rs">${['', 'נאסף', 'לא נאסף', 'לעבור', 'לא ענו'].map(x => `<option value="${x}" ${normStatus(e.s) === x ? 'selected' : ''}>${x || 'ממתין'}</option>`).join('')}</select></label>
    <label class="f">מי אסף בפועל<input class="in" id="rb" list="rbl" value="${esc(e.by === '@' ? 'הגובה עצמו' : (e.by || ''))}" placeholder="הגובה עצמו / שם השליח"><datalist id="rbl"><option>הגובה עצמו</option>${colls.map(c => `<option>${esc(c)}</option>`).join('')}</datalist></label>
    <label class="f">סכום שנגבה (אם חלקי)<input class="in n" id="rga" inputmode="decimal" value="${esc(e.ga ?? '')}" placeholder="${fmt(num(e.a))}"></label>
    <label class="f">אמצעי תשלום<select class="in" id="rp">${['', 'מזומן', 'העברה בנקאית', 'ביט', 'פייבוקס', 'צ׳ק', 'אחר'].map(x => `<option ${e.pmt === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="f" style="grid-column:1/-1">הערה<input class="in" id="rn" value="${esc(e.nt || '')}"></label>
    <label class="f" style="grid-column:1/-1">סיבת התיקון (נרשמת ביומן)<input class="in" id="rr" placeholder="למשל: סומן בטעות"></label></div>
    <div id="rerr"></div><button class="btn xl" id="rsave" style="margin-top:12px">שמור</button>
    ${App.can.send ? '<button class="btn wa" id="rpriv" style="margin-top:8px;width:100%">הודעה פרטית בוואטסאפ ללקוח הזה</button>' : ''}
    <h3 style="margin-top:16px">היסטוריית השורה</h3><div id="rh" class="small muted">טוען…</div>`);
  get(`/api/accounts/${ctx.a.id}/history`).then(h => {
    const L = h.filter(x => x.item === key);
    $('#rh', s.el).innerHTML = L.length ? `<div class="list">${L.map(x => { const b = JSON.parse(x.before || '{}'), af = JSON.parse(x.after || '{}'); return `<div class="li noc"><div class="t">${hTxt(b, af)}</div><div class="a small">${when(x.at)}</div><div class="m"><span>${esc(x.user_name)}</span></div></div>`; }).join('')}</div>` : 'אין שינויים מתועדים';
  }).catch(() => { $('#rh', s.el).textContent = ''; });
  const opId = uid();
  const ra = $('#rassign', s.el); if (ra) ra.onclick = () => { s.close(); assignSheet(ctx, key); };
  const rp = $('#rpriv', s.el); if (rp) rp.onclick = () => { const it = itemsOf(ctx).find(x => x.ref === key); s.close(); openPrivate([it], { col: 'accounts', id: ctx.a.id, title: ctx.a.title + ' · ' + e.n, kind: ctx.a.kind }); };
  $('#rsave', s.el).onclick = async (ev) => {
    const btn = ev.target; btn.disabled = true;
    let by = $('#rb', s.el).value.trim(); if (by === 'הגובה עצמו') by = '@';
    try {
      const r = await save('POST', `/api/accounts/${ctx.a.id}/mark`, { opId, key, s: $('#rs', s.el).value, by, ga: $('#rga', s.el).value.trim(), pmt: $('#rp', s.el).value, nt: $('#rn', s.el).value, reason: $('#rr', s.el).value }, { label: 'עדכון איסוף של ' + e.n });
      const cur = (ctx.a.entries || []).find(x => x._k === key) || e; // השורה ברשימה המוצגת עכשיו (ייתכן שהתרעננה בזמן שהחלון היה פתוח)
      Object.keys(cur).forEach(k => { if (!['_k', 'n', 'a', 't', 'p', 'c', 'h', 'pg', 'pp', 'sid', 'spl', '_notes'].includes(k)) delete cur[k]; }); Object.assign(cur, r.entry);
      if (r.version > ctx.a._version) ctx.a._version = r.version;
      s.close(); redraw(ctx); toast('נשמר'); SaveCtl.saved();
    } catch (err) { btn.disabled = false; $('#rerr', s.el).innerHTML = `<div class="note err">${esc(err.network ? 'לא נשמר בגלל בעיית קליטה. לחץ שוב ״שמור״ — הפעולה לא תירשם פעמיים.' : err.message)}</div>`; }
  };
}
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'hist') return;
  const id = location.hash.split('/')[2].split('?')[0];
  const h = await get(`/api/accounts/${id}/history`);
  openSheet(`<div class="hd"><h2>היסטוריית סימונים</h2><button class="x" data-close>×</button></div>${h.length ? `<div class="list">${h.map(x => { const b = JSON.parse(x.before || '{}'), af = JSON.parse(x.after || '{}'); return `<div class="li noc"><div class="t">${esc(x.note || '')}: ${af.c !== undefined ? hTxt(b, af) : `${esc(b.s || 'ממתין')} ← ${esc(af.s || 'ממתין')}`}</div><div class="a small">${when(x.at)}</div><div class="m"><span>${esc(x.user_name)}</span>${af.by ? `<span>אסף: ${esc(af.by === '@' ? 'הגובה' : af.by)}</span>` : ''}</div></div>`; }).join('')}</div>` : '<div class="empty">אין עדיין סימונים</div>'}`);
});

// ---------- ״פצל חוב״ (עריכת הפיצול) ----------
// מפצל חוב אחד לכמה חלקים, כל אחד עם סכום, גובה, שעה והערה. שם הלקוח, הטלפון והקושי מועתקים לכל חלק.
// החלקים מסומנים בקבוצת פיצול (pg, ״חלק 1/2״) — כל גובה רואה רק את חלקו, הלקוח נספר פעם אחת, הסכום הכולל לא משתנה.
async function splitDebtSheet(r, done) {
  if (!r) return;
  const total = r2(num(r.a)); if (!(total > 0)) return toast('אין סכום לפצל בשורה הזו');
  let known = []; try { const { collectorsList } = await import('./expense-form.js'); known = await collectorsList(); } catch { /* */ }
  // הערה כללית — מוצגת לכל הגובים שקיבלו חלק; הערה לחלק — רק לגובה של אותו חלק
  let gnote = [r.gnote, r.note].filter(v => String(v || '').trim()).join('\n');
  const parts = [{ a: '', c: String(r.c || '').trim(), t: r.t || '', note: '', touched: false }, { a: '', c: '', t: r.t || '', note: '', touched: false }];
  const s = openSheet(`<div class="hd"><h2>פצל חוב</h2><button class="x" data-close>×</button></div>
    <div class="note info"><b>${esc(String(r.n || '').trim())}</b>${r.ph ? ' · ' + esc(r.ph) : ''}<br>יתרת החוב: <b>${money(total)}</b>${r.c ? ' · כרגע אצל ' + esc(r.c) : ''}</div>
    <datalist id="spl-colls">${known.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
    <label class="f">הערה כללית (לכל החלקים)<textarea class="in" id="spl-g" rows="2" placeholder="למשל: לבקש מזומן">${esc(gnote)}</textarea></label>
    <div id="spl-parts"></div>
    <button type="button" class="btn ghost sm" id="spl-add">+ חלק נוסף</button>
    <div id="spl-st" class="note" role="status" aria-live="polite" style="margin-top:8px"></div>
    <div class="row"><button class="btn xl" id="spl-ok" style="flex:2" disabled>אשר פיצול</button><button class="btn ghost xl" data-close style="flex:1">ביטול</button></div>`);
  const box = $('#spl-parts', s.el);
  const drawP = () => {
    box.innerHTML = parts.map((p, i) => `<div class="card spl-p" style="padding:10px;margin:8px 0"><div class="row sp"><b>חלק ${i + 1}</b>${parts.length > 2 ? `<button type="button" class="btn plain sm" data-pdel="${i}">הסר חלק</button>` : ''}</div>
      <div class="grid"><label class="f">סכום (₪)<input class="in n" data-pa="${i}" inputmode="decimal" value="${esc(p.a)}" placeholder="0"></label>
      <label class="f">גובה<input class="in" data-pc="${i}" list="spl-colls" value="${esc(p.c)}" placeholder="בחר גובה" autocomplete="off"></label>
      <label class="f">שעה<input class="in num" data-pt="${i}" inputmode="numeric" value="${esc(p.t)}" placeholder="שעה"></label>
      <label class="f">הערה לחלק הזה בלבד<input class="in" data-pn="${i}" value="${esc(p.note)}" placeholder="רק לגובה של החלק"></label></div></div>`).join('');
  };
  const status = () => {
    const amts = parts.map(p => num(p.a)), dealt = r2(sum(amts)), left = r2(total - dealt);
    const bad = parts.some(p => !(num(p.a) > 0)) || Math.abs(left) > 0.004 || parts.some(p => p.t && !normTime(p.t));
    $('#spl-st', s.el).className = 'note ' + (Math.abs(left) <= 0.004 && !bad ? 'ok' : 'warn');
    $('#spl-st', s.el).innerHTML = `חולק: <b>${money(dealt)}</b> · נותר לחלוקה: <b>${money(left)}</b>${left < -0.004 ? ' — הסכומים גבוהים מהחוב' : ''}${parts.some(p => p.t && !normTime(p.t)) ? ' · שעה לא תקינה' : ''}`;
    $('#spl-ok', s.el).disabled = bad;
  };
  // ההצעה: היתרה שנותרה נכנסת לחלק שעוד לא נערך (כשנשאר בדיוק אחד כזה)
  const suggest = (from) => {
    const open = parts.filter((p, i) => i !== from && !p.touched); if (open.length !== 1) return;
    const others = r2(sum(parts.filter(p => p !== open[0]).map(p => num(p.a)))); const left = r2(total - others);
    open[0].a = left > 0 ? String(left) : ''; const inp = box.querySelector(`[data-pa="${parts.indexOf(open[0])}"]`); if (inp) inp.value = open[0].a;
  };
  box.addEventListener('input', (e) => {
    const t = e.target; const i = +(t.dataset.pa ?? t.dataset.pc ?? t.dataset.pt ?? t.dataset.pn); if (!(i >= 0)) return;
    if (t.dataset.pa != null) { parts[i].a = t.value; parts[i].touched = true; suggest(i); }
    else if (t.dataset.pc != null) parts[i].c = t.value; else if (t.dataset.pt != null) parts[i].t = t.value; else parts[i].note = t.value;
    status();
  });
  box.addEventListener('click', (e) => { const d = e.target.closest('[data-pdel]'); if (!d) return; parts.splice(+d.dataset.pdel, 1); drawP(); status(); });
  $('#spl-add', s.el).onclick = () => { parts.push({ a: '', c: '', t: r.t || '', note: '', touched: false }); drawP(); suggest(-1); status(); box.querySelector(`[data-pc="${parts.length - 1}"]`)?.focus(); };
  $('#spl-ok', s.el).onclick = () => {
    const pg = r.pg || ('p' + uid().replace(/-/g, '').slice(0, 10));
    const news = parts.map((p, i) => {
      const g = String($('#spl-g', s.el).value || '').trim();
      const o = { ...r, a: r2(num(p.a)), c: String(p.c || '').trim(), t: p.t ? normTime(p.t) : '', note: String(p.note || '').trim(), pg, pp: `${i + 1}/${parts.length}` };
      if (g) o.gnote = g; else delete o.gnote;
      if (i > 0) delete o._k; if (o.t) o.na = false; delete o.xd; return o;
    });
    s.close(); done(news);
    toast(`החוב של ${String(r.n || '').trim()} (${fmt(total)} ₪) פוצל ל-${news.length} חלקים: ${news.map(x => (x.c || 'ללא גובה') + ' ' + fmt(x.a) + ' ₪').join(' · ')}. לחץ ״שמור שינויים״ כדי לשמור.`);
  };
  drawP(); status();
}

// ---------- עריכה ----------
const COLS = {
  morning: { rows: [['n', 'לקוח'], ['i', 'ריבית', 'n'], ['p', 'קרן', 'n']], loans: [['n', 'הלוואה'], ['a', 'סכום', 'n']] },
  collectors: { entries: [['n', 'שם'], ['a', 'סכום', 'n'], ['c', 'גובה'], ['k', 'סוג', 'k'], ['t', 'שעה']] },
  split: { records: [['n', 'שם'], ['ph', 'טלפון'], ['a', 'יתרה', 'n'], ['c', 'גובה'], ['t', 'שעה'], ['h', 'קושי', 'h'], ['note', 'הערה', 'ta'], ['side', 'לא היום', 'b']] },
  work: { entries: [['n', 'שם'], ['p', 'טלפון'], ['a', 'סכום', 'n'], ['c', 'גובה'], ['t', 'שעה'], ['h', 'קושי', 'h']], expenses: [['n', 'הוצאה'], ['a', 'סכום', 'n'], ['c', 'גובה']] },
};
const LIST_NAMES = { rows: 'שורות גבייה (ריבית/קרן)', loans: 'הלוואות שיצאו', entries: 'שורות', records: 'לקוחות', expenses: 'הוצאות' };
function renderEditor(ctx) {
  const a = structuredClone(ctx.a); const { view } = ctx; const spec = COLS[a.kind];
  const openMg = new Set(); let edCgOpen = true;
  // חיפוש לפי שם הלקוח ברשימת ״איסוף יום״: מסתיר שורות שלא מתאימות (בלי לצייר מחדש — המקלדת לא נסגרת).
  // השורות עצמן לא משתנות: עריכה בתוצאה מעדכנת את השורה המקורית, ו״שמור״ שומר את כל הרשימה.
  const edQ = {}; const searchable = (li) => a.kind === 'work' && li === 'entries';
  const applyQ = (li) => {
    const t = $(`table[data-tl="${li}"]`, view); if (!t) return;
    // אותיות סופיות כמו רגילות (״עידן״ מוצא גם ״עידני״)
    const fold = (v) => normName(v).replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })[c]);
    const q = fold(edQ[li] || ''); let shown = 0;
    $$('tbody tr', t).forEach(tr => { const n = tr.querySelector(`[data-l="${li}"][data-k="n"]`); const nm = n ? fold(n.value) : ''; const ok = !q || !nm || nm.includes(q); tr.hidden = !ok; if (ok) shown++; });
    const em = $(`[data-edqe="${li}"]`, view); if (em) em.hidden = !q || shown > 0;
    const x = $(`[data-edqx="${li}"]`, view); if (x) x.hidden = !q;
  };
  // ״שמור שינויים״ בעריכה: שומר את כל השורות שנערכו בלחיצה אחת ונשאר באותו מקום. ״שמור וסיים״ חוזר לתצוגה
  let dirty = false, opIdE = uid(), editedAt = 0;
  // editedAt = מתי הוקלד השינוי בפועל. אירוע change של שדה טקסט מגיע לפעמים רק ביציאה מהשדה (למשל בלחיצה על ״שמור״), ולכן הוא לא מזיז את הזמן אם כבר נרשמה הקלדה
  const touch = (late) => { dirty = true; if (!(late && editedAt)) editedAt = Date.now(); SaveCtl.dirty(); };
  timesHooks(ctx);
  const saveE = async () => {
    if (a.kind === 'split') (a.records || []).forEach(r => { if (r.n && !r.fn) { const p = String(r.n).trim().split(' '); r.fn = p[0]; r.ln = p.slice(1).join(' '); } });
    const data = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]);
    if (editedAt) data._editedAt = editedAt;
    const errEl = () => $('#ed-err', view);
    try {
      const out = await save('PUT', '/api/accounts/' + a.id, { data, baseVersion: ctx.a._version, opId: opIdE }, { label: 'שמירת ' + a.title, queue: false });
      ctx.a._version = out.version; a._version = out.version; opIdE = uid(); dirty = false; editedAt = 0; if (errEl()) errEl().innerHTML = '';
      if (out.times) { ctx.a._times = out.times; paintTimes(out.times); }
      return true;
    } catch (e) {
      if (errEl()) errEl().innerHTML = `<div class="note err">השמירה נכשלה — נסה שוב. ${esc(e.network ? 'אין קליטה. הערכים שהקלדת נשארו במסך.' : e.message)}${e.status === 409 ? ' <a href="#/acc/' + a.id + '">פתח את הגרסה העדכנית</a>' : ''}</div>`;
      return false;
    }
  };
  SaveCtl.register('editor', { isDirty: () => dirty, save: saveE, discard: () => { dirty = false; } });
  const opId = uid();
  const cell = (r, [k, , t], li, ri) => {
    const v = r[k] ?? '';
    if (t === 'k') return `<select class="in" data-l="${li}" data-r="${ri}" data-k="${k}"><option value="d" ${v !== 'e' ? 'selected' : ''}>חוב</option><option value="e" ${v === 'e' ? 'selected' : ''}>הוצאה</option></select>`;
    if (t === 'h') return `<select class="in" data-l="${li}" data-r="${ri}" data-k="${k}"><option></option><option ${v === 'קשה' ? 'selected' : ''}>קשה</option><option ${v === 'לא קשה' ? 'selected' : ''}>לא קשה</option></select>`;
    if (t === 'b') return `<input type="checkbox" data-l="${li}" data-r="${ri}" data-k="${k}" ${v ? 'checked' : ''}>`;
    if (t === 'ta') return `<textarea class="in edta" rows="1" data-l="${li}" data-r="${ri}" data-k="${k}">${esc(v)}</textarea>`; // הערה: נשמרים מעברי השורה
    const extra = k === 'c' ? ' list="ed-colls" autocomplete="off"' : (k === 'n' && a.kind === 'collectors' && r.k === 'e' ? ' placeholder="תיאור ההוצאה (שליח, דלק…)"' : '');
    return `<input class="in ${t === 'n' ? 'n' : ''}" ${t === 'n' ? 'inputmode="decimal"' : ''}${extra} data-l="${li}" data-r="${ri}" data-k="${k}" value="${esc(v)}">`;
  };
  // עדכון הסיכום בלבד (בלי לצייר מחדש את הטבלה, כדי לא לאבד את מה שמקלידים)
  const summary = () => {
    const el = $('#ed-sum', view); if (!el) return;
    if (a.kind === 'morning') {
      const c = calcMorning(a); const pv = ctx.a.prev;
      el.innerHTML = (pv ? `<div class="note ${r2(+a.keren || 0) === pv.final ? 'ok' : 'warn'}">הקרן הסופית של החשבון הקודם (${dmy(pv.date)}): <b>${fmt(pv.final)}</b>. הקרן הקיימת צריכה להיות שווה לה כדי שהקרן תיספר פעם אחת. ${r2(+a.keren || 0) !== pv.final ? `<button class="btn sm" id="ed-carry">העתק ${fmt(pv.final)}</button>` : '✓'}</div>` : '')
        + `<div class="note info">קרן סופית לפי הנתונים: <b>${money(c.final)}</b> (ריבית ${fmt(c.interest)}, קרן ${fmt(c.principal)}, משלוחים ${fmt(c.courier)}, הלוואות ${fmt(c.loansTotal)})</div>`;
      const cy = $('#ed-carry', view); if (cy) cy.onclick = () => { a.keren = pv.final; $('#ed-keren', view).value = pv.final; summary(); };
    } else if (a.kind === 'work') { const c = calcWork((a.entries || []).filter(e => e && (e.n || e.a))); el.innerHTML = `<div class="note info">צפוי ${money(c.total)} · נגבה ${money(c.gotTotal)} · הוצאות ${money(sum(wExpList(a).map(x => x.a)))}</div>`; }
    else if (a.kind === 'split') { const c = calcSplit(a.records || []); el.innerHTML = `<div class="note info">${customerCount(a.records)} לקוחות · סה״כ גובים ${money(c.grand)} · סה״כ הכול ${money(c.all)}</div>`; const h = $('#ed-h-records', view); if (h) h.textContent = `${LIST_NAMES.records} (${customerCount(a.records)})`; $$('tr.mghead', view).forEach(tr => { const g = mgGroups(a.records).get(tr.dataset.mg); const s = tr.querySelector('.mgsum'); if (g && s) s.innerHTML = money(mgTotal(g)); }); }
    else if (a.kind === 'collectors') {
      const c = calcCollectors((a.entries || []).filter(e => e && (e.n || num(e.a) || e.k === 'e')));
      el.innerHTML = `<div class="note info" id="ed-ctot">חובות ${money(c.totalDebts)} · הוצאות ${money(c.totalExp)} · נטו ${money(c.totalNet)}</div>
        <details class="ed-cg" ${edCgOpen ? 'open' : ''}><summary>סיכום לפי גובה (${c.groups.length})</summary><div class="tbl-wrap"><table><thead><tr><th>גובה</th><th class="a">חובות</th><th class="a">הוצאות</th><th class="a">נטו</th></tr></thead><tbody>${c.groups.map(g => `<tr data-cg="${esc(g.c)}"><td>${esc(g.c)}</td><td class="a">${money(g.debtTotal)}</td><td class="a">${money(g.expTotal)}</td><td class="a"><b>${money(g.net)}</b></td></tr>`).join('')}</tbody></table></div></details>`;
      const d = $('.ed-cg', el); if (d) d.ontoggle = () => { edCgOpen = d.open; };
    }
  };
  // פיצול: חובות מאוחדים (mg) מוצגים כשורה אחת של הלקוח עם ״פירוט חובות״; כל חוב נשאר שורה עם הגובה שלו
  const rowTr = (r, ri, li, cols, cls = '') => `<tr class="${cls}${a.kind === 'collectors' && r.k === 'e' ? ' exp-row' : ''}"><td>${ri + 1}${a.kind === 'collectors' && r.k === 'e' ? '<div class="pill warn exp-tag">הוצאה</div>' : ''}${r.pp ? `<div class="pill acc" title="חלק של חוב שפוצל">חלק ${esc(r.pp)}</div>` : ''}</td>${cols.map(c => `<td>${cell(r, c, li, ri)}</td>`).join('')}<td class="rowacts">${a.kind === 'split' && li === 'records' ? `<button type="button" class="btn ghost sm" data-spl="${ri}">פצל חוב</button>` : ''}<button class="x" data-del="${li}|${ri}" aria-label="מחק">×</button></td></tr>`;
  const tbody = (li, cols) => {
    const list = a[li] || [];
    if (!(a.kind === 'split' && li === 'records')) return list.map((r, ri) => rowTr(r, ri, li, cols)).join('');
    const G = mgGroups(list), shown = new Set(); let out = '';
    list.forEach((r, ri) => {
      const g = r && r.mg && G.get(r.mg);
      if (!g) { out += rowTr(r, ri, li, cols); return; }
      if (shown.has(r.mg)) return; shown.add(r.mg);
      const open = openMg.has(r.mg);
      out += `<tr class="mghead" data-mg="${esc(r.mg)}"><td>${ri + 1}</td><td colspan="${cols.length}"><div class="row" style="flex-wrap:wrap;gap:6px 14px;justify-content:flex-start;max-width:min(78vw,640px)"><span><b>${esc(String(r.n || '').trim())}</b> <span class="pill acc">${g.length} חובות</span></span><span>יתרה <b class="mgsum">${money(mgTotal(g))}</b></span><button class="btn ghost sm" data-mgd="${esc(r.mg)}" aria-expanded="${open}">${open ? 'סגור פירוט' : 'פירוט חובות'}</button><button class="btn ghost sm" data-mgsep="${esc(r.mg)}">הפרד לשורות</button></div></td><td></td></tr>`;
      if (open) {
        out += `<tr class="mgdet"><td></td><td colspan="${cols.length}"><div class="mglines">${g.map(x => `<div>${esc(String(x.c || '').trim() || 'ללא גובה')} — ${money(num(x.a))}${x.t ? ' · ' + esc(x.t) : ''}${x.note ? ' · ' + esc(x.note) : ''}</div>`).join('')}</div><button class="btn plain sm" data-mgu="${esc(r.mg)}">ביטול האיחוד של ${esc(String(r.n || '').trim())}</button></td><td></td></tr>`;
        g.forEach(x => { out += rowTr(x, list.indexOf(x), li, cols, 'mgpart'); });
      }
    });
    return out;
  };
  const drawE = () => {
    view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">עריכה</div><h1>${esc(a.title)}</h1></div><div class="row no-print">${SaveCtl.button('id="hsave"')}</div></div>
    <div class="card"><div class="grid"><label class="f">תאריך<input class="in" type="date" id="ed-date" value="${esc(a.date)}"></label><label class="f">כותרת<input class="in" id="ed-title" value="${esc(a.title)}"></label>
    ${a.kind === 'morning' ? `<label class="f">קרן קיימת<input class="in n" id="ed-keren" inputmode="decimal" value="${esc(a.keren ?? '')}"></label><label class="f">משלוחים<input class="in n" id="ed-courier" inputmode="decimal" value="${esc(a.courier ?? '')}"></label>` : ''}</div>
    <div id="ed-sum"></div></div>
    ${Object.entries(spec).map(([li, cols]) => `<div class="card"><div class="row sp"><h2 id="ed-h-${li}">${LIST_NAMES[li]} (${a.kind === 'split' && li === 'records' ? customerCount(a[li]) : (a[li] || []).length})</h2><div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn ghost sm" data-paste="${li}">הדבקה מאקסל</button><button class="btn sm" data-add="${li}">+ שורה</button>${a.kind === 'collectors' && li === 'entries' ? `<button class="btn sm exp-add" data-addx="${li}">+ הוצאה</button>` : ''}</div></div>
      ${searchable(li) ? `<div class="edsearch" role="search"><input class="in" type="search" data-edq="${li}" value="${esc(edQ[li] || '')}" placeholder="חיפוש לפי שם הלקוח" aria-label="חיפוש לפי שם הלקוח" dir="rtl" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button type="button" class="edq-x" data-edqx="${li}" aria-label="נקה חיפוש" ${edQ[li] ? '' : 'hidden'}>נקה חיפוש</button></div>` : ''}
      <div class="tbl-wrap"><table data-tl="${li}"><thead><tr><th>#</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${tbody(li, cols)}</tbody></table></div>${searchable(li) ? `<div class="empty edq-empty" data-edqe="${li}" hidden>לא נמצאו שורות בשם הזה</div>` : ''}</div>`).join('')}
    ${(R.editorActions[a.kind] || []).length ? `<div class="card row">${R.editorActions[a.kind].map((x, i) => `<button class="btn ghost" data-eact="${i}">${esc(x.label)}</button>`).join('')}</div>` : ''}
    <div class="actionbar edbar${edMin() ? ' is-min' : ''}" id="edbar">
      <button type="button" class="ed-tab" id="edtab" aria-expanded="false" aria-controls="edbody">פעולות <span class="ed-dot" data-dirtydot hidden aria-label="יש שינויים שטרם נשמרו"></span> <span aria-hidden="true">⌃</span></button>
      <div class="ed-body" id="edbody"><div class="wa-top"><b>פעולות</b><button type="button" class="btn plain sm wa-minbtn" id="edmin" aria-expanded="true" aria-controls="edbody">מזער <span aria-hidden="true">⌄</span></button></div>
      <div id="ed-err"></div><div class="row" style="align-items:center"><button class="btn xl" data-save id="ed-savestay" style="flex:2">שמור שינויים</button><button class="btn ghost" id="ed-save" style="flex:1">שמור וסיים</button><a class="btn plain" href="#/acc/${a.id}" style="flex:1">ביטול</a></div><span class="savest small" data-savest role="status" aria-live="polite"></span><div class="acctimes small" data-acctimes>${timesHTML(ctx.a._times)}</div></div></div>`;
    summary();
    paintSave(); // בעריכה הכפתור נמצא גם בפס התחתון הדביק
    $('#edmin', view).onclick = () => setEdMin(true); $('#edtab', view).onclick = () => setEdMin(false);
    $$('[data-edq]', view).forEach(inp => { inp.addEventListener('input', () => { edQ[inp.dataset.edq] = inp.value; applyQ(inp.dataset.edq); }); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } }); applyQ(inp.dataset.edq); });
    $$('[data-edqx]', view).forEach(b => b.onclick = () => { const li = b.dataset.edqx; edQ[li] = ''; const inp = $(`[data-edq="${li}"]`, view); inp.value = ''; applyQ(li); inp.focus(); });
    $$('[data-l], #ed-date, #ed-title, #ed-keren, #ed-courier', view).forEach(i => i.addEventListener('input', touch));
    $$('[data-addx]', view).forEach(b => b.onclick = () => {
      const li = b.dataset.addx; touch(); (a[li] ||= []).push({ n: '', a: 0, c: '', k: 'e', t: '' }); drawE();
      const ins = $$(`[data-l="${li}"][data-k="n"]`, view); const last = ins[ins.length - 1]; if (last) { last.scrollIntoView({ block: 'center' }); last.focus(); }
    });
    // הסכום והגובה מתעדכנים בסיכום כבר בזמן ההקלדה (בלי לצייר את הטבלה מחדש)
    $$('[data-l][data-k="a"], [data-l][data-k="c"]', view).forEach(inp => inp.addEventListener('input', () => { const r = a[inp.dataset.l][+inp.dataset.r]; if (!r) return; r[inp.dataset.k] = inp.dataset.k === 'a' ? (inp.value === '' ? 0 : num(inp.value)) : inp.value; summary(); }));
    $$('select[data-l][data-k="k"]', view).forEach(sel => sel.addEventListener('change', () => { setTimeout(() => { const y = window.scrollY; drawE(); window.scrollTo(0, y); }, 0); }));
    if (!$('#ed-colls', view)) view.insertAdjacentHTML('beforeend', '<datalist id="ed-colls"></datalist>');
    import('./expense-form.js').then(m => m.collectorsList()).then(list => { const dl = $('#ed-colls', view); if (dl && !dl.children.length) dl.innerHTML = list.map(c => `<option value="${esc(c)}"></option>`).join(''); }).catch(() => {});
    $$('[data-l]', view).forEach(inp => inp.onchange = () => { touch(inp.tagName === 'INPUT' && inp.type !== 'checkbox');
      const r = a[inp.dataset.l][+inp.dataset.r]; const k = inp.dataset.k; const col = spec[inp.dataset.l].find(c => c[0] === k);
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (col[2] === 'n') v = v === '' ? 0 : num(v);
      if (col[2] === 'b' && !v) delete r[k]; else r[k] = v;
      summary();
    });
    ['date', 'title', 'keren', 'courier'].forEach(k => { const el = $('#ed-' + k, view); if (el) el.onchange = () => { touch(true); a[k] = ['keren', 'courier'].includes(k) ? num(el.value) : el.value; summary(); }; });
    $$('[data-add]', view).forEach(b => b.onclick = () => { touch(); const li = b.dataset.add; const r = {}; spec[li].forEach(([k, , t]) => { if (t === 'n') r[k] = 0; else if (t === 'k') r[k] = 'd'; else if (t !== 'b') r[k] = ''; }); if (a.kind === 'split') Object.assign(r, { fn: '', ln: '', cnt: 1, side: false, man: 1 }); if (a.kind === 'work' && li === 'entries') r.s = ''; (a[li] ||= []).push(r); drawE(); const ins = $$(`[data-l="${li}"][data-k="n"]`, view); ins[ins.length - 1]?.focus(); });
    $$('[data-del]', view).forEach(b => b.onclick = () => { const [li, ri] = b.dataset.del.split('|'); const r = a[li][+ri]; if (confirm(`למחוק את השורה ״${r.n || ''}״?`)) { a[li].splice(+ri, 1); touch(); drawE(); } });
    $$('[data-paste]', view).forEach(b => b.onclick = () => {
      const li = b.dataset.paste; const cols = spec[li];
      const s = openSheet(`<div class="hd"><h2>הדבקה מאקסל</h2><button class="x" data-close>×</button></div><p class="small muted">העתק מאקסל עמודות בסדר הזה: ${cols.map(c => c[1]).join(' · ')}. כל שורה תתווסף לסוף הרשימה.</p><textarea class="in" id="pt" style="min-height:200px"></textarea><button class="btn xl" id="pok" style="margin-top:10px">הוסף</button>`);
      $('#pok', s.el).onclick = () => { const lines = $('#pt', s.el).value.split(/\r?\n/).filter(l => l.trim()); for (const l of lines) { const parts = l.split('\t'); const r = {}; cols.forEach(([k, , t], i) => { const v = (parts[i] || '').trim(); r[k] = t === 'n' ? num(v) : t === 'b' ? !!v : t === 'k' ? (/הוצ|^e$/.test(v) ? 'e' : 'd') : v; }); if (a.kind === 'work' && li === 'entries') r.s = ''; if (a.kind === 'split') r.man = 1; (a[li] ||= []).push(r); } s.close(); touch(); drawE(); toast(lines.length + ' שורות נוספו'); };
    });
    $$('[data-eact]', view).forEach(b => b.onclick = () => R.editorActions[a.kind][+b.dataset.eact].run(a, () => { touch(); drawE(); }, ctx));
    $$('[data-mgsep]', view).forEach(b => b.onclick = () => { const g = (a.records || []).filter(x => x && x.mg === b.dataset.mgsep); touch(); unmerge(a, b.dataset.mgsep); openMg.delete(b.dataset.mgsep); drawE(); toast(`החובות של ${String((g[0] || {}).n || '').trim()} מוצגים כ-${g.length} שורות נפרדות (סה״כ ${fmt(mgTotal(g))} ₪). לחץ ״שמור שינויים״ כדי לשמור.`); });
    $$('[data-spl]', view).forEach(b => b.onclick = () => splitDebtSheet(a.records[+b.dataset.spl], (news) => { const i = a.records.indexOf(a.records[+b.dataset.spl]); a.records.splice(i, 1, ...news); touch(); drawE(); }));
    $$('[data-mgd]', view).forEach(b => b.onclick = () => { const k = b.dataset.mgd; openMg.has(k) ? openMg.delete(k) : openMg.add(k); drawE(); });
    $$('[data-mgu]', view).forEach(b => b.onclick = () => { touch(); unmerge(a, b.dataset.mgu); openMg.delete(b.dataset.mgu); drawE(); toast('האיחוד בוטל — החובות חזרו להיות שורות נפרדות. לחץ ״שמור״ כדי לשמור.'); });
    $('#ed-save', view).onclick = async (ev) => {
      ev.target.disabled = true;
      dirty = true; // ״שמור וסיים״ שומר תמיד, גם בלי שינוי
      const ok = await SaveCtl.saveAll();
      if (ok) { toast('נשמר ✓'); location.hash = '#/acc/' + a.id; } else ev.target.disabled = false;
    };
  };
  drawE();
}
