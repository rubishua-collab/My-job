// בקשות להלוואה — מי ביקש, כמה ומתי. רישום בלבד: לא נכנס להלוואות, לקרן או לגבייה.
// מקור: app.html — לשונית 1492-1530, קוד 7088-7232, עיצוב 555-575. האוסף "loan_requests": name, amount, date, phone, note, created, updated.
import { get, save, uid } from '../api.js';
import { lreqStatus, chkLine } from './loan-flow.js';
import { chkOk } from './loans-box.js';
import { $, $$, esc, fmt, money, dmy, todayISO, toast } from '../ui.js';
import { App, onLive } from '../app.js';
import { route, more } from '../registry.js';
import { r2, sum, num, normName } from '../calc.js';

const isoLabel = dmy;
const RQ = { list: [], state: 'wait', edit: null, delFor: null, q: '', busy: false, flash: null, flT: null, xFor: null, xDate: '', xSplit: '', xOp: '', xBusy: false, xErr: '', splits: null };
const rqCanWrite = () => !!App.can.finance;
const rqCanDel = () => App.me && App.me.role === 'owner';
const rqCntTxt = n => n === 1 ? 'בקשה אחת' : fmt(n) + ' בקשות';
const rqGet = id => RQ.list.find(x => x.id === id) || null;
const failMsg = (e) => e && e.status === 409 ? 'הבקשה עודכנה ממכשיר אחר. הנתונים רועננו — בדוק ונסה שוב.'
  : e && e.network ? 'אין קליטה. הפעולה תישלח שוב אוטומטית (פס למעלה), ושום דבר לא יירשם פעמיים.' : ((e && e.message) || 'שגיאה');

const CSS = `
.rq-req{color:var(--neg);font-weight:700}
.rq-prev:empty{display:none}
.rq-fld{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted);min-width:0}
textarea.in.rq-note-in{min-height:64px}
.rq-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.rq-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;transition:border-color .2s,box-shadow .2s}
.rq-item.flash{border-color:var(--ok-fg);box-shadow:0 0 0 3px var(--ok-bg)}
.rq-item.editing{border-color:var(--accent);box-shadow:inset -4px 0 0 var(--accent)}
.rq-nm{font-weight:700;font-size:16px;overflow-wrap:anywhere}
.rq-amt{font-weight:700;font-size:17px;white-space:nowrap}
.rq-meta{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:2px 14px;color:var(--muted);font-size:13px}
.rq-meta a{color:var(--accent-ink);font-weight:600}
.rq-note{grid-column:1/-1;font-size:13.5px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--field);border:1px solid var(--line);border-radius:6px;padding:6px 10px}
.rq-act{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.rq-flow{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:13.5px}
.rq-xf{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;background:var(--field);border:1px solid var(--line);border-radius:10px;padding:10px}
.rq-xf label{flex:1 1 160px}
.rq-item .ln-confirm{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:var(--err-bg);color:var(--err-fg);border-radius:10px;padding:10px 12px;font-weight:600}
.rq-sum{position:sticky;bottom:calc(var(--tabbar-h) + 8px + env(safe-area-inset-bottom,0px));z-index:3;display:flex;flex-wrap:wrap;align-items:stretch;gap:8px 12px;background:var(--band);color:var(--band-fg);border-radius:10px;padding:12px 16px;box-shadow:0 8px 24px -10px rgba(8,20,41,.6);margin-top:10px}
@media (min-width:980px){.rq-sum{bottom:8px}}
.rq-sum:empty{display:none}
.rq-s{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;font-weight:700;font-size:17px;line-height:1.4}
.rq-s.hit{font-size:15.5px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px 10px}
.rq-s .lbl{color:var(--band-muted);font-weight:600;font-size:13px}
.rq-s .money{color:var(--gold)}
@media (max-width:520px){.rq-sum{flex-direction:column}.rq-s{font-size:16px}.rq-act .btn{flex:1 1 0}}
`;
let cssDone = false;
function css() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

