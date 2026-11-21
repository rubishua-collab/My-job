// מאגר הלקוחות (אוסף clients) והקמת לקוח חדש — מקור: app.html 4091-4313 (״הקמת לקוח חדש מתוך הפיצול״, nc*).
// כרטיס לקוח בלבד: לא נרשמת הלוואה ולא תשלום. בדיקת כפילויות לפי טלפון ולפי שם בדיוק כמו במקור.
import { get, save, uid } from '../api.js';
import { $, $$, esc, money, dmy, toast, openSheet } from '../ui.js';
import { App } from '../app.js';
import { num, normName, phShow, cleanPh, normHard, cleanColl } from '../calc.js';
import { BOOK, setBook, knownCollectors, nmTokens, nmKey, isRealColl } from './work-tools-lib.js';
import { ensureStyle } from './work-tools-pdf.js';

// ---- טעינת נתונים מהשרת ----
export async function loadBook(full) {
  const [b, colls] = await Promise.all([get('/api/work-tools/book' + (full ? '?full=1' : '')), get('/api/collectors').catch(() => [])]);
  setBook({ ...b, collectors: colls, full: !!full });
  return BOOK;
}

// מקור: שורה 7296
const sgNormPhone = s => String(s || '').replace(/\D/g, '').replace(/^(00)?972/, '').replace(/^0+/, '');
// מקור: שורות 4096-4100
const ncHash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const ncName = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const ncPhone = v => phShow(cleanPh(v)) || '';
const ncColl = v => { const c = cleanColl(v); return isRealColl(c) ? c : ''; };
export { ncName, ncPhone, ncColl, ncHash };

/* מקור: ncIndex (שורה 4102). כל הלקוחות שהתוכנה מכירה: מאגר הלקוחות, פיצולים, רשימות איסוף, הלוואות וחוזים. רשומה לכל שם + טלפון.
   excl: {acc,key} שורת הפיצול שממנה התחלתי (כמו excl במקור), או {client} כרטיס שנערך עכשיו */
export function ncIndex(excl) {
  const M = new Map();
  const add = (n, ph, src, x) => {
    n = ncName(n); if (!n) return; const toks = nmTokens(n); if (!toks.length) return;
    const k = nmKey(toks), p = ncPhone(ph), d = p ? sgNormPhone(p) : '', key = k + '|' + d;
    let e = M.get(key); if (!e) { e = { k, d, n, ph: p, src: new Set(), reg: false, c: '', h: '' }; M.set(key, e); }
    e.src.add(src);
    if (x) { e.reg = true; e.n = n; if (!e.c && x.c) e.c = x.c; if (!e.h && x.h) e.h = x.h; if (!e.id && x.id) e.id = x.id; }
  };
  (BOOK.clients || []).forEach(c => { if (excl && excl.client && c.id === excl.client) return; add(c.name, c.phone, 'מאגר לקוחות', { c: ncColl(c.coll), h: normHard(c.hard), id: c.id }); });
  (BOOK.splits || []).forEach(a => (a.records || []).forEach(r => { if (r && !(excl && excl.acc === a.id && excl.key === r.k)) add(r.n, r.ph, 'פיצול'); }));
  (BOOK.works || []).forEach(a => (a.entries || []).forEach(e => { if (e) add(e.n, e.p, 'איסוף יומי'); }));
  (BOOK.loans || []).forEach(L => add(L.name, L.phone, 'הלוואות'));
  (BOOK.contracts || []).forEach(r => { if (r) add(r.o, r.q, 'חוזים'); });
  const withPh = new Set(); M.forEach(e => { if (e.d) withPh.add(e.k); });
  const out = []; M.forEach(e => { if (!e.d && withPh.has(e.k) && !e.reg) return; out.push(e); });
  return out;
}
/* מקור: ncSuggest (שורה 4134). בחיפוש בלי התאמה: לקוחות קיימים מהתוכנה */
export function ncSuggest(q, idx) {
  const toks = normName(q).split(' ').filter(Boolean), dg = q.replace(/\D/g, ''), dq = dg.length >= 4 ? sgNormPhone(dg) : '';
  if (!toks.length && !dq) return [];
  const letters = /[^\d\s\-+().]/.test(q);
  return idx.filter(e => { if (letters) { const nm = normName(e.n); return toks.every(t => nm.indexOf(t) >= 0); } return !!(dq && e.d && e.d.indexOf(dq) >= 0); })
    .sort((a, b) => (b.reg ? 1 : 0) - (a.reg ? 1 : 0) || a.n.localeCompare(b.n, 'he')).slice(0, 6);
}
// מקור: ncItemHTML (שורה 4142)
export function ncItemHTML(e, attr) {
  return '<div class="wt-nc-c"><span class="nc-ci"><span class="nm">' + esc(e.n) + '</span> · <span class="num">' + esc(e.ph || 'אין טלפון') + '</span> <span class="src">· ' + esc(Array.from(e.src).join(', ')) + '</span></span>' + attr + '</div>';
}

/* טופס כרטיס לקוח (הקמה או עריכה) בתוך חלון. opts:
   {pre:{name,ph,coll,hard,note}, ctxHtml, client (לעריכה), excl, saveLabel, src,
    onPick(e) — ״בחר בלקוח הזה״ (בהקמה מתוך פיצול), onSaved(doc,id) } */
export function openClientForm(opts = {}) {
  ensureStyle();
  const edit = opts.client || null;
  const cid = edit ? edit.id : 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const opId = uid();
  const pre = opts.pre || {};
  const init = edit ? { name: edit.name || '', ph: edit.phone || '', coll: edit.coll || '', hard: edit.hard || '', note: edit.note || '' } : { name: ncName(pre.name || ''), ph: pre.ph || '', coll: pre.coll || '', hard: normHard(pre.hard), note: pre.note || '' };
  const colls = knownCollectors();
  const s = openSheet(`<div class="hd"><h2>${edit ? 'עריכת כרטיס לקוח' : 'הקמת לקוח חדש'}</h2><button class="x" data-close aria-label="סגירה בלי לשמור" title="סגירה בלי לשמור">×</button></div>
    ${opts.ctxHtml ? `<div class="note info">${opts.ctxHtml}</div>` : ''}
    <div class="grid" style="margin-top:8px">
      <label class="f">שם הלקוח *<input class="in" id="nc-name" autocomplete="off" aria-required="true" placeholder="שם פרטי ושם משפחה" value="${esc(init.name)}"></label>
      <label class="f">טלפון<input class="in" id="nc-ph" type="tel" inputmode="tel" autocomplete="off" placeholder="050-0000000" value="${esc(init.ph)}"><span class="small wt-phm" id="nc-ph-msg" aria-live="polite"></span></label>
      <label class="f">גובה קבוע<input class="in" id="nc-coll" list="nc-colls" autocomplete="off" placeholder="לא חובה" value="${esc(init.coll)}"></label>
      <label class="f">קשה / לא קשה<select class="in" id="nc-hard"><option value="">—</option><option value="קשה" ${init.hard === 'קשה' ? 'selected' : ''}>קשה</option><option value="לא קשה" ${init.hard === 'לא קשה' ? 'selected' : ''}>לא קשה</option></select></label>
    </div><datalist id="nc-colls">${colls.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
    <label class="f" style="margin-top:8px">הערה בכרטיס הלקוח<textarea class="in" id="nc-note" rows="2" placeholder="לא חובה">${esc(init.note)}</textarea></label>
    <div id="nc-dups" aria-live="polite"></div>
    <label class="wt-ack" id="nc-ack-w" hidden><input type="checkbox" id="nc-ack"> זה לקוח אחר. להקים לקוח חדש בכל זאת</label>
    <div class="row" style="margin-top:12px"><button class="btn xl" id="nc-save">${esc(opts.saveLabel || (edit ? 'שמור שינויים' : 'שמור לקוח'))}</button><button class="btn plain" data-close id="nc-cancel">ביטול</button>
      ${edit && App.me && App.me.role === 'owner' ? '<button class="btn danger sm" id="nc-del">מחיקת הכרטיס</button>' : ''}</div>
    <div class="note err" id="nc-msg" role="alert" hidden></div>
    <p class="small muted" style="margin:8px 0 0">* שדה חובה. הקמת לקוח יוצרת כרטיס לקוח בלבד: הלוואה או תשלום נרשמים רק בלשוניות שלהם.${opts.onPick ? ' ביטול לא משנה כלום בפיצול.' : ''}</p>`);
  const el = s.el; let busy = false, done = false, cands = [], idx = null, t = null;
  const msg = (tx, cls) => { const m = $('#nc-msg', el); m.hidden = !tx; m.className = 'note ' + (cls || 'err'); m.textContent = tx || ''; };
  const btn = () => { const b = $('#nc-save', el); b.disabled = busy || done; b.textContent = busy ? 'שומר…' : (opts.saveLabel || (edit ? 'שמור שינויים' : 'שמור לקוח')); };
  /* מקור: ncCheck (שורה 4182). אותו טלפון (צריך לבחור בלקוח הקיים או לאשר שזה לקוח אחר) ואותו שם (מוצגים הטלפונים לזיהוי).
     בעריכה: בודקים רק שם/טלפון שהשתנו, כדי שהכרטיס לא יתריע על עצמו */
  const check = () => {
    const box = $('#nc-dups', el);
    const name = ncName($('#nc-name', el).value), phRaw = $('#nc-ph', el).value.trim(), p = ncPhone(phRaw), d = p ? sgNormPhone(p) : '';
    const toks = nmTokens(name), k = toks.length ? nmKey(toks) : '';
    const ix = idx || (idx = ncIndex(opts.excl || (edit ? { client: edit.id } : null)));
    const phCh = !edit || sgNormPhone(ncPhone(init.ph)) !== d, nmCh = !edit || nmKey(nmTokens(init.name)) !== k;
    const byPh = d.length >= 7 && phCh ? ix.filter(e => e.d === d) : [];
    const byNm = k && nmCh ? ix.filter(e => e.k === k && !(d && e.d === d)) : [];
    cands = byPh.concat(byNm);
    const pick = i => opts.onPick ? '<button class="btn ghost sm" type="button" data-nc-pick="' + i + '">בחר בלקוח הזה</button>'
      : (cands[i].reg && cands[i].id ? '<button class="btn ghost sm" type="button" data-nc-open="' + esc(cands[i].id) + '">פתח את הכרטיס</button>' : '<a class="btn ghost sm" href="#/client/' + encodeURIComponent(normName(cands[i].n)) + '">כרטיס לקוח</a>');
    let h = '';
    if (byPh.length) h += '<div class="wt-nc-grp warn" role="alert"><b>כבר יש לקוח עם מספר הטלפון הזה</b>' + byPh.map((e, i) => ncItemHTML(e, pick(i))).join('') + '<span>אם זה אותו אדם, ' + (opts.onPick ? 'בחר בו' : 'השתמש בכרטיס הקיים') + '. אם זה לקוח אחר, סמן ״זה לקוח אחר״ למטה.</span></div>';
    if (byNm.length) h += '<div class="wt-nc-grp info"><b>' + (byNm.length === 1 ? 'יש בתוכנה לקוח בשם הזה' : 'יש בתוכנה ' + byNm.length + ' לקוחות בשם הזה') + '</b>' + byNm.map((e, i) => ncItemHTML(e, pick(byPh.length + i))).join('') + '<span>זהה את האדם לפי הטלפון. אם זה אדם אחר, אפשר להקים לקוח חדש באותו שם.</span></div>';
    box.innerHTML = h;
    $('#nc-ack-w', el).hidden = !byPh.length; if (!byPh.length) $('#nc-ack', el).checked = false;
    $('#nc-ph-msg', el).textContent = phRaw && !p ? 'מספר הטלפון לא תקין. כתוב למשל 050-1234567' : '';
  };
  ['nc-name', 'nc-ph'].forEach(id => $('#' + id, el).addEventListener('input', () => { msg(''); clearTimeout(t); t = setTimeout(check, 160); }));
  $('#nc-ph', el).addEventListener('blur', e => { const p = ncPhone(e.target.value); if (p && p !== e.target.value.trim()) { e.target.value = p; check(); } });
  $('#nc-ack', el).addEventListener('change', () => msg(''));
  $('#nc-dups', el).addEventListener('click', e => {
    const b = e.target.closest('[data-nc-pick]');
    if (b) { if (busy || done) return; const c = cands[+b.dataset.ncPick]; if (!c) return; done = true; s.close(); opts.onPick(c); return; }
    const o = e.target.closest('[data-nc-open]');
    if (o) { const c = (BOOK.clients || []).find(x => x.id === o.dataset.ncOpen); if (c) { s.close(); openClientForm({ client: c, onSaved: opts.onSaved }); } }
  });
  // מקור: ncSave (שורה 4260)
  $('#nc-save', el).onclick = async () => {
    if (busy || done) return;
    check();
    const name = ncName($('#nc-name', el).value), phRaw = $('#nc-ph', el).value.trim(), phone = ncPhone(phRaw);
    if (!name) { msg('חובה למלא שם לקוח.'); $('#nc-name', el).focus(); return; }
    if (phRaw && !phone) { msg('מספר הטלפון לא תקין. כתוב למשל 050-1234567, או השאר ריק.'); $('#nc-ph', el).focus(); return; }
    if ($('#nc-ack-w', el).hidden === false && !$('#nc-ack', el).checked) { msg('כבר יש לקוח עם מספר הטלפון הזה. ' + (opts.onPick ? 'בחר בו' : 'השתמש בכרטיס הקיים') + ', או סמן ״זה לקוח אחר״.'); return; }
    const nowIso = new Date().toISOString();
    const base = edit ? Object.fromEntries(Object.entries(edit).filter(([k]) => !['id', '_version', '_updatedAt', '_updatedBy'].includes(k))) : {};
    const doc = { ...base, name, phone, coll: ncColl($('#nc-coll', el).value), hard: normHard($('#nc-hard', el).value), note: $('#nc-note', el).value.trim(), created: edit ? (edit.created || nowIso) : nowIso, updated: nowIso, src: edit ? (edit.src || '') : (opts.src || 'מאגר לקוחות') };
    busy = true; btn(); msg('');
    try {
      if (edit) { const r = await save('PUT', '/api/docs/clients/' + encodeURIComponent(cid), { data: doc, baseVersion: edit._version, opId }, { label: 'עדכון כרטיס לקוח ' + name }); edit._version = r.version; }
      else await save('POST', '/api/docs/clients', { id: cid, data: doc, opId }, { label: 'הקמת לקוח ' + name });
    } catch (e) {
      busy = false; btn();
      return msg('השמירה נכשלה: ' + (e.status === 409 ? 'הכרטיס עודכן ממכשיר אחר. סגור ופתח שוב.' : (e.message || 'שגיאה')) + (opts.onPick ? '. הפיצול לא השתנה' : '') + '. נסה שוב.');
    }
    busy = false; done = true;
    const rec = { id: cid, ...doc, _version: edit ? edit._version : 1 }; const j = (BOOK.clients || []).findIndex(x => x.id === cid); if (j >= 0) BOOK.clients[j] = rec; else (BOOK.clients ||= []).push(rec);
    setBook({}); s.close();
    if (opts.onSaved) await opts.onSaved(doc, cid);
    else toast(edit ? 'הכרטיס עודכן' : 'הלקוח נשמר במאגר');
  };
  const del = $('#nc-del', el);
  if (del) del.onclick = async () => {
    if (!confirm('למחוק את כרטיס הלקוח של ' + (edit.name || '') + '? (ניתן לשחזור מיומן השינויים)')) return;
    try { await save('DELETE', '/api/docs/clients/' + encodeURIComponent(cid), {}, { label: 'מחיקת כרטיס לקוח', queue: false }); BOOK.clients = (BOOK.clients || []).filter(x => x.id !== cid); s.close(); toast('הכרטיס נמחק'); opts.onSaved && opts.onSaved(null, cid); }
    catch (e) { msg(e.message); }
  };
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); if (!busy) s.close(); } });
  btn(); check();
  setTimeout(() => { const n = $('#nc-name', el); try { n.focus({ preventScroll: true }); } catch { n.focus(); } }, 60);
  return s;
}