// החדשות למעלה: לפי תאריך הבקשה, ובאותו תאריך לפי זמן הרישום
function rqSorted() { return RQ.list.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created || '').localeCompare(String(a.created || ''))); }
function rqItemHTML(r, can) {
  const ph = String(r.phone || '').trim(), tel = ph.replace(/[^\d+]/g, '');
  const meta = ['<span>תאריך הבקשה: <span class="num">' + esc(isoLabel(r.date)) + '</span></span>'];
  if (ph) meta.push('<span>טלפון: ' + (tel ? '<a class="num" href="tel:' + esc(tel) + '">' + esc(ph) + '</a>' : '<span class="num">' + esc(ph) + '</span>') + '</span>');
  let act = '';
  if (can) {
    act = RQ.delFor === r.id
      ? '<div class="ln-confirm"><span>למחוק את הבקשה של ' + esc(r.name) + ' על ' + money(num(r.amount)) + '?</span><button class="btn danger sm" type="button" data-rq-yes="' + esc(r.id) + '"' + (RQ.busy ? ' disabled' : '') + '>' + (RQ.busy ? 'מוחק…' : 'כן, מחק') + '</button><button class="btn plain sm" type="button" data-rq-no="1"' + (RQ.busy ? ' disabled' : '') + '>ביטול</button></div>'
      : (RQ.xFor === r.id && !r.xfer ? rqXferForm(r) : '<div class="rq-act">' + (!r.xfer ? '<button class="btn sm" type="button" data-rq-xfer="' + esc(r.id) + '">העבר ללשונית פיצול</button>' : '') + '<button class="btn ghost sm" type="button" data-rq-edit="' + esc(r.id) + '">עריכה</button>' + (rqCanDel() ? '<button class="btn danger sm" type="button" data-rq-del="' + esc(r.id) + '">מחיקה</button>' : '') + '</div>');
  }
  const flow = r.xfer ? '<div class="rq-flow"><span class="pill acc">הועברה לפיצול</span><span>תאריך עבודה: <b class="num">' + esc(isoLabel(r.xfer.date)) + '</b></span>' + lreqStatus(r) + '</div>' : '';
  return '<div class="rq-item' + (RQ.flash === r.id ? ' flash' : '') + (RQ.edit === r.id && !$('#rq-form').hidden ? ' editing' : '') + '" data-rq-id="' + esc(r.id) + '"><span class="rq-nm">' + esc(r.name) + '</span><span class="rq-amt">' + money(num(r.amount)) + '</span>' +
    '<div class="rq-meta">' + meta.join('') + '</div>' + (String(r.note || '').trim() ? '<div class="rq-note">' + esc(r.note) + '</div>' : '') + (chkLine(r) ? '<div class="rq-flow rq-chk">' + chkLine(r) + '</div>' : '') + flow + act + '</div>';
}
// ״העבר ללשונית פיצול״: תאריך העבודה (ברירת מחדל היום) והפיצול של אותו תאריך
function rqXferForm(r) {
  const ss = (RQ.splits || []).filter(a => a.date === RQ.xDate);
  return '<div class="rq-xf"><label class="rq-fld">תאריך העבודה<input class="in" type="date" id="rq-xd" value="' + esc(RQ.xDate) + '"' + (RQ.xBusy ? ' disabled' : '') + '></label>' +
    '<label class="rq-fld">לפיצול<select class="in" id="rq-xs"' + (RQ.xBusy ? ' disabled' : '') + '>' + (ss.length ? ss.map(a => '<option value="' + esc(a.id) + '"' + (RQ.xSplit === a.id ? ' selected' : '') + '>' + esc(a.title || 'פיצול') + '</option>').join('') : '<option value="">פיצול חדש לתאריך הזה</option>') + '</select></label>' +
    '<button class="btn" type="button" data-rq-xgo="' + esc(r.id) + '"' + (RQ.xBusy ? ' disabled' : '') + '>' + (RQ.xBusy ? 'מעביר…' : 'העבר') + '</button><button class="btn plain" type="button" data-rq-xno="1"' + (RQ.xBusy ? ' disabled' : '') + '>ביטול</button>' +
    (RQ.xErr ? '<div class="note err" role="alert" style="flex-basis:100%">' + esc(RQ.xErr) + '</div>' : '') + '</div>';
}
async function rqXferOpen(id) {
  RQ.xFor = id; RQ.xDate = RQ.xDate || todayISO(); RQ.xSplit = ''; RQ.xErr = ''; RQ.xOp = uid(); rqRender();
  if (!RQ.splits) { try { RQ.splits = await get('/api/accounts?kind=split'); } catch { RQ.splits = []; } }
  rqXferPick(); rqRender();
}
function rqXferPick() { const ss = (RQ.splits || []).filter(a => a.date === RQ.xDate); if (!ss.some(a => a.id === RQ.xSplit)) RQ.xSplit = ss[0] ? ss[0].id : ''; }
async function rqXferGo(id) {
  const r = rqGet(id); if (!r || RQ.xBusy) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(RQ.xDate)) { RQ.xErr = 'בחר תאריך עבודה.'; return rqRender(); }
  RQ.xBusy = true; RQ.xErr = ''; rqRender();
  try {
    const out = await save('POST', '/api/loan-req/xfer', { id, date: RQ.xDate, splitId: RQ.xSplit || undefined, opId: RQ.xOp }, { label: 'העברת בקשה לפיצול', queue: false });
    r.xfer = out.xfer; if (out.version) r._version = out.version;
    RQ.xBusy = false; RQ.xFor = null; RQ.splits = null; RQ.flash = id; rqRender();
    toast(out.already ? 'הבקשה כבר הועברה לפיצול של ' + isoLabel(out.xfer.date) : 'הבקשה של ' + r.name + ' הועברה לפיצול של ' + isoLabel(out.xfer.date));
    clearTimeout(RQ.flT); RQ.flT = setTimeout(() => { RQ.flash = null; rqRender(); }, 2600);
  } catch (e) { RQ.xBusy = false; RQ.xErr = 'ההעברה לא נשמרה: ' + failMsg(e).replace(/ הפעולה תישלח.*$/, '') + ' לחץ שוב ״העבר״ — הבקשה לא תועבר פעמיים.'; rqRender(); }
}
// שורת הסיכום: תמיד הסכום של כל הבקשות, ובזמן חיפוש גם הסכום של הבקשות שתואמות
function rqRenderSum(all, hits, q) {
  const el = $('#rq-sum'); if (!el) return;
  if (RQ.state === 'wait' && !all.length) { el.innerHTML = ''; return; }
  const tot = sum(all.map(r => num(r.amount))), ht = sum(hits.map(r => num(r.amount)));
  const allTxt = '<span>' + rqCntTxt(all.length) + ' | סה״כ מבוקש ' + money(tot) + '</span>';
  if (!q) { el.innerHTML = '<div class="rq-s all">' + allTxt + '</div>'; return; }
  el.innerHTML = '<div class="rq-s all"><span class="lbl">כל הבקשות:</span>' + allTxt + '</div>' +
    '<div class="rq-s hit"><span class="lbl">תואמות לחיפוש ״' + esc(q) + '״:</span><span>' + rqCntTxt(hits.length) + ' | סה״כ מבוקש ' + money(ht) + '</span></div>';
}
function rqRender() {
  const list = $('#rq-list'); if (!list) return;
  const all = RQ.list;
  $('#rq-n').textContent = all.length ? rqCntTxt(all.length) : '';
  const can = rqCanWrite(), nb = $('#rq-new');
  if (nb) { nb.disabled = !can; nb.title = can ? '' : 'אין לך הרשאה להוסיף בקשות'; }
  if (!can && !$('#rq-form').hidden) { $('#rq-form').hidden = true; RQ.edit = null; }
  const stEl = $('#rq-state');
  const stMsg = RQ.state === 'err' ? 'לא הצלחתי לטעון את הבקשות. רענן את הדף.' : (!can ? 'צפייה בלבד: אין לך הרשאה להוסיף, לערוך ולמחוק בקשות.' : '');
  stEl.hidden = !stMsg; stEl.className = 'note ' + (RQ.state === 'err' ? 'err' : 'info'); stEl.textContent = stMsg;
  const q = RQ.q.trim(), nq = normName(q), sorted = rqSorted(), hits = nq ? sorted.filter(r => normName(r.name).indexOf(nq) >= 0) : sorted;
  $('#rq-qclr').hidden = !RQ.q;
  if (RQ.state === 'wait' && !all.length) list.innerHTML = '<div class="empty small">טוען בקשות…</div>';
  else if (!all.length) list.innerHTML = '<div class="empty"><b>אין עדיין בקשות</b><br>' + (can ? 'לחץ על ״+ הוספת בקשה״ כדי לרשום את הראשונה.' : '') + '</div>';
  else if (!hits.length) list.innerHTML = '<div class="empty"><b>לא נמצאו בקשות עבור השם שהוזן</b><br>נקה את החיפוש כדי לראות את כל הבקשות.</div>';
  else list.innerHTML = hits.map(r => rqItemHTML(r, can)).join('');
  rqRenderSum(all, hits, q);
}
function rqFormMsg(t) { const m = $('#rq-form-msg'); if (!m) return; m.hidden = !t; m.textContent = t || ''; }
function rqAmtPrev() {
  const el = $('#rq-amt-prev'); if (!el) return;
  const v = $('#rq-f-amount').value.trim(), a = r2(num(v));
  el.innerHTML = !v ? '' : (a > 0 ? 'יירשם: ' + money(a) : '<span style="color:var(--neg)">הסכום לא מובן. כתוב מספר, למשל 10,000</span>');
}
function rqFormTitles() { const ed = !!RQ.edit; $('#rq-form-h').textContent = ed ? 'עריכת בקשה' : 'בקשה חדשה'; const b = $('#rq-save'); if (!RQ.busy) b.textContent = ed ? 'שמור שינויים' : 'שמור בקשה'; }
function rqFillForm(r) {
  RQ.edit = r ? r.id : null;
  $('#rq-f-name').value = r ? String(r.name || '') : '';
  $('#rq-f-amount').value = r ? fmt(num(r.amount)) : '';
  $('#rq-f-date').value = r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) ? r.date : todayISO();
  $('#rq-f-phone').value = r ? String(r.phone || '') : '';
  $('#rq-f-note').value = r ? String(r.note || '') : '';
  $('#rq-f-chk').value = r && chkOk(r.chk) ? String(+r.chk) : '';
  rqFormTitles(); rqFormMsg(''); rqAmtPrev();
}
function rqOpenForm(r) {
  if (!rqCanWrite()) return;
  rqFillForm(r); $('#rq-form').hidden = false; rqRender();
  setTimeout(() => { const f = $('#rq-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); const n = $('#rq-f-name'); if (n) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } } }, 60);
}
function rqCloseForm() { if (RQ.busy) return; $('#rq-form').hidden = true; RQ.edit = null; rqFormMsg(''); rqRender(); }
async function rqReload() { try { RQ.list = await get('/api/docs/loan_requests'); RQ.state = 'on'; } catch (e) { RQ.state = 'err'; if (e.status === 401) throw e; } }
async function rqSave() {
  if (RQ.busy) return;
  if (!rqCanWrite()) return rqFormMsg('אין לך הרשאה לשמור בקשות.');
  const name = $('#rq-f-name').value.replace(/\s+/g, ' ').trim(), amtRaw = $('#rq-f-amount').value.trim(), amount = r2(num(amtRaw));
  const bad = []; if (!name) bad.push('שם המבקש'); if (!(amount > 0)) bad.push('הסכום המבוקש (מספר גדול מ-0)');
  if (bad.length) { rqFormMsg('חובה למלא: ' + bad.join(' ו') + '.'); (!name ? $('#rq-f-name') : $('#rq-f-amount')).focus(); return; }
  const chkRaw = $('#rq-f-chk').value.trim();
  if (chkRaw && !chkOk(chkRaw)) { rqFormMsg('מספר השיקים צריך להיות מספר שלם, 1 ומעלה (או להשאיר ריק ולהשלים בהמשך).'); $('#rq-f-chk').focus(); return; }
  const dRaw = $('#rq-f-date').value, date = /^\d{4}-\d{2}-\d{2}$/.test(dRaw) ? dRaw : todayISO();
  const old = RQ.edit ? rqGet(RQ.edit) : null;
  if (RQ.edit && !old) return rqFormMsg('הבקשה הזו כבר לא קיימת (אולי נמחקה). סגור את הטופס והוסף בקשה חדשה.');
  const now = new Date().toISOString(), id = old ? old.id : 'Q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const doc = { name, amount, date, phone: $('#rq-f-phone').value.trim(), note: $('#rq-f-note').value.trim(), created: old && old.created ? old.created : now, updated: now };
  doc.chk = chkRaw ? +chkRaw : '';
  if (old && old.xfer) doc.xfer = old.xfer; if (old && old.given) doc.given = old.given; // עריכה לא מבטלת העברה לפיצול או אישור מסירה
  const sb = $('#rq-save'); RQ.busy = true; sb.disabled = true; sb.textContent = 'שומר…';
  let out;
  try {
    out = old ? await save('PUT', '/api/docs/loan_requests/' + encodeURIComponent(id), { data: doc, baseVersion: old._version, action: 'עריכת בקשה', note: name }, { label: 'עריכת בקשה', queue: false })
      : await save('POST', '/api/docs/loan_requests', { id, data: doc }, { label: 'בקשה חדשה', queue: false });
  } catch (e) {
    RQ.busy = false; sb.disabled = false; rqFormTitles();
    if (e.status === 409) { await rqReload(); rqRender(); }
    return rqFormMsg('השמירה נכשלה: ' + failMsg(e) + ' נסה שוב.');
  }
  RQ.busy = false; sb.disabled = false;
  const rec = Object.assign({ id, _version: out && out.version }, doc), i = RQ.list.findIndex(x => x.id === id); if (i >= 0) RQ.list[i] = rec; else RQ.list.push(rec);
  $('#rq-form').hidden = true; RQ.edit = null; rqFormTitles(); RQ.flash = id;
  rqRender(); toast(old ? 'השינויים בבקשה נשמרו' : 'הבקשה נשמרה');
  setTimeout(() => { const el = $$('[data-rq-id]').find(x => x.getAttribute('data-rq-id') === id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
  clearTimeout(RQ.flT); RQ.flT = setTimeout(() => { RQ.flash = null; rqRender(); }, 2600);
}
async function rqDelete(id) {
  const r = rqGet(id); if (!r || RQ.busy) return;
  if (!rqCanDel()) return toast('רק בעל התוכנה יכול למחוק בקשות');
  RQ.busy = true; rqRender();
  try { await save('DELETE', '/api/docs/loan_requests/' + encodeURIComponent(id), {}, { label: 'מחיקת בקשה', queue: false }); }
  catch (e) { RQ.busy = false; rqRender(); return toast('המחיקה נכשלה: ' + failMsg(e)); }
  RQ.busy = false; RQ.delFor = null; RQ.list = RQ.list.filter(x => x.id !== id);
  if (RQ.edit === id) { RQ.edit = null; $('#rq-form').hidden = true; rqFormTitles(); }
  rqRender(); toast('הבקשה של ' + r.name + ' נמחקה');
}

async function renderRequestsPage(view) {
  css();
  RQ.state = 'wait'; RQ.edit = null; RQ.delFor = null; RQ.busy = false;
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">רישום בלבד — לא נכנס להלוואות, לקרן ולגבייה</div><h1>בקשות להלוואה</h1></div>
    <button class="btn" id="rq-new" type="button">+ הוספת בקשה</button></div>
  <p class="small muted" style="margin:0 0 10px">מי ביקש הלוואה, כמה ומתי. בקשה היא רישום בלבד: היא לא נכנסת להלוואות, לקרן ולגבייה עד שפותחים הלוואה בפועל.</p>
  <div class="card" id="rq-form" hidden>
    <h2 id="rq-form-h">בקשה חדשה</h2>
    <div class="grid">
      <label class="rq-fld" for="rq-f-name"><span>שם המבקש <span class="rq-req" aria-hidden="true">*</span></span><input class="in" id="rq-f-name" type="text" autocomplete="off" aria-required="true" placeholder="לדוגמה: משה כהן"></label>
      <label class="rq-fld" for="rq-f-amount"><span>הסכום המבוקש (₪) <span class="rq-req" aria-hidden="true">*</span></span><input class="in n" id="rq-f-amount" type="text" inputmode="decimal" autocomplete="off" aria-required="true" placeholder="10,000"><span class="small muted rq-prev" id="rq-amt-prev" aria-live="polite"></span></label>
      <label class="rq-fld" for="rq-f-date">תאריך הבקשה<input class="in" id="rq-f-date" type="date"></label>
      <label class="rq-fld" for="rq-f-phone">טלפון<input class="in n" id="rq-f-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="050-0000000"></label>
    </div>
    <label class="rq-fld" for="rq-f-note" style="margin-top:10px">הערה<textarea class="in rq-note-in" id="rq-f-note" rows="2"></textarea></label>
    <label class="rq-fld" for="rq-f-chk" style="margin-top:10px">לכמה שיקים חולקה ההלוואה?<input class="in n" id="rq-f-chk" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="למשל 10"><span class="small muted">אפשר לשמור בלי מספר ולהשלים בהמשך. חובה לפני אישור מסירה.</span></label>
    <p class="small muted"><span class="rq-req">*</span> שדה חובה. התאריך מתמלא בתאריך של היום, ואפשר לשנות אותו.</p>
    <div class="row"><button class="btn" id="rq-save" type="button">שמור בקשה</button><button class="btn plain" id="rq-cancel" type="button">ביטול</button></div>
    <div class="note err" id="rq-form-msg" role="alert" hidden></div>
  </div>
  <div class="card"><div class="row sp"><h2>הבקשות</h2><span class="small muted" id="rq-n"></span></div>
    <div class="row" role="search" style="flex-wrap:nowrap"><input class="in" id="rq-q" type="search" placeholder="חיפוש לפי שם המבקש…" aria-label="חיפוש בקשה לפי שם המבקש" aria-controls="rq-list" autocomplete="off" spellcheck="false" enterkeyhint="search" value="${esc(RQ.q)}">
      <button class="btn plain" type="button" id="rq-qclr" aria-label="ניקוי החיפוש" title="ניקוי החיפוש" hidden>×</button></div>
    <div id="rq-state" class="note info" hidden></div>
    <div class="rq-list" id="rq-list"><div class="empty small">טוען בקשות…</div></div>
    <div class="rq-sum" id="rq-sum" role="status" aria-live="polite"></div></div>`;
  $('#rq-new').onclick = () => { RQ.delFor = null; rqOpenForm(null); };
  $('#rq-cancel').onclick = rqCloseForm;
  $('#rq-save').onclick = rqSave;
  $('#rq-form').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') { e.preventDefault(); rqSave(); } });
  $('#rq-f-amount').addEventListener('input', () => { rqAmtPrev(); rqFormMsg(''); });
  $('#rq-f-amount').addEventListener('blur', e => { const v = e.target.value.trim(), a = r2(num(v)); if (v && a > 0) { const f = fmt(a); if (f !== v) e.target.value = f; } });
  $('#rq-f-name').addEventListener('input', () => rqFormMsg(''));
  const qi = $('#rq-q');
  qi.addEventListener('input', () => { RQ.q = qi.value; RQ.delFor = null; rqRender(); });
  $('#rq-qclr').onclick = () => { qi.value = ''; RQ.q = ''; rqRender(); qi.focus(); };
  $('#rq-list').addEventListener('click', e => {
    const ed = e.target.closest('[data-rq-edit]'); if (ed) { const r = rqGet(ed.getAttribute('data-rq-edit')); if (r) { RQ.delFor = null; rqOpenForm(r); } return; }
    const xf = e.target.closest('[data-rq-xfer]'); if (xf) { RQ.delFor = null; rqXferOpen(xf.getAttribute('data-rq-xfer')); return; }
    const xg = e.target.closest('[data-rq-xgo]'); if (xg) { rqXferGo(xg.getAttribute('data-rq-xgo')); return; }
    if (e.target.closest('[data-rq-xno]')) { if (!RQ.xBusy) { RQ.xFor = null; RQ.xErr = ''; rqRender(); } return; }
    const dl = e.target.closest('[data-rq-del]'); if (dl) { RQ.delFor = dl.getAttribute('data-rq-del'); rqRender(); return; }
    if (e.target.closest('[data-rq-no]')) { if (!RQ.busy) { RQ.delFor = null; rqRender(); } return; }
    const y = e.target.closest('[data-rq-yes]'); if (y) { rqDelete(y.getAttribute('data-rq-yes')); return; }
  });
  $('#rq-list').addEventListener('change', e => {
    if (e.target.id === 'rq-xd') { RQ.xDate = e.target.value; rqXferPick(); rqRender(); }
    else if (e.target.id === 'rq-xs') RQ.xSplit = e.target.value;
  });
  RQ.xFor = null; RQ.xBusy = false; RQ.xErr = '';
  rqRender();
  await rqReload();
  if (RQ.delFor && !rqGet(RQ.delFor)) RQ.delFor = null;
  rqRender();
  let tm = null;
  return onLive((ev) => {
    if (ev.col !== 'loan_requests') return;
    clearTimeout(tm); tm = setTimeout(async () => { if (RQ.busy || RQ.xBusy || !$('#rq-list')) return; await rqReload().catch(() => {}); if (RQ.delFor && !rqGet(RQ.delFor)) RQ.delFor = null; rqRender(); }, 250);
  });
}
route('requests-manage', renderRequestsPage);
route('requests', renderRequestsPage); // פעיל ברגע שהנתיב הישן של הליבה יוסר
more({ href: '#/requests-manage', label: 'בקשות להלוואה — הוספה, עריכה וסיכום', can: A => A.can.finance, order: 11 });