// ---- הקמת לקוח מתוך פיצול שמור: ncApply (שורה 4203) על החשבון עצמו, ואז שמירה ----
function ncApply(a, cl, rowKey) {
  a.records ||= [];
  let r = rowKey ? a.records.find(x => x._k === rowKey) : null, added = false;
  if (r) {
    if (normName(r.n) !== normName(cl.n)) { r.fn = ''; r.ln = ''; }
    r.n = cl.n; if (cl.ph) r.ph = cl.ph;
    if (!String(r.c || '').trim() && cl.c) r.c = cl.c;
    if (!normHard(r.h) && cl.h) r.h = cl.h;
  } else {
    r = { fn: '', ln: '', n: cl.n, note: '', ph: cl.ph || '', a: 0, c: cl.c || '', side: false, h: cl.h || '', cnt: 1 }; a.records.push(r); added = true;
  }
  // כמו ״שמור״ בעורך: שם פרטי/משפחה נגזרים מהשם המלא כשהם ריקים
  if (r.n && !r.fn) { const p = String(r.n).trim().split(' '); r.fn = p[0]; r.ln = p.slice(1).join(' '); }
  return { r, added };
}
async function applyToSplit(ctx, cl, rowKey, opId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await get('/api/accounts/' + ctx.a.id);
    const res = ncApply(a, cl, rowKey);
    const data = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]);
    try { await save('PUT', '/api/accounts/' + a.id, { data, baseVersion: a._version, opId: opId + ':' + attempt, note: 'לקוח מהמאגר: ' + cl.n }, { label: 'הוספת לקוח לפיצול', queue: false }); return res; }
    catch (e) { if (e.status !== 409 || attempt) throw e; }
  }
}
const rowMatch = (r, q) => { const toks = normName(q).split(' ').filter(Boolean), dg = q.replace(/\D/g, ''); if (/[^\d\s\-+().]/.test(q)) { const nm = normName(r.n); return toks.length && toks.every(t => nm.indexOf(t) >= 0); } return dg.length >= 3 && String(r.ph || '').replace(/\D/g, '').indexOf(dg) >= 0; };

// חלון ״הקמת לקוח חדש״ במסך פיצול: חיפוש לווה, שורות הפיצול, לקוחות קיימים מהתוכנה (מקור: ncNoMatchHTML שורה 4145, initNc 4290)
export async function splitClientSheet(ctx) {
  ensureStyle();
  const s0 = openSheet('<div class="hd"><h2>הקמת לקוח חדש</h2><button class="x" data-close>×</button></div><div class="empty">טוען לקוחות…</div>');
  try { await loadBook(true); } catch (e) { s0.el.innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  const opId = uid();
  const s = openSheet(`<div class="hd"><h2>חיפוש לווה · הקמת לקוח</h2><button class="x" data-close>×</button></div>
    <div class="row"><input class="in" type="search" id="ncq" placeholder="הקלד שם של לווה או טלפון" autocomplete="off" enterkeyhint="search" style="flex:1 1 220px"><button class="btn ghost" id="nc-new">+ הקמת לקוח חדש</button></div>
    <div id="ncres" style="margin-top:8px"></div>`);
  const el = s.el; let sugg = [];
  const recs = () => (ctx.a.records || []).filter(r => r && (r.n || r.a));
  const finish = async (cl, rowKey, message) => {
    try { const res = await applyToSplit(ctx, cl, rowKey, opId); await ctx.reload(); toast(message || (res.added ? 'הלקוח ' + cl.n + ' נוסף לפיצול. בחר גובה והזן סכום' : 'נבחר לקוח קיים: ' + cl.n)); }
    catch (e) { toast('הפיצול לא נשמר: ' + e.message); }
  };
  const openForm = (row, pre) => {
    const ctxHtml = row
      ? 'הלקוח ייבחר בשורה של <b>' + esc(row.n || '(שורה בלי שם)') + '</b>' + (num(row.a) ? ' · ' + money(num(row.a)) : '') + (String(row.c || '').trim() ? ' · גובה ' + esc(row.c) : '') + '. הגובה והסכום שכבר בשורה נשארים.'
      : 'תתווסף לפיצול שורה חדשה אחת ללקוח, ואחר כך תבחר גובה ותזין סכום.';
    openClientForm({
      pre: row ? { name: row.n, ph: row.ph, coll: ncColl(row.c), hard: normHard(row.h) } : pre, ctxHtml, src: 'פיצול', saveLabel: 'שמור והוסף לפיצול',
      excl: row ? { acc: ctx.a.id, key: row._k } : null,
      onPick: (e) => finish({ n: e.n, ph: e.ph || '', c: e.c || '', h: e.h || '' }, row && row._k, 'נבחר לקוח קיים: ' + e.n + (row ? '' : ' · נוספה לו שורה בפיצול')),
      onSaved: (doc) => finish({ n: doc.name, ph: doc.phone, c: doc.coll, h: doc.hard }, row && row._k, 'הלקוח נשמר במאגר' + (row ? ' ונבחר בשורה' : ' ונוספה לו שורה בפיצול') + '. בחר גובה והזן סכום'),
    });
  };
  const render = () => {
    const q = $('#ncq', el).value.trim(); const box = $('#ncres', el);
    if (!q) { box.innerHTML = '<p class="small muted">הקלד שם או טלפון. אפשר לבחור שורה בפיצול ולהקים לה כרטיס לקוח, להוסיף לקוח קיים מהתוכנה, או להקים לקוח חדש.</p>'; return; }
    const hits = recs().filter(r => rowMatch(r, q)).slice(0, 30);
    if (hits.length) { box.innerHTML = '<div class="list">' + hits.map(r => `<div class="li noc"><div class="t">${esc(r.n || '(בלי שם)')}${r.side ? ' <span class="pill">לא היום</span>' : ''}</div><div class="a">${money(num(r.a))}</div><div class="m"><span>${esc(r.ph || 'אין טלפון')}</span><span>${esc(r.c || 'ללא גובה')}</span></div><div style="grid-column:1/-1"><button class="btn ghost sm" data-nc-row="${esc(r._k)}">הקמת לקוח לשורה הזו</button></div></div>`).join('') + '</div>'; return; }
    // ncNoMatchHTML (שורה 4145)
    const letters = /[^\d\s\-+().]/.test(q); sugg = ncSuggest(q, ncIndex(null));
    let h = '<div class="empty"><b>לא נמצא לווה בשם הזה בפיצול</b> ' + (sugg.length ? 'אפשר להוסיף לקוח קיים מהתוכנה, או להקים לקוח חדש.' : 'בדוק את האיות, או הקם לקוח חדש.') + '</div>';
    if (sugg.length) h += '<div class="wt-nc-grp info"><div class="small"><b>לקוחות קיימים בתוכנה</b></div>' + sugg.map((e, i) => ncItemHTML(e, '<button class="btn ghost sm" type="button" data-nc-add="' + i + '">הוסף לפיצול</button>')).join('') + '</div>';
    h += '<div class="row" style="margin-top:10px"><button class="btn" type="button" data-nc-q="1">' + (letters ? '+ הקמת לקוח בשם ״' + esc(q) + '״' : '+ הקמת לקוח עם הטלפון שהוקלד') + '</button></div>';
    box.innerHTML = h;
  };
  let t; $('#ncq', el).addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 160); });
  $('#nc-new', el).onclick = () => { const raw = $('#ncq', el).value.trim(), letters = /[^\d\s\-+().]/.test(raw), hasHits = !!$('[data-nc-row]', el); openForm(null, hasHits || !raw ? null : (letters ? { name: raw } : { ph: raw })); };
  $('#ncres', el).addEventListener('click', e => {
    const rb = e.target.closest('[data-nc-row]'); if (rb) { const r = recs().find(x => x._k === rb.dataset.ncRow); if (r) openForm(r); return; }
    const qb = e.target.closest('[data-nc-q]'); if (qb) { const raw = $('#ncq', el).value.trim(), letters = /[^\d\s\-+().]/.test(raw); openForm(null, letters ? { name: raw } : { ph: raw }); return; }
    const ab = e.target.closest('[data-nc-add]'); if (ab) { const x = sugg[+ab.dataset.ncAdd]; if (!x) return; ab.disabled = true; s.close(); finish({ n: x.n, ph: x.ph || '', c: x.c || '', h: x.h || '' }, null, 'הלקוח ' + x.n + ' נוסף לפיצול. בחר גובה והזן סכום'); }
  });
  render(); setTimeout(() => $('#ncq', el)?.focus(), 60);
}

// ---- מסך מאגר הלקוחות: #/clients-db  (#/clients-db/<id> פותח כרטיס לעריכה, #/clients-db/new?name=..&ph=.. הקמה) ----
export async function renderClientsDb(view, args, query) {
  ensureStyle();
  view.innerHTML = '<div class="band"><div class="grow"><div class="eyebrow">כרטיסי לקוח</div><h1>מאגר לקוחות</h1></div></div><div class="empty">טוען…</div>';
  await loadBook(true);
  const draw = () => {
    const q = ($('#dbq', view) || {}).value || '';
    const L = (BOOK.clients || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));
    const nq = normName(q), dq = q.replace(/\D/g, '');
    const rows = L.filter(c => !q || normName(c.name).includes(nq) || normName(c.coll).includes(nq) || (dq.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(dq)));
    $('#dbres', view).innerHTML = rows.length ? `<div class="muted small" style="margin:4px 2px">${rows.length} מתוך ${L.length} כרטיסים</div><div class="list">${rows.map(c => `<div class="li noc link" data-cid="${esc(c.id)}"><div class="t">${esc(c.name || '(בלי שם)')}${c.hard === 'קשה' ? ' <span class="pill err">קשה</span>' : c.hard === 'לא קשה' ? ' <span class="pill ok">לא קשה</span>' : ''}</div><div class="a small muted">${dmy(String(c.updated || c.created || '').slice(0, 10))}</div><div class="m"><span class="num">${esc(c.phone || 'אין טלפון')}</span>${c.coll ? `<span>גובה: ${esc(c.coll)}</span>` : ''}${c.note ? `<span>${esc(c.note)}</span>` : ''}${c.src ? `<span>${esc(c.src)}</span>` : ''}<a href="#/client/${encodeURIComponent(normName(c.name))}">כרטיס והיסטוריה</a></div></div>`).join('')}</div>` : '<div class="empty">אין כרטיסים' + (q ? ' שמתאימים לחיפוש' : '') + '</div>';
  };
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">כרטיסי לקוח</div><h1>מאגר לקוחות</h1></div><button class="btn sm" id="dbnew">+ לקוח חדש</button></div>
    <p class="small muted">כרטיסי הלקוח שהוקמו בתוכנה. הטלפון, הגובה ו״קשה / לא קשה״ שבכרטיס משמשים גם למילוי אוטומטי ברשימת האיסוף ובבדיקת כפילויות. כרטיס לקוח לא משנה שום סכום.</p>
    <div class="search"><input class="in" id="dbq" type="search" placeholder="חיפוש: שם, טלפון או גובה…" autocomplete="off"></div><div id="dbres"></div>`;
  const reopen = async () => { await loadBook(true); draw(); };
  $('#dbq', view).oninput = draw;
  $('#dbnew', view).onclick = () => { const q = $('#dbq', view).value.trim(), letters = /[^\d\s\-+().]/.test(q); openClientForm({ pre: q ? (letters ? { name: q } : { ph: q }) : null, onSaved: async () => { toast('הלקוח נשמר במאגר'); await reopen(); } }); };
  $('#dbres', view).addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('[data-cid]'); if (!li) return;
    const c = BOOK.clients.find(x => x.id === li.dataset.cid); if (c) openClientForm({ client: c, onSaved: async (d) => { toast(d ? 'הכרטיס עודכן' : 'הכרטיס נמחק'); await reopen(); } });
  });
  draw();
  const a0 = args && args[0];
  if (a0 === 'new') openClientForm({ pre: { name: query.get('name') || '', ph: query.get('ph') || '' }, onSaved: async () => { toast('הלקוח נשמר במאגר'); await reopen(); } });
  else if (a0) { const c = BOOK.clients.find(x => x.id === a0); if (c) openClientForm({ client: c, onSaved: async (d) => { toast(d ? 'הכרטיס עודכן' : 'הכרטיס נמחק'); await reopen(); } }); else toast('הכרטיס לא נמצא'); }
}
