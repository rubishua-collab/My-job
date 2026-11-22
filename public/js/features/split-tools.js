// פיצול: כלים סביב מסך הפיצול — שעות ושיוך לגובים, ״לא ענו״, ״לא נגבה היום״, הערות (טופלה), קשה/לא קשה,
// פיצול סכום בין גובים (✎), פיצול חוב לחלקים (״חלק 1/2״), טלפון ברשימה של, ומסך ״העברה לאיסוף יומי״ עם חלוקה אוטומטית.
// מקור: app.html 3247-4090 (בלי קריאת קובץ האקסל), 3044-3085 (arrangeCore), אירועים 4589-4760.
// הנוסחאות וכללי החלוקה הועתקו כמו שהם. שינויים מהמקור רק בשמירה: הכל נשמר בשרת על מסמך הפיצול עצמו
// (במקום טיוטה בדפדפן), היסטוריית האיזון בין ימים ב-settings/ar_hist, בחירת הגובים ב-settings/coll.sel,
// וההעברה עצמה היא פעולה אחת אטומית בשרת (server/features/split-tools.js).
import { route, accountAction, accountPanel } from '../registry.js';
import { SaveCtl } from '../savectl.js';
import { get, save, uid } from '../api.js';
import { $, $$, esc, money, dmy, todayISO, toast } from '../ui.js';
import { App, onLive } from '../app.js';
import { calcSplit, num, r2, sum, normName, normTime, timeMin, normStatus, ST_NA, ST_GOT, ST_NOT, cleanPh, phShow, normHard, cleanColl, isSagi, cmpRec, CHANGE, NOC_SP } from '../calc.js';

// ---------- כלי עזר ----------
/* fmt כמו במקור (app.html 1856-1860): הטקסט שנכתב בהערות (״נאסף כבר 1,000 ₪ ע״י…״) זהה לתוכנה המקורית */
function fmt(n) {
  n = r2(+n || 0); const neg = n < 0;
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return (neg ? '−' : '') + s;
}
const kid = () => 'r' + String(uid()).replace(/-/g, '').slice(0, 14);
const isRealColl = c => !!c && c !== CHANGE && c !== NOC_SP;
const DEF_COLL = ['רובי', 'סמיילי', 'גובאני', 'שילו', 'טל', 'גלעד', 'אושר', 'עידן', 'טאייה'];
const fmtMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const partChip = pp => pp ? ' <span class="spl" title="חלק של חוב שפוצל">חלק <span class="num">' + esc(pp) + '</span></span>' : '';
const GOT_SEG = /^(נאסף כבר|לא נאסף עדיין)\s/;
const noteNoGot = t => String(t || '').split(' · ').map(x => x.trim()).filter(x => x && !GOT_SEG.test(x)).join(' · ');
const normQ = s => String(s || '').toLowerCase().replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim();
const blockTitle = b => b.c === CHANGE ? 'לשנות במערכת' : (b.c === NOC_SP ? 'ללא גובה (להשלים)' : b.c);
const compactRec = r => ({ n: String(r.n || '').trim(), note: String(r.note || '').trim(), ph: cleanPh(r.ph), a: num(r.a), c: String(r.c || '').trim(), side: !!r.side, h: r.h || '', fn: r.fn || '', ln: r.ln || '', cnt: r.cnt || 1, ...(r.done ? { done: true } : {}), ...(r.px ? { px: true } : {}), ...(r.xs ? { xs: true } : {}), ...(r.xd ? { xd: true } : {}), ...(r.na ? { na: true } : {}), ...(r.pg ? { pg: r.pg, pp: r.pp || '' } : {}), ...(normTime(r.t) ? { t: normTime(r.t) } : {}) });
function lineParts(r, wp) { const ph = cleanPh(r.ph); return esc(r.n) + partChip(r.pp) + ' – ' + money(num(r.a)) + (wp && ph ? ' – <span class="num">' + esc(ph) + '</span>' : '') + (r.note ? ' – ' + esc(r.note) : ''); }
function armed(b, label, back) {
  if (b.dataset.armed === '1') return true;
  b.dataset.armed = '1'; b.textContent = label; b.classList.add('armed');
  setTimeout(() => { if (b.isConnected) { b.dataset.armed = '0'; b.textContent = back; b.classList.remove('armed'); } }, 4000);
  return false;
}
// שמירת מיקום הסמן אחרי ציור מחדש
const focusKey = () => { const el = document.activeElement; return el && el.dataset && el.dataset.fk ? { fk: el.dataset.fk, pos: el.selectionStart } : null; };
const refocus = (f) => { if (!f) return; const el = document.querySelector('[data-fk="' + CSS.escape(f.fk) + '"]'); if (el) { el.focus(); try { if (f.pos != null) el.setSelectionRange(f.pos, f.pos); } catch { /* */ } } };

let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `
.spt .pl{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-top:1px solid var(--line)}
.spt .pl:first-child{border-top:0}
.spt .pl-t{flex:1 1 200px;min-width:0;overflow-wrap:anywhere}
.spt .tm{width:76px;min-height:40px;text-align:center}
.spt .stb{min-height:40px;padding:4px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--fg);font-size:13px;cursor:pointer}
.spt .stb[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.spt select.mv,.spt select.in{min-height:40px;max-width:170px}
.spt .ph{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding:8px 10px;background:var(--surface2);border-radius:10px;font-weight:700}
.spt .sub{font-size:14px;color:var(--muted);padding:6px 0;text-align:end}
.spt .grp-h{font-weight:700;margin-top:6px}.spt .grp-h.hard{color:var(--neg)}.spt .grp-h.easy{color:var(--ok-fg)}
.spl{display:inline-block;padding:0 6px;border-radius:999px;background:var(--accent-soft);color:var(--accent-ink);font-size:12px;font-weight:700}
.spt .spx,.spt .cut{border:1px solid var(--accent);border-radius:12px;padding:10px;margin:6px 0;display:flex;flex-direction:column;gap:8px;background:var(--surface)}
.spt .spx-h,.spt .cut-h{font-weight:800}
.spt .prow,.spt .cutp{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.spt .prow .in,.spt .cutp .in{flex:1 1 90px;min-width:80px}
.spt .cutok{color:var(--ok-fg)}.spt .cutbad{color:var(--neg);font-weight:700}
.spt label.f{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
.spt .chip-ck{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--surface)}
.spt .chip-ck input{width:20px;height:20px}
.spt .x.armed{color:var(--neg);font-size:13px;width:auto}
.spt table.ed td{padding:3px}.spt table.ed .in{min-height:38px;min-width:90px}
.spt table.ed tr.miss td{background:color-mix(in srgb,var(--err-bg) 60%,transparent)}
.spt table.ed tr.unc td{background:color-mix(in srgb,var(--warn-bg) 60%,transparent)}
.spt .xfe{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.spt .xfe .xno{min-width:26px;font-weight:700;color:var(--muted)}
.spt .xfe>.in{width:auto;min-width:0;flex:1 1 90px}.spt .xfe>.tm{flex:0 0 76px}.spt .xfe>select.in{flex:1 1 110px;max-width:150px}
.spt .xfe .nm{flex:2 1 140px}.spt .xfe .am{flex:1 1 80px;max-width:110px}.spt .xfe .ph2{flex:1 1 110px;max-width:150px}
.spt .xfg{display:flex;justify-content:space-between;gap:8px;margin-top:14px;padding:8px 10px;background:var(--surface2);border-radius:10px}
.spt .cutb{min-height:40px;padding:4px 10px;border-radius:10px;border:1px solid var(--accent);background:var(--surface);color:var(--accent-ink);font-weight:700;cursor:pointer}
`;
  document.head.appendChild(s);
}

// ---------- גובים: רשימה, נמחקים ובחירה להעברה (settings/coll: coll, del, sel) ----------
const CO = { d: null, p: null };
function loadColl(force) { if (CO.p && !force) return CO.p; return (CO.p = get('/api/docs/settings/coll').catch(() => ({})).then(d => { CO.d = d || {}; return CO.d; })); }
const collDeleted = () => new Set(Array.isArray(CO.d && CO.d.del) ? CO.d.del : []);
const spCollectors = recs => Array.from(new Set((recs || []).map(r => String(r.c || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'));
function knownCollectors(recs) {
  const st = CO.d && CO.d.coll, s = new Set(DEF_COLL), del = collDeleted();
  (Array.isArray(st) ? st : []).forEach(x => { if (isRealColl(x)) s.add(x); });
  spCollectors(recs).filter(isRealColl).forEach(c => s.add(c));
  const all = Array.from(s).filter(c => !del.has(c));
  const def = DEF_COLL.filter(c => all.indexOf(c) >= 0);
  const rest = all.filter(c => DEF_COLL.indexOf(c) < 0).sort((a, b) => a.localeCompare(b, 'he'));
  return def.concat(rest);
}
async function saveColl(mut) {
  for (let i = 0; i < 3; i++) {
    if (i) await loadColl(true); else await loadColl();
    const d = structuredClone(CO.d || {}); const v = d._version; delete d._version; delete d.id;
    if (mut(d) === false) return false;
    d.at = Date.now();
    try { const out = await save('PUT', '/api/docs/settings/coll', { data: d, baseVersion: v == null ? null : v }, { label: 'רשימת הגובים' }); CO.d = { ...d, _version: out.version }; CO.p = Promise.resolve(CO.d); return true; }
    catch (e) { if (e.status === 409) continue; toast(e.message); return false; }
  }
  return false;
}
function rememberCollectors(recs) {
  const old = CO.d && CO.d.coll, s = new Set(Array.isArray(old) ? old : []), del = collDeleted();
  const add = spCollectors(recs).filter(c => isRealColl(c) && !del.has(c) && !s.has(c));
  if (!add.length) return;
  saveColl(d => { const s2 = new Set(Array.isArray(d.coll) ? d.coll : []); add.forEach(c => s2.add(c)); d.coll = Array.from(s2); });
}
const xfSel = () => new Set(Array.isArray(CO.d && CO.d.sel) ? CO.d.sel : ['עידן', 'טאייה']);
function collOptions(cur, recs) {
  const c = String(cur || '').trim(), list = knownCollectors(recs);
  if (isRealColl(c) && list.indexOf(c) < 0) list.push(c);
  const o = v => '<option value="' + esc(v) + '"' + (v === c ? ' selected' : '') + '>' + esc(v) + '</option>';
  return list.map(o).join('') + '<option value="' + CHANGE + '"' + (c === CHANGE ? ' selected' : '') + '>' + CHANGE + ' במערכת</option><option value="__none"' + (!c ? ' selected' : '') + '>ללא גובה</option>';
}

// ---------- ספר טלפונים (app.html 2523-2585): שם → טלפון מהפיצולים השמורים ומכרטיסי הלקוחות ----------
const nmTokens = s => normName(s).replace(/[-–—.,()\[\]_\/\\]/g, ' ').split(/\s+/).filter(Boolean);
const nmKey = t => t.slice().sort().join(' ');
const PB = { base: null, p: null };
function phbIngest(m, date, recs, replace) {
  const day = String(date || ''), local = new Map();
  for (const r of recs || []) {
    if (!r) continue; const p = phShow(r.ph); if (!p) continue;
    const toks = nmTokens(r.n); if (!toks.length) continue;
    const k = nmKey(toks); if (!local.has(k)) local.set(k, new Set()); local.get(k).add(p);
  }
  local.forEach((ps, k) => {
    const cur = m.get(k);
    if (!cur || day > cur.d || (replace && day === cur.d)) m.set(k, { d: day, ps });
    else if (day === cur.d) ps.forEach(p => cur.ps.add(p));
  });
}
async function phbGet(a) {
  if (!PB.p) PB.p = get('/api/split-tools/phonebook').then(o => { PB.base = o || {}; }).catch(() => { PB.base = {}; PB.p = null; });
  await PB.p;
  const m = new Map(); const o = PB.base || {};
  for (const k in o) { const v = o[k]; if (Array.isArray(v) && v.length >= 2) m.set(k, { d: String(v[0]), ps: new Set(v.slice(1)) }); }
  if (a && (a.records || []).length) phbIngest(m, a.date, a.records, true);
  return m;
}
async function phLookup(name, a) {
  const toks = nmTokens(name); if (!toks.length) return { p: '', pm: '' };
  const book = await phbGet(a); if (!book.size) return { p: '', pm: '' };
  const hit = book.get(nmKey(toks));
  if (hit) return hit.ps.size === 1 ? { p: Array.from(hit.ps)[0], pm: 'x' } : { p: '', pm: 'amb', c: Array.from(hit.ps) };
  if (toks.length < 2) return { p: '', pm: '' };
  const mine = new Set(toks), found = new Set();
  book.forEach((v, key) => {
    const bt = key.split(' '); if (bt.length < 2) return;
    const bs = new Set(bt);
    if (toks.every(x => bs.has(x)) || bt.every(x => mine.has(x))) v.ps.forEach(p => found.add(p));
  });
  if (found.size === 1) return { p: Array.from(found)[0], pm: 'a' };
  return found.size > 1 ? { p: '', pm: 'amb', c: Array.from(found) } : { p: '', pm: '' };
}

// ---------- שמירה: כל שינוי נכתב למסמך הפיצול בשרת (PUT עם baseVersion + opId) ----------
function holder(a, onReload) {
  const H = {
    a, onReload, chain: Promise.resolve(true), t: null, pend: false,
    save(label) { clearTimeout(H.t); H.pend = false; H.chain = H.chain.then(() => doSave(H, label)); return H.chain; },
    later(label) { clearTimeout(H.t); H.pend = true; SaveCtl.dirty(); H.t = setTimeout(() => H.save(label), 1200); },
    flush() { return H.pend ? H.save() : H.chain; },
  };
  return H;
}
async function doSave(H, label = 'שמירת הפיצול') {
  const data = structuredClone(H.a); ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]);
  SaveCtl.saving();
  try { const out = await save('PUT', '/api/accounts/' + H.a.id, { data, baseVersion: H.a._version }, { label }); H.a._version = out.version; H.failed = false; if (!H.pend) SaveCtl.saved(); return true; }
  catch (e) {
    H.failed = true; SaveCtl.failed();
    if (e.status === 409) { toast('הפיצול עודכן ממכשיר אחר. נטען מחדש — בדוק ונסה שוב'); try { H.a = await get('/api/accounts/' + H.a.id); } catch { /* */ } H.onReload && H.onReload(); }
    else toast(e.network ? 'אין קליטה. השינוי יישמר כשהחיבור יחזור' : e.message);
    return false;
  }
}

// ---------- איחוד (app.html 3301-3378), הערות פתוחות (3427-3444) ----------
function mergeRecords(recs) {
  const out = [], byKey = new Map(), drop = new Set();
  for (const r of recs) {
    if (r.note || r.pg || isSagi(r.n)) { out.push(r); continue; }
    const k = normName(r.n) + '|' + normName(r.c) + '|' + (r.side ? 1 : 0);
    const hit = byKey.get(k);
    if (hit) { hit.a = r2(num(hit.a) + num(r.a)); hit.cnt = (hit.cnt || 1) + (r.cnt || 1); if (!hit.ph && r.ph) hit.ph = r.ph; if (!hit.h && r.h) hit.h = r.h; if (!hit.t && r.t) hit.t = r.t; continue; }
    byKey.set(k, r); out.push(r);
  }
  const groups = new Map();
  for (const r of out) {
    if (r.note || r.pg || isSagi(r.n) || !r.ph) continue;
    const pd = String(r.ph).replace(/\D/g, ''); if (pd.length < 7) continue;
    const k = pd + '|' + normName(r.c) + '|' + (r.side ? 1 : 0);
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
  }
  const tok = n => new Set(normName(n).split(' ').filter(Boolean));
  const sub = (A, B) => Array.from(A).every(x => B.has(x));
  let byPhone = 0;
  for (const g of groups.values()) {
    const kept = [];
    for (const r of g) {
      const A = tok(r.n); let m = null;
      for (const kk of kept) { const B = tok(kk.n); if (sub(A, B) || sub(B, A)) { m = kk; break; } }
      if (!m) { kept.push(r); continue; }
      if (A.size > tok(m.n).size) { m.n = r.n; m.fn = r.fn; m.ln = r.ln; }
      m.a = r2(num(m.a) + num(r.a)); if (!m.t && r.t) m.t = r.t; m.cnt = (m.cnt || 1) + (r.cnt || 1); m.byPhone = true; drop.add(r); byPhone++;
    }
  }
  return { recs: out.filter(r => !drop.has(r)), byPhone };
}
function mergeDebts(A, ids) {
  const recs = A.records, scope = ids ? new Set(ids) : null, groups = new Map();
  recs.forEach(r => {
    if (!r || (scope && !scope.has(r._k))) return;
    const nm = normName(r.n); if (!nm || isSagi(r.n) || r.pg) return;
    const k = nm + '|' + (r.side ? 1 : 0);
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
  });
  let people = 0, removed = 0; const split = []; const gone = new Set();
  groups.forEach(g => {
    if (g.length < 2) return;
    const main = g.reduce((m, r) => num(r.a) > num(m.a) ? r : m, g[0]);
    const seen = new Set(), notes = [];
    g.forEach(r => { const t = String(r.note || '').trim(); const key = normName(t); if (t && !seen.has(key)) { seen.add(key); notes.push(t); } });
    const colls = Array.from(new Set(g.map(r => String(r.c || '').trim()).filter(Boolean)));
    const openNote = g.some(r => String(r.note || '').trim() && !r.done);
    main.a = r2(sum(g.map(r => num(r.a))));
    main.note = notes.join(' · ');
    main.done = !!notes.length && !openNote;
    if (!String(main.ph || '').trim()) { const p = g.find(r => String(r.ph || '').trim()); if (p) main.ph = p.ph; }
    if (!main.h) { const h = g.find(r => r.h); if (h) main.h = h.h; }
    if (g.some(r => r.h === 'קשה')) main.h = 'קשה';
    if (!normTime(main.t)) { const t = g.find(r => normTime(r.t)); if (t) main.t = t.t; }
    main.cnt = g.reduce((t, r) => t + (r.cnt || 1), 0);
    g.forEach(r => { if (r !== main) gone.add(r._k); });
    people++; removed += g.length - 1;
    if (colls.length > 1) split.push(String(main.n).trim() + ' נשאר אצל ' + (String(main.c || '').trim() || 'ללא גובה'));
  });
  if (!removed) return { people: 0, removed: 0, split: [] };
  A.records = recs.filter(r => !gone.has(r._k));
  return { people, removed, split };
}
async function carrySpNotes(A) {
  const list = (await get('/api/accounts?kind=split')).filter(x => x && x.id !== A.id && String(x.date || '') < String(A.date || ''))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)) || ((y.updatedAt || y.createdAt || 0) - (x.updatedAt || x.createdAt || 0)));
  const out = { n: 0, lost: [], added: [], from: list[0] ? list[0].date : '' };
  if (!list[0]) return out;
  const prev = await get('/api/accounts/' + list[0].id);
  (prev.records || []).filter(r => r.note && !r.done).forEach(p => {
    const cur = A.records.find(r => normQ(r.n) === normQ(p.n));
    if (!cur) return;
    if (!cur.note) { cur.note = p.note; cur.carried = true; out.n++; }
    else if (normQ(cur.note).indexOf(normQ(p.note)) < 0) { cur.note = cur.note + ' · ' + p.note; cur.carried = true; out.n++; }
  });
  return out;
}
// learnNote (app.html 3253): הלימוד נשמר בדפדפן כמו במקור (yh_nw), כדי שזיהוי ההערות בקליטת קובץ ישתמש בו
function learnNote(ln, isNote) {
  const k = normName(ln); if (!k) return;
  let d; try { d = JSON.parse(localStorage.getItem('yh_nw') || 'null'); } catch { d = null; }
  const yes = new Set((d && d.yes) || []), no = new Set((d && d.no) || []);
  if (isNote) { yes.add(k); no.delete(k); } else { no.add(k); yes.delete(k); }
  try { localStorage.setItem('yh_nw', JSON.stringify({ yes: Array.from(yes), no: Array.from(no) })); } catch { /* */ }
}

// ---------- העברה לאיסוף יומי: רשימה, חלוקה אוטומטית ----------
const xferRows = A => (A.records || []).filter(r => r && !r.xd && !r.side && r.c !== CHANGE && String(r.n || '').trim() && (normTime(r.t) || r.na));

/* חלוקה אוטומטית בין גובים (app.html 3043-3085, ללא שינוי בכלל החלוקה). hist = היסטוריית settings/ar_hist במקום localStorage */
export function arrangeCore(valid, pool, names, date, hist) {
  const done = valid.filter(e => normStatus(e.s) === ST_GOT), nN = names.length;
  if (!hist || typeof hist !== 'object') hist = {};
  /* running balance from earlier days, so the extra person goes to the collector who collected fewer in total */
  const cum = names.map(nm => { let t = 0; for (const d in hist) { if (d !== date && hist[d]) t += (+hist[d][nm] || 0); } return t; });
  const baseAmt = names.map(() => 0), baseCnt = names.map(() => 0);
  done.forEach(e => { const k = names.indexOf(cleanColl(e.c)); if (k >= 0) { baseAmt[k] += num(e.a); baseCnt[k]++; } });
  /* 1. head count first: every collector gets the same number of clients, at most one person apart */
  const cnt = baseCnt.slice(), quota = names.map(() => 0);
  for (let i = 0; i < pool.length; i++) {
    let cand = [0];
    for (let j = 1; j < nN; j++) { const m = cand[0]; if (cnt[j] < cnt[m] || (cnt[j] === cnt[m] && cum[j] < cum[m])) cand = [j]; else if (cnt[j] === cnt[m] && cum[j] === cum[m]) cand.push(j); }
    const k = cand[Math.floor(Math.random() * cand.length)]; cnt[k]++; quota[k]++;
  }
  /* 2. inside those head counts, make the money totals as close as possible (swaps keep the head counts) */
  const gapOf = l => Math.max(...l) - Math.min(...l);
  let best = null;
  for (let trial = 0; trial < 150; trial++) {
    const sh = pool.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; }
    const asg = new Map(), load = baseAmt.slice(); let pos = 0;
    names.forEach((nm, k) => { for (let q = 0; q < quota[k]; q++) { const e = sh[pos++]; asg.set(e, k); load[k] += num(e.a); } });
    for (let iter = 0; iter < 300; iter++) {
      const g0 = gapOf(load); let bm = null, bg = g0 - 1e-9;
      for (let x = 0; x < pool.length; x++) { const ex = pool[x], kx = asg.get(ex);
        for (let y = x + 1; y < pool.length; y++) { const ey = pool[y], ky = asg.get(ey); if (kx === ky) continue;
          const d = num(ex.a) - num(ey.a); if (d === 0) continue;
          load[kx] -= d; load[ky] += d; const g = gapOf(load); load[kx] += d; load[ky] -= d;
          if (g < bg) { bg = g; bm = [ex, ey, kx, ky, d]; } } }
      if (!bm) break;
      asg.set(bm[0], bm[3]); asg.set(bm[1], bm[2]); load[bm[2]] -= bm[4]; load[bm[3]] += bm[4];
    }
    const g = gapOf(load);
    if (!best || g < best.g - 1e-9) { best = { g, load: load.slice(), asg: new Map(asg) }; if (g === 0) break; }
  }
  pool.forEach(e => { e.c = names[best.asg.get(e)]; e.cm = 'm'; e.u = false; });
  /* spread equal hours within each collector, earliest first; never move anyone earlier */
  let moved = 0;
  names.forEach((nm, k) => {
    const mine = pool.filter(e => best.asg.get(e) === k && !normStatus(e.s) && normTime(e.t));
    mine.map((e, i) => ({ e, i, m: timeMin(e.t), r: Math.random() })).sort((x, y) => (x.m - y.m) || (x.r - y.r)).reduce((last, o) => {
      let m = o.m; if (last !== null && m <= last) m = Math.min(last + 15, 23 * 60 + 59);
      if (m !== o.m) { o.e.t = fmtMin(m); moved++; }
      return m;
    }, null);
  });
  return { best, cum, moved, hist };
}

// מצב לכל פיצול: תצוגת ההעברה (pv), חלון פיצול לחלקים (cut), חלון ✎ (spx)
const STATE = new Map();
const stOf = (id) => { if (!STATE.has(id)) STATE.set(id, { pv: null, cut: { key: null, parts: null, dt: '', dc: '' }, spx: { open: null, draft: null }, rowsOpen: false, opId: null, busy: false }); return STATE.get(id); };

/* xfBuild (app.html 3562-3598): לא מחלק לבד; משמר שיוך ועריכות ידניות לפי השורה בפיצול */
function xfNames(A) { const known = knownCollectors(A.records); return Array.from(xfSel()).filter(c => known.indexOf(c) >= 0); }
function xfBuild(A, X) {
  const names = xfNames(A), rows = xferRows(A), old = X.pv ? X.pv.entries : [];
  const byS = new Map(); old.forEach(e => { if (e.sid) byS.set(e.sid, e); });
  const hide = new Set(A.xhide || []);
  const entries = [], mk = (r, sid, extra) => {
    if (hide.has(sid)) return;
    const o = byS.get(sid), snap = JSON.stringify([String(r.n).trim(), num(extra.a != null ? extra.a : r.a), normTime(r.t), cleanPh(r.ph), normHard(r.h), extra.c || '', r.na && !extra.s ? 1 : 0, extra.pre || '']);
    if (o && o.snap === snap) entries.push(o);
    else {
      entries.push({ id: o ? o.id : uid(), sid, snap, n: String(r.n).trim(), a: num(extra.a != null ? extra.a : r.a), t: normTime(r.t), s: extra.s || (r.na ? ST_NA : ''), p: cleanPh(r.ph), pm: cleanPh(r.ph) ? 's' : '', c: o ? o.c : (extra.c || ''), cm: (o ? o.cm : (extra.c ? 'm' : '')), h: normHard(r.h), hm: normHard(r.h) ? 'm' : '', src: 'פיצול', u: false });
      /* שיוך ידני שנשמר בשורה (xs) חוזר גם אחרי רענון */
      if (!o && !extra.c && r.xs && sid === r._k && isRealColl(cleanColl(r.c))) { const last = entries[entries.length - 1]; last.c = cleanColl(r.c); last.cm = 'm'; }
    }
    /* חלק של חוב שפוצל: מגיע לאיסוף היומי כשורה נפרדת עם "חלק 1/2" */
    const en = entries[entries.length - 1];
    if (sid === r._k && r.pg) { en.pg = r.pg; en.pp = r.pp || ''; } else { delete en.pg; delete en.pp; }
  };
  rows.forEach(r => {
    const m = /נאסף כבר\s*([\d,\.]+)\s*₪(?:\s*ע[״"]י\s*([^·]+))?/.exec(String(r.note || ''));
    const got = m ? num(m[1]) : 0, gotc = m && m[2] ? cleanColl(m[2].trim()) : '';
    const pre = !!(r.px || got), cc = cleanColl(r.c);
    mk(r, r._k, { c: pre && isRealColl(cc) ? cc : '', pre: pre ? '1' : '' });
    /* בחוב שפוצל לכמה חלקים, הסכום שכבר נאסף נכנס פעם אחת בלבד (מהחלק הראשון) */
    const gp = !r.pg || /^1\//.test(String(r.pp || ''));
    if (gp && got > 0 && isRealColl(gotc)) mk(r, r._k + '#g', { a: got, c: gotc, s: ST_GOT, pre: 'g' });
    /* פיצול שנרשם כ"עדיין לא נאסף": החלק נכנס לרשימה של הגובה עם הסטטוס "לא נאסף" */
    const mn = /לא נאסף עדיין\s*([\d,\.]+)\s*₪(?:\s*ע[״"]י\s*([^·]+))?/.exec(String(r.note || ''));
    const ngA = mn ? num(mn[1]) : 0, ngC = mn && mn[2] ? cleanColl(mn[2].trim()) : '';
    if (gp && ngA > 0 && isRealColl(ngC)) mk(r, r._k + '#g', { a: ngA, c: ngC, s: ST_NOT, pre: 'g' });
  });
  /* שורות שהוספת כאן ידנית נשמרות במסמך הפיצול עד שתמחק אותן ב-× או תעביר אותן */
  (A.xman || []).forEach(e => { if (e && typeof e === 'object') entries.push(e); });
  X.pv = { names, entries };
}
const xfGroups = pv => { const ex = []; pv.entries.forEach(e => { const c = cleanColl(e.c); if (c && pv.names.indexOf(c) < 0 && ex.indexOf(c) < 0) ex.push(c); }); return pv.names.concat(ex).concat(['']); };

/* xfSync (app.html 3653-3673): שינוי במסך ההעברה נכתב גם לשורה המקורית בפיצול */
function xfSync(H, en, f) {
  const A = H.a, sid = en && en.sid;
  if (!sid) { if (en && (A.xman || []).indexOf(en) >= 0) H.later(); return; }
  if (/#g$/.test(String(sid))) return;
  const r = (A.records || []).find(x => x && x._k === sid); if (!r) return;
  if (f === 'c') { const cc = cleanColl(en.c); r.c = cc; if (isRealColl(cc)) r.xs = true; else delete r.xs; }
  else if (f === 'h') r.h = en.h || '';
  else if (f === 't') { r.t = en.t || ''; if (en.t) r.na = false; }
  else if (f === 'n') r.n = en.n;
  else if (f === 'a') r.a = num(en.a);
  else if (f === 'p') r.ph = cleanPh(en.p);
  try {
    const a = JSON.parse(en.snap);
    a[0] = String(r.n || '').trim(); a[1] = num(r.a); a[2] = normTime(r.t); a[3] = cleanPh(r.ph); a[4] = normHard(r.h);
    en.snap = JSON.stringify(a);
  } catch (_) { /* */ }
  H.later();
}

// ---------- פיצול חוב לחלקים (app.html 3828-4000) ----------
function cutGroupFor(A, pg) {
  if (!pg) return uid();
  const moved = (A.xstash || []).concat(A.xmstash || []).some(x => x && x.pg === pg);
  return moved ? uid() : pg;
}
function cutRenum(A, pg) {
  if (!pg) return;
  const all = (A.records || []).filter(x => x && x.pg === pg).concat((A.xman || []).filter(x => x && x.pg === pg));
  if (all.length < 2) { all.forEach(x => { delete x.pg; delete x.pp; }); return; }
  all.forEach((x, i) => { x.pp = (i + 1) + '/' + all.length; });
}
function cutSrc(A, key) {
  if (!key) return null;
  const r = (A.records || []).find(x => x && x._k === key);
  if (r) { const c = cleanColl(r.c); return { kind: 'r', o: r, n: String(r.n || '').trim(), a: num(r.a), t: r.na ? '' : normTime(r.t), c: isRealColl(c) ? c : '' }; }
  const e = (A.xman || []).find(x => x && x.id === key);
  if (e) { const c = cleanColl(e.c); return { kind: 'm', o: e, n: String(e.n || '').trim(), a: num(e.a), t: normTime(e.t), c: isRealColl(c) ? c : '' }; }
  return null;
}
function cutHTML(A, X) {
  const CUT = X.cut, s = cutSrc(A, CUT.key); if (!s || !CUT.parts) return '';
  const P = CUT.parts;
  const prow = (p, i) => '<div class="cutp">' +
    '<span class="cutn">חלק ' + (i + 1) + '</span>' +
    '<input class="in num ca" data-cut-a="' + i + '" data-fk="cut-a|' + i + '" inputmode="decimal" placeholder="סכום" value="' + esc(p.a) + '" autocomplete="off" aria-label="סכום לחלק ' + (i + 1) + '">' +
    '<input class="in num ct" data-cut-t="' + i + '" inputmode="numeric" placeholder="שעה" value="' + esc(p.t) + '" autocomplete="off" aria-label="שעה לחלק ' + (i + 1) + '">' +
    '<input class="in cc" data-cut-c="' + i + '" list="spt-colls" placeholder="גובה" value="' + esc(p.c) + '" autocomplete="off" aria-label="גובה לחלק ' + (i + 1) + '">' +
    (P.length > 2 ? '<button class="x" type="button" data-cut-del="' + i + '" aria-label="הסר את חלק ' + (i + 1) + '">×</button>' : '') + '</div>';
  return '<div class="cut" data-cut-box="1">' +
    '<div class="cut-h">פיצול החוב של ' + esc(s.n || '(בלי שם)') + ' · ' + money(s.a) + '</div>' +
    '<div class="small muted">כל חלק מגיע לאיסוף היומי כשורה נפרדת, עם הסכום, השעה והגובה שלו. חלק בלי שעה נשאר כאן בפיצול עד שתרשום לו שעה. גובה ריק = יחולק עם כולם ב״חלק אוטומטית״.</div>' +
    P.map(prow).join('') +
    '<div class="small" data-cut-rem></div>' +
    '<div class="row"><button class="btn ghost sm" type="button" data-cut-add="1">+ חלק נוסף</button><button class="btn sm" type="button" data-cut-go="1">פצל</button><button class="btn plain sm" type="button" data-cut-x="1">ביטול</button>' +
    (s.o.pg ? '<button class="btn plain sm" type="button" data-cut-join="1">אחד בחזרה את החלקים</button>' : '') + '</div></div>';
}
function cutRem(A, X, box) {
  const CUT = X.cut, s = cutSrc(A, CUT.key), el = box && box.querySelector('[data-cut-rem]'); if (!s || !el || !CUT.parts) return;
  const got = r2(sum(CUT.parts.map(p => num(p.a)))), left = r2(s.a - got), bad = Math.abs(left) > 0.004;
  el.className = 'small ' + (bad ? 'cutbad' : 'cutok');
  el.textContent = 'סכום החוב ' + fmt(s.a) + ' ₪ · חולק ' + fmt(got) + ' ₪ · ' + (bad ? (left > 0 ? 'נותר לחלוקה ' + fmt(left) + ' ₪' : 'יותר מהחוב ב-' + fmt(-left) + ' ₪') : 'מחולק במלואו');
}
/* doCut (app.html 3898-3937). מחזיר הודעה, או null אם לא בוצע */
function doCut(A, X) {
  const CUT = X.cut, s = cutSrc(A, CUT.key); if (!s) { CUT.key = null; CUT.parts = null; toast('השורה כבר לא ברשימה'); return null; }
  const P = CUT.parts.map(p => { let c = cleanColl(String(p.c || '').trim().replace(/\s+/g, ' ')); if (c === NOC_SP) c = ''; return { a: num(p.a), blank: !String(p.a || '').trim(), t: String(p.t || '').trim(), c }; });
  if (P.length < 2) { toast('צריך לפחות שני חלקים'); return null; }
  const blanks = P.filter(p => p.blank);
  if (blanks.length > 1) { toast('השאר ריק את הסכום רק בחלק אחד'); return null; }
  if (blanks.length === 1) blanks[0].a = r2(s.a - sum(P.filter(p => !p.blank).map(p => p.a)));
  if (P.some(p => !(p.a > 0))) { toast('לכל חלק צריך סכום חיובי'); return null; }
  const ps = r2(sum(P.map(p => p.a)));
  if (Math.abs(ps - s.a) > 0.004) { toast('סכום החלקים ' + fmt(ps) + ' ₪ שונה מסכום החוב ' + fmt(s.a) + ' ₪'); return null; }
  for (const p of P) { if (p.t) { const nt = normTime(p.t); if (!nt) { toast('שעה לא תקינה: ' + p.t + '. כתוב למשל 09:30'); return null; } p.t = nt; } }
  if (P.some(p => p.c && p.c !== CHANGE && !isRealColl(p.c))) { toast('שם גובה לא תקין'); return null; }
  const pg = cutGroupFor(A, s.o.pg);
  if (s.kind === 'r') {
    const r = s.o, idx = A.records.indexOf(r);
    const news = P.map((p, i) => {
      const o = Object.assign({}, r, { _k: i === 0 ? r._k : kid(), a: p.a, c: p.c, t: p.t, pg, cnt: i === 0 ? (r.cnt || 1) : 1 });
      if (i > 0) o.note = noteNoGot(r.note);
      if (p.t) o.na = false;
      /* גובה שנבחר לחלק נשאר שלו (גם ב״חלק אוטומטית״). חלק בלי גובה מתחלק עם כולם */
      if (isRealColl(p.c)) o.px = true; else { delete o.px; delete o.xs; }
      delete o.xd; delete o.byPhone; return o; });
    A.records.splice(idx, 1, ...news);
    if (X.pv) X.pv.entries = X.pv.entries.filter(e => !e.sid || String(e.sid).replace('#g', '') !== r._k);
  } else {
    const e0 = s.o, L = A.xman || [], idx = L.indexOf(e0);
    const news = P.map((p, i) => Object.assign({}, e0, { id: i === 0 ? e0.id : uid(), a: p.a, t: p.t, c: p.c, cm: 'm', pg, s: (p.t && normStatus(e0.s) === ST_NA) ? '' : (e0.s || '') }));
    L.splice(idx, 1, ...news); A.xman = L;
    if (X.pv) X.pv.entries = X.pv.entries.filter(x => x !== e0);
  }
  cutRenum(A, pg);
  const noT = P.filter(p => !p.t).length;
  CUT.key = null; CUT.parts = null;
  return 'החוב של ' + (s.n || 'הלקוח') + ' פוצל ל-' + P.length + ' חלקים. כל חלק יגיע לאיסוף היומי כשורה נפרדת' + (noT ? ' · ' + noT + ' בלי שעה נשארים בפיצול עד שתרשום שעה' : '');
}
/* doUncut (app.html 3939-3969): החלקים שעוד בפיצול חוזרים לשורה אחת */
function doUncut(A, X) {
  const CUT = X.cut, s = cutSrc(A, CUT.key); if (!s || !s.o.pg) return null;
  const pg = s.o.pg, inR = s.kind === 'r', L = inR ? A.records : (A.xman || []), g = L.filter(x => x && x.pg === pg);
  CUT.key = null; CUT.parts = null;
  if (g.length < 2) { g.forEach(x => { delete x.pg; delete x.pp; }); return 'אין חלקים נוספים לאחד'; }
  const main = g[0];
  main.a = r2(sum(g.map(x => num(x.a))));
  if (inR) {
    const seen = new Set(), notes = [];
    g.forEach(x => String(x.note || '').split(' · ').forEach(t => { t = t.trim(); const k = normName(t); if (t && !seen.has(k)) { seen.add(k); notes.push(t); } }));
    main.note = notes.join(' · ');
    main.cnt = g.reduce((t, x) => t + (x.cnt || 1), 0);
  }
  if (!normTime(main.t)) { const t = g.find(x => normTime(x.t)); if (t) { main.t = t.t; main.na = false; if (!inR && normStatus(main.s) === ST_NA) main.s = ''; } }
  delete main.pg; delete main.pp;
  const gone = new Set(g.slice(1));
  if (inR) {
    A.records = A.records.filter(x => !gone.has(x));
    const ids = new Set(g.map(x => x._k));
    if (X.pv) X.pv.entries = X.pv.entries.filter(e => !(e.sid && ids.has(String(e.sid).replace('#g', ''))));
  } else {
    A.xman = (A.xman || []).filter(x => !gone.has(x));
    if (X.pv) X.pv.entries = X.pv.entries.filter(x => !gone.has(x));
  }
  const cs = Array.from(new Set(g.map(x => cleanColl(x.c)).filter(isRealColl)));
  return 'אוחדו ' + g.length + ' חלקים לשורה אחת של ' + fmt(main.a) + ' ₪' + (cs.length > 1 ? ' · הגובה: ' + (cleanColl(main.c) || 'ללא גובה') + ' (אפשר לשנות)' : '');
}

// ---------- פיצול סכום של שורה בין גובים: ✎ (app.html 3768-3826) ----------
function spxHTML(A, X, id) {
  const r = A.records.find(x => x._k === id); if (!r) return '';
  const SPX = X.spx;
  if (!SPX.draft || SPX.draft.id !== id) SPX.draft = { id, got: '', gotc: '', parts: [{ c: String(r.c || '').trim(), a: '', t: r.na ? '' : normTime(r.t) }] };
  const d = SPX.draft;
  const fl = (label, f, val, cls) => '<label class="f">' + label + '<input class="in' + (cls || '') + '" data-xf="' + f + '" data-fk="xf|' + f + '" value="' + esc(val) + '" autocomplete="off"></label>';
  const known = knownCollectors(A.records);
  const gotOpts = '<option value="">לא צוין</option>' + known.map(c => '<option value="' + esc(c) + '"' + (d.gotc === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  const parts = d.parts.map((p, i) => '<div class="prow"><select class="in" data-xs="pc" data-pi="' + i + '" aria-label="גובה לחלק ' + (i + 1) + '">' + collOptions(p.c, A.records) + '</select>' +
    '<input class="in num" data-xs="pa" data-pi="' + i + '" inputmode="decimal" placeholder="הסכום (ריק = כל היתרה)" value="' + esc(p.a) + '" aria-label="סכום לחלק ' + (i + 1) + '">' +
    '<input class="in num pt" data-xs="pt" data-pi="' + i + '" inputmode="numeric" placeholder="שעה" value="' + esc(p.t || '') + '" aria-label="שעה לחלק ' + (i + 1) + '">' +
    (d.parts.length > 1 ? '<button class="x" type="button" data-xpdel="' + i + '" aria-label="הסר חלק">×</button>' : '') +
    '<input class="in" style="flex:1 1 100%" data-xs="pn" data-pi="' + i + '" placeholder="או כתוב שם גובה (השם שנכתב קובע)" value="' + esc(p.tn || '') + '" autocomplete="off" aria-label="שם גובה לחלק ' + (i + 1) + '"></div>').join('');
  return '<div class="spx" data-spx="' + esc(id) + '">' +
    '<div class="grid">' + fl('שם', 'n', r.n) + fl('הערה', 'note', r.note || '') + fl('טלפון', 'ph', r.ph || '', ' num') + fl('סכום', 'a', r.a || '', ' num') + '</div>' +
    '<div class="row sp"><label class="chip-ck"><input type="checkbox" data-xf="side"' + (r.side ? ' checked' : '') + '> לא נגבה היום</label>' +
    '<span class="row"><button class="btn danger sm" type="button" data-xdel="1">מחק שורה</button><button class="btn plain sm" type="button" data-xclose="1">סגור</button></span></div>' +
    '<div class="spx-h">פיצול הסכום בין גובים</div>' +
    '<div class="grid"><label class="f">כבר נאסף (₪)<input class="in num" data-xs="got" inputmode="decimal" value="' + esc(d.got) + '" placeholder="0" autocomplete="off"></label>' +
    '<label class="f">נאסף על ידי<select class="in" data-xs="gotc">' + gotOpts + '</select><input class="in" data-xs="gn" placeholder="או כתוב שם גובה (השם שנכתב קובע)" value="' + esc(d.gn || '') + '" autocomplete="off" style="margin-top:4px" aria-label="שם גובה שאסף"></label></div>' +
    '<label class="chip-ck"><input type="checkbox" data-xs="ng"' + (d.ng ? ' checked' : '') + '> עדיין לא נאסף בפועל, רשום את הסכום כ״לא נאסף״</label>' +
    '<div class="small muted">היתרה לאיסוף, אפשר לחלק אותה לכמה חלקים, עם גובה ושעה לכל חלק. כל חלק מגיע לאיסוף היומי כשורה נפרדת:</div>' + parts +
    '<div class="small muted" data-xrem></div>' +
    '<div class="row"><button class="btn ghost sm" type="button" data-xpadd="1">+ חלק נוסף</button><button class="btn" type="button" data-xsplit="1">בצע פיצול</button></div></div>';
}
function updateSpxRem(A, X, box) {
  const r = A.records.find(x => x._k === box.dataset.spx), d = X.spx.draft, el = box.querySelector('[data-xrem]');
  if (!el || !r || !d || d.id !== r._k) return;
  const total = num(r.a), got = num(d.got), rem = r2(total - got), assigned = sum(d.parts.map(p => num(p.a)));
  el.textContent = 'סכום השורה ' + fmt(total) + ' ₪' + (got ? ' · נאסף כבר ' + fmt(got) + ' ₪' : '') + ' · נשאר ' + fmt(rem) + ' ₪' + (assigned ? ' · חולק ' + fmt(assigned) + ' ₪ · נותר לחלוקה ' + fmt(r2(rem - assigned)) + ' ₪' : '');
}
/* doSpxSplit (app.html 3802-3826). מחזיר הודעה, או null אם לא בוצע */
function doSpxSplit(A, X) {
  const SPX = X.spx, r = A.records.find(x => x._k === SPX.open), d = SPX.draft; if (!r || !d || d.id !== r._k) return null;
  const total = num(r.a), got = num(d.got), rem = r2(total - got);
  const no = (m) => { toast(m); return null; };
  if (got < 0) return no('הסכום שנאסף לא תקין');
  if (rem <= 0) return no('נאסף כל הסכום. אם אין מה לאסוף, מחק את השורה או סמן ״לא נגבה היום״');
  const parts = d.parts.map(p => ({ c: String(p.c || '').trim(), a: num(p.a), blank: !String(p.a || '').trim(), t: String(p.t == null ? (r.na ? '' : normTime(r.t)) : p.t).trim() }));
  for (const p of parts) { if (p.t) { const nt = normTime(p.t); if (!nt) return no('שעה לא תקינה: ' + p.t + '. כתוב למשל 09:30'); p.t = nt; } }
  const blanks = parts.filter(p => p.blank);
  if (blanks.length > 1) return no('השאר ריק את הסכום רק בחלק אחד');
  if (blanks.length === 1) blanks[0].a = r2(rem - sum(parts.filter(p => !p.blank).map(p => p.a)));
  if (parts.some(p => !(p.a > 0))) return no('לכל חלק צריך סכום חיובי');
  const ps = sum(parts.map(p => p.a));
  if (Math.abs(ps - rem) > 0.004) return no('סכום החלקים ' + fmt(ps) + ' ₪ שונה מהיתרה ' + fmt(rem) + ' ₪');
  if (got <= 0 && parts.length === 1 && parts[0].c === String(r.c || '').trim()) return no('אין מה לפצל. כתוב כמה נאסף או הוסף חלק לגובה אחר');
  if (got > 0 && d.ng && !d.gotc) return no('בחר על מי הסכום שעדיין לא נאסף (בשדה ״נאסף על ידי״)');
  const extra = got > 0 ? ((d.ng ? 'לא נאסף עדיין ' : 'נאסף כבר ') + fmt(got) + ' ₪' + (d.gotc ? ' ע״י ' + d.gotc : '')) : '';
  const hadNote = !!String(r.note || '').trim(), note = [String(r.note || '').trim(), extra].filter(Boolean).join(' · ');
  const pg = parts.length > 1 ? cutGroupFor(A, r.pg) : (r.pg || '');
  const news = parts.map((p, i) => {
    const o = Object.assign({}, r, { _k: i === 0 ? r._k : kid(), a: p.a, c: p.c === CHANGE ? CHANGE : p.c, t: p.t, note: i === 0 ? note : noteNoGot(note), px: true, done: (extra && !hadNote) ? true : r.done });
    if (p.t) o.na = false; if (pg) o.pg = pg; delete o.xd; return o; });
  const idx = A.records.indexOf(r); A.records.splice(idx, 1, ...news);
  if (pg) cutRenum(A, pg);
  if (X.pv) X.pv.entries = X.pv.entries.filter(e => !e.sid || String(e.sid).replace('#g', '') !== r._k);
  SPX.open = null; SPX.draft = null;
  return news.length > 1 ? ('השורה פוצלה ל-' + news.length + ' חלקים') : ('נרשם: נשאר ' + fmt(rem) + ' ₪');
}

// ---------- פאנל במסך הפיצול ----------
const PH = new Map();
function panelHolder(ctx) {
  let H = PH.get(ctx.a.id);
  if (!H) { H = holder(ctx.a); PH.set(ctx.a.id, H); }
  if (H.a !== ctx.a && !H.pend && (ctx.a._version || 0) >= (H.a._version || 0)) H.a = ctx.a;
  H.onReload = () => { ctx.a = H.a; ctx.reload(); };
  // ״שמור שינויים״: שומר מיד את מה שממתין לשמירה האוטומטית (או מה שנכשל), בלי לצייר מחדש — נשארים באותו מקום
  SaveCtl.register('split-panel', { isDirty: () => !!(H.pend || H.failed), save: async () => { const ok = await H.save('שמירה ידנית'); if (ok) ctx.a = H.a; return ok; } });
  return H;
}
async function commit(ctx, H, label, msg) {
  const f = focusKey(); const ok = await H.save(label);
  if (ok) { ctx.a = H.a; rememberCollectors(H.a.records); }
  await ctx.reload(); refocus(f); if (ok && msg) toast(msg);
  return ok;
}
function xferStatus(A) {
  const rows = xferRows(A), nd = (A.records || []).filter(r => r && r.xd).length + (A.xstash || []).length + (A.xmstash || []).length;
  return { rows, nd, text: (rows.length ? (rows.length + ' שורות עם שעה · סה״כ ' + fmt(sum(rows.map(r => num(r.a)))) + ' ₪') : (nd ? 'אין שורות חדשות להעברה' : 'אין עדיין שורות עם שעה')) + (nd ? ' · הועברו כבר ' + nd : '') };
}
function warnText(A) {
  const recs = A.records || [], c = calcSplit(recs.map(compactRec).filter(r => r.n || r.a)), parts = [];
  const noC = recs.filter(r => !String(r.c || '').trim() && !r.side).length; if (noC) parts.push(noC + ' שורות בלי גובה (באדום בטבלה, בלוק נפרד ברשימות)');
  const ch = recs.filter(r => r.c === CHANGE && !r.side).length; if (ch) parts.push(ch + ' שורות מסומנות ״לשנות״ (בלוק נפרד, לא נכלל בסה״כ)');
  if (c.dups.length) parts.push('שמות שמפוצלים בין כמה גובים (נשארו כפי שנכתבו): ' + c.dups.map(d => d.n + ' (' + d.cs.join(', ') + ')').join(' · '));
  const bp = recs.filter(r => r.byPhone).length; if (bp) parts.push(bp + ' שורות אוחדו לפי אותו טלפון (בצהוב בטבלה)');
  return parts;
}
/* רשימות לפי גובה עם שעה, ״לא ענו״, בחירת גובה ו-✎ (renderSpOut, app.html 4027-4053) */
function listsHTML(ctx, A, X) {
  const vis = ctx.visible; const filtered = !!(ctx.filter || ctx.coll);
  const withK = (A.records || []).map(r => Object.assign(compactRec(r), { _k: r._k })).filter(r => r.n || r.a);
  if (!withK.length) return '<div class="empty"><b>אין שורות</b></div>';
  const c = calcSplit(withK), phones = A.phones || [], known = knownCollectors(A.records);
  const show = r => !filtered || !vis || vis.has(r._k);
  const tmIn = r => '<input class="in num tm" data-spt="' + esc(r._k) + '" data-fk="t|' + esc(r._k) + '" inputmode="numeric" placeholder="' + (r.na ? ST_NA : 'שעה') + '" value="' + esc(r.na ? '' : (normTime(r.t) || '')) + '" aria-label="שעת איסוף של ' + esc(r.n) + '">' +
    '<button type="button" class="stb na" data-spna="' + esc(r._k) + '" aria-pressed="' + (r.na ? 'true' : 'false') + '" title="לא ענו: יעבור לבלוק נפרד בראש האיסוף היומי" aria-label="לא ענו – ' + esc(r.n) + '">' + ST_NA + '</button>';
  const mvSel = r => '<select class="mv in" data-mv="' + esc(r._k) + '" title="בחר איזה גובה אוסף" aria-label="גובה שאוסף את הכסף של ' + esc(r.n) + '">' + collOptions(r.c, A.records) + '</select>';
  const penBtn = r => '<button class="x" type="button" data-spx-open="' + esc(r._k) + '" title="עריכה ופיצול סכום" aria-label="עריכה ופיצול סכום של ' + esc(r.n) + '">✎</button>';
  const hardB = r => '<button type="button" class="stb" data-hard="' + esc(r._k) + '" aria-pressed="' + (r.h === 'קשה' ? 'true' : 'false') + '" title="סימון קשה / לא קשה (לחיצה מחליפה)">' + (r.h === 'קשה' ? 'קשה' : r.h === 'לא קשה' ? 'לא קשה' : 'קשה?') + '</button>';
  let h = '';
  c.blocks.forEach(b => {
    const wp = phones.indexOf(b.c) >= 0;
    const rowsAll = b.sections.flatMap(x => x.rows); if (filtered && !rowsAll.some(show)) return;
    const allSel = b.c === NOC_SP ? '<select class="mv all in" data-mvall="1" aria-label="שייך את כל השורות בלי גובה"><option value="">שייך הכל ל…</option>' + known.map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('') + '</select>' : '';
    h += '<div class="ph"><span>' + esc(blockTitle(b)) + ' · ' + b.count + (b.special ? ' <span class="pill">לא כלול בסה״כ</span>' : '') + '</span>' + allSel + '</div>';
    for (const x of b.sections) {
      if (x.t) h += '<div class="grp-h ' + x.cls + '">' + esc(x.t) + '</div>';
      h += x.rows.map((r, i) => show(r) ? '<div class="pl">' + tmIn(r) + '<span class="pl-t">' + (i + 1) + '. ' + lineParts(r, wp) + '</span>' + hardB(r) + mvSel(r) + penBtn(r) + '</div>' + (X.spx.open === r._k ? spxHTML(A, X, r._k) : '') : '').join('');
      if (b.sections.length > 1) h += '<div class="sub">סה״כ ' + esc(x.t) + ': ' + money(x.total) + '</div>';
    }
    h += '<div class="sub">סה״כ ' + esc(blockTitle(b)) + ': ' + money(b.total) + '</div>';
  });
  const sides = c.sides.filter(show);
  if (sides.length) {
    h += '<div class="ph"><span>לא נגבים היום · ' + c.sides.length + ' <span class="pill">לא כלול בסכומי הגובים</span></span></div>' +
      sides.map((r, i) => '<div class="pl"><span class="pl-t">' + (i + 1) + '. ' + esc(r.n) + ' – ' + money(num(r.a)) + (r.note ? ' – ' + esc(r.note) : '') + '</span>' + mvSel(r) + penBtn(r) + '</div>' + (X.spx.open === r._k ? spxHTML(A, X, r._k) : '')).join('') + '<div class="sub">סה״כ ' + money(c.sideTotal) + '</div>';
  }
  return h;
}
/* טבלת עריכת שורות (renderSpRows, app.html 4006-4021) */
function rowsHTML(ctx, A) {
  const vis = ctx.visible, filtered = !!(ctx.filter || ctx.coll);
  const list = (A.records || []).filter(r => !filtered || !vis || vis.has(r._k)).slice()
    .sort((x, y) => String(x.c || '').localeCompare(String(y.c || ''), 'he') || cmpRec(x, y));
  const fk = (r, f) => ' data-fk="rw|' + esc(r._k) + '|' + f + '"';
  return '<div class="tbl-wrap"><table class="ed"><thead><tr><th></th><th>שם</th><th>הערה</th><th>טלפון</th><th>סכום</th><th>גובה</th><th>קשה</th><th>לא נגבה היום</th><th>הערה טופלה</th><th>שעה</th></tr></thead><tbody>' +
    list.map(r => '<tr data-id="' + esc(r._k) + '" class="' + (r.byPhone ? 'unc ' : '') + (String(r.c || '').trim() ? '' : 'miss') + '">' +
      '<td style="white-space:nowrap"><button class="x" type="button" data-flip="' + esc(r._k) + '" title="החלף בין שם משפחה להערה" aria-label="החלף בין שם משפחה להערה">⇄</button><button class="x" type="button" data-del="' + esc(r._k) + '" aria-label="הסר שורה">×</button></td>' +
      '<td><input class="in" data-f="n"' + fk(r, 'n') + ' autocomplete="off" value="' + esc(r.n) + '" aria-label="שם"' + (r.cnt > 1 ? ' title="אוחדו ' + r.cnt + ' שורות"' : '') + '></td>' +
      '<td><input class="in" data-f="note"' + fk(r, 'note') + ' value="' + esc(r.note) + '" aria-label="הערה"></td>' +
      '<td><input class="in num" data-f="ph"' + fk(r, 'ph') + ' value="' + esc(r.ph) + '" aria-label="טלפון"></td>' +
      '<td><input class="in num" data-f="a"' + fk(r, 'a') + ' inputmode="decimal" value="' + esc(r.a || '') + '" aria-label="סכום"></td>' +
      '<td><input class="in" data-f="c"' + fk(r, 'c') + ' list="spt-colls" value="' + esc(r.c) + '" aria-label="גובה"></td>' +
      '<td><select class="in" data-f="h" aria-label="קשה"><option value="">—</option><option value="קשה"' + (r.h === 'קשה' ? ' selected' : '') + '>קשה</option><option value="לא קשה"' + (r.h === 'לא קשה' ? ' selected' : '') + '>לא קשה</option></select></td>' +
      '<td style="text-align:center"><input type="checkbox" data-f="side"' + (r.side ? ' checked' : '') + ' aria-label="לא נגבה היום"></td>' +
      '<td style="text-align:center"><input type="checkbox" data-f="done"' + (r.done ? ' checked' : '') + ' aria-label="הערה טופלה"></td>' +
      '<td><input class="in num" data-f="t"' + fk(r, 't') + ' inputmode="numeric" placeholder="09:30" value="' + esc(r.t || '') + '" aria-label="שעה" style="min-width:70px;width:80px"></td></tr>').join('') +
    '</tbody></table></div>';
}
function panelRender(ctx) {
  if (!App.can.finance) return '';
  style(); loadColl().then(() => { if (!CO.rendered) { CO.rendered = true; ctx.reload(); } });
  const H = panelHolder(ctx), A = H.a, X = stOf(A.id);
  const xs = xferStatus(A), warn = warnText(A), cs = spCollectors(A.records).filter(c => c !== CHANGE);
  const filtered = !!(ctx.filter || ctx.coll);
  const canMerge = filtered && (() => { const m = new Map(); (A.records || []).filter(r => ctx.visible && ctx.visible.has(r._k)).forEach(r => { const nm = normName(r.n); if (!nm || isSagi(r.n) || r.pg) return; const k = nm + '|' + (r.side ? 1 : 0); m.set(k, (m.get(k) || 0) + 1); }); return Array.from(m.values()).some(c => c > 1); })();
  return `<div class="spt no-print" id="spt-panel">
  <datalist id="spt-colls">${knownCollectors(A.records).concat([CHANGE]).map(c => '<option value="' + esc(c) + '"></option>').join('')}</datalist>
  ${warn.length ? `<div class="note warn">${warn.map(esc).join('<br>')}</div>` : ''}
  <div class="card"><div class="row sp"><h2>העברה לאיסוף יומי</h2><a class="btn" href="#/xfer/${esc(A.id)}" id="spt-go">מסך העברה וחלוקה</a></div>
    <p class="small muted" style="margin:4px 0">רשום שעה ליד הלווים שצריך לאסוף מהם היום (בשדה ״שעה״ ברשימה למטה), או ״לא ענו״. במסך ההעברה מסמנים את הגובים, מחלקים אוטומטית, ומעבירים לרשימת האיסוף של היום. מי שבלי שעה נשאר בפיצול.</p>
    <div class="small" id="spt-xn">${esc(xs.text)}</div>
    ${xs.nd ? '<div class="row" style="margin-top:6px"><button class="btn plain sm" id="spt-reset">אפס העברה (החזר את מה שהועבר)</button></div>' : ''}</div>
  <div class="card"><h2>שעות, גובים ופיצול סכום</h2>${filtered ? '<div class="note info">מוצגות השורות שתואמות לסינון.</div>' : ''}${canMerge ? '<button class="btn ghost sm" id="spt-smerge">אחד חובות של הלווים שמוצגים לשורה אחת</button>' : ''}<div id="spt-lists">${listsHTML(ctx, A, X)}</div></div>
  <details class="card" id="spt-rows"${X.rowsOpen ? ' open' : ''}><summary><b>עריכת שורות (${(A.records || []).length})</b></summary>
    <p class="small muted">הערות שרשמת אצל לקוח נשארות בשורה נפרדת ולא מתאחדות. הכפתור ⇄ מחליף בין שם משפחה להערה. ״לא נגבה היום״ מעביר את השורה לרשימה צדדית. ״הערה טופלה״ — ההערה לא תועבר לחשבון הבא.</p>
    <div class="row"><button class="btn ghost sm" id="spt-merge">אחד כפולים</button><button class="btn ghost sm" id="spt-mergedebts" title="אותו לווה בכמה שורות הופך לשורה אחת עם סכום מצטבר, וההערות של כל החובות נשמרות">אחד חובות של אותו לווה</button></div>
    ${X.rowsOpen ? rowsHTML(ctx, A) : ''}
    <div class="row" style="margin-top:8px"><button class="btn ghost sm" id="spt-add">+ שורה</button><button class="btn ghost sm" id="spt-carry">העבר הערות פתוחות מהחשבון הקודם</button></div></details>
  ${cs.length ? `<div class="card"><h2>טלפון ברשימה של</h2><div class="row" id="spt-phones">${cs.map(c => '<label class="chip-ck"><input type="checkbox" data-ph="' + esc(c) + '"' + ((A.phones || []).indexOf(c) >= 0 ? ' checked' : '') + '>' + esc(c) + '</label>').join('')}</div></div>` : ''}
  </div>`;
}
function panelBind(ctx) {
  const root = $('#spt-panel', ctx.view); if (!root) return;
  const H = panelHolder(ctx), X = stOf(H.a.id);
  const A = () => H.a;
  const rec = id => (A().records || []).find(x => x._k === id);
  // פאנל ההעברה
  const rs = $('#spt-reset', root);
  if (rs) rs.onclick = () => { const a = A(); let n = 0; (a.records || []).forEach(r => { if (r && r.xd) { delete r.xd; n++; } }); if (a.xstash && a.xstash.length) { a.xstash.forEach(r => { delete r.xd; }); a.records.push(...a.xstash); n += a.xstash.length; a.xstash = []; } if (a.xmstash && a.xmstash.length) { a.xman = (a.xman || []).concat(a.xmstash); n += a.xmstash.length; a.xmstash = []; } X.pv = null; commit(ctx, H, 'אפס העברה', 'הוחזרו ' + n + ' שורות לרשימת ההעברה'); };
  // טלפון ברשימה של
  const ph = $('#spt-phones', root);
  if (ph) ph.onchange = (e) => { const c = e.target.dataset.ph; if (!c) return; const a = A(); a.phones = a.phones || []; const i = a.phones.indexOf(c); if (e.target.checked && i < 0) a.phones.push(c); if (!e.target.checked && i >= 0) a.phones.splice(i, 1); commit(ctx, H, 'טלפון ברשימה'); };
  // רשימות: שעה, לא ענו, גובה, קשה, ✎
  const L = $('#spt-lists', root);
  L.addEventListener('click', (e) => {
    const nb = e.target.closest('[data-spna]');
    if (nb) { const r = rec(nb.dataset.spna); if (!r) return; r.na = !r.na; if (r.na) r.t = ''; commit(ctx, H, 'לא ענו'); return; }
    const hb = e.target.closest('[data-hard]');
    if (hb) { const r = rec(hb.dataset.hard); if (!r) return; r.h = r.h === 'קשה' ? 'לא קשה' : r.h === 'לא קשה' ? '' : 'קשה'; commit(ctx, H, 'קשה / לא קשה'); return; }
    const op = e.target.closest('[data-spx-open]');
    if (op) { const id = op.dataset.spxOpen; if (X.spx.open === id) { X.spx.open = null; X.spx.draft = null; } else { X.spx.open = id; X.spx.draft = null; } ctx.reload().then(() => { const b = $('#spt-lists [data-spx]', ctx.view); if (b) { updateSpxRem(H.a, X, b); try { b.scrollIntoView({ block: 'nearest' }); } catch { /* */ } } }); return; }
    if (e.target.closest('[data-xclose]')) { X.spx.open = null; X.spx.draft = null; ctx.reload(); return; }
    const box = e.target.closest('[data-spx]'); if (!box) return;
    const redrawBox = () => { ctx.reload().then(() => { const b = $('#spt-lists [data-spx]', ctx.view); if (b) updateSpxRem(H.a, X, b); }); };
    if (e.target.closest('[data-xpadd]')) { const r = rec(box.dataset.spx), d = X.spx.draft; if (r && d) { d.parts.push({ c: '', a: '', t: r.na ? '' : normTime(r.t) }); redrawBox(); } return; }
    const pd = e.target.closest('[data-xpdel]'); if (pd) { const d = X.spx.draft; if (d && d.parts.length > 1) { d.parts.splice(+pd.dataset.xpdel, 1); redrawBox(); } return; }
    if (e.target.closest('[data-xsplit]')) { const msg = doSpxSplit(A(), X); if (msg) commit(ctx, H, 'פיצול סכום בין גובים', msg); return; }
    const dl = e.target.closest('[data-xdel]');
    if (dl) { if (!armed(dl, 'לחץ שוב למחיקה', 'מחק שורה')) return; const a = A(); const i = a.records.findIndex(x => x._k === box.dataset.spx); if (i >= 0) a.records.splice(i, 1); X.spx.open = null; X.spx.draft = null; commit(ctx, H, 'מחיקת שורה', 'השורה נמחקה'); }
  });
  L.addEventListener('change', (e) => {
    const ti = e.target.closest('[data-spt]');
    if (ti) {
      const r = rec(ti.dataset.spt); if (!r) return;
      const v = ti.value.trim(), nt = v ? normTime(v) : '';
      if (v && !nt) { ti.value = normTime(r.t) || ''; return toast('שעה לא תקינה. כתוב למשל 09:30'); }
      r.t = nt; ti.value = nt; if (nt && r.na) r.na = false; commit(ctx, H, 'שעת איסוף'); return;
    }
    const one = e.target.closest('[data-mv]'), all = e.target.closest('[data-mvall]');
    if (one) { const r = rec(one.dataset.mv); if (!r) return; r.c = one.value === '__none' ? '' : one.value; commit(ctx, H, 'שינוי גובה'); return; }
    if (all && all.value) { const v = all.value; let n = 0; (A().records || []).forEach(r => { if (!r.side && !String(r.c || '').trim()) { r.c = v; n++; } }); commit(ctx, H, 'שיוך לגובה', 'שויכו ' + n + ' שורות ל' + v); return; }
    const box = e.target.closest('[data-spx]'); if (!box) return;
    const xf = e.target.dataset.xf;
    if (xf === 'side') { const r = rec(box.dataset.spx); if (r) { r.side = e.target.checked; commit(ctx, H, 'לא נגבה היום'); } return; }
    if (xf) { commit(ctx, H, 'עריכת שורה'); return; }
  });
  L.addEventListener('input', (e) => {
    const box = e.target.closest('[data-spx]'); if (!box) return;
    const r = rec(box.dataset.spx); if (!r) return;
    const xf = e.target.dataset.xf, xs = e.target.dataset.xs;
    if (xf && xf !== 'side') { if (xf === 'a') r.a = num(e.target.value); else if (xf === 'ph') r.ph = cleanPh(e.target.value); else r[xf] = e.target.value; H.later('עריכת שורה'); updateSpxRem(A(), X, box); return; }
    if (xs) {
      const d = X.spx.draft; if (!d || d.id !== r._k) return; const i = +e.target.dataset.pi;
      if (xs === 'got') d.got = e.target.value;
      else if (xs === 'gotc') { d.gotc = e.target.value; d.gn = ''; const t = box.querySelector('[data-xs="gn"]'); if (t) t.value = ''; }
      else if (xs === 'gn') { d.gn = e.target.value; const v = e.target.value.trim(); if (v) d.gotc = v; }
      else if (xs === 'ng') d.ng = e.target.checked;
      else if (xs === 'pn' && d.parts[i]) { d.parts[i].tn = e.target.value; const v = e.target.value.trim(); if (v) d.parts[i].c = v; }
      else if (xs === 'pc' && d.parts[i]) { d.parts[i].c = e.target.value === '__none' ? '' : e.target.value; d.parts[i].tn = ''; const t = box.querySelector('[data-xs="pn"][data-pi="' + i + '"]'); if (t) t.value = ''; }
      else if (xs === 'pa' && d.parts[i]) d.parts[i].a = e.target.value;
      else if (xs === 'pt' && d.parts[i]) d.parts[i].t = e.target.value;
      updateSpxRem(A(), X, box);
    }
  });
  const sb = $('#spt-lists [data-spx]', root); if (sb) updateSpxRem(A(), X, sb);
  const sm = $('#spt-smerge', root);
  if (sm) sm.onclick = () => doMergeDebts([...(ctx.visible || [])]);
  // טבלת עריכת שורות
  const det = $('#spt-rows', root);
  det.addEventListener('toggle', () => { if (X.rowsOpen !== det.open) { X.rowsOpen = det.open; ctx.reload(); } });
  const doMergeDebts = (ids) => { const m = mergeDebts(A(), ids); if (!m.removed) return toast('אין חובות כפולים לאיחוד'); commit(ctx, H, 'איחוד חובות', 'אוחדו ' + m.removed + ' שורות ל' + (m.people > 1 ? m.people + ' לווים' : 'שורה אחת') + ', ההערות נשמרו' + (m.split.length ? ' · ' + m.split.join(' · ') + ' (אפשר לשנות בשדה גובה)' : '')); };
  $('#spt-mergedebts', root).onclick = () => doMergeDebts(null);
  $('#spt-merge', root).onclick = () => { const a = A(); const before = a.records.length, m = mergeRecords(a.records); a.records = m.recs; if (before === m.recs.length) return toast('אין שורות לאיחוד'); commit(ctx, H, 'איחוד כפולים', 'אוחדו ' + (before - m.recs.length) + ' שורות'); };
  $('#spt-add', root).onclick = () => { const a = A(); const k = kid(); a.records.push({ _k: k, fn: '', ln: '', n: '', note: '', ph: '', a: 0, c: ctx.coll || '', side: false, h: '', cnt: 1 }); X.rowsOpen = true; commit(ctx, H, 'שורה חדשה').then(() => { const el = $('[data-fk="rw|' + k + '|n"]'); if (el) el.focus(); }); };
  $('#spt-carry', root).onclick = async () => { try { const cy = await carrySpNotes(A()); if (!cy.n) return toast('אין הערות פתוחות להעברה'); commit(ctx, H, 'העברת הערות פתוחות', 'הועברו ' + cy.n + ' הערות מהחשבון של ' + dmy(cy.from)); } catch (e) { toast(e.message); } };
  const tb = $('table.ed', det);
  if (tb) {
    tb.addEventListener('input', (e) => {
      const tr = e.target.closest('tr'); if (!tr) return; const r = rec(tr.dataset.id); if (!r) return;
      const f = e.target.dataset.f; if (!f) return;
      if (f === 'side' || f === 'done') return; if (f === 'a') r.a = num(e.target.value); else if (f === 'ph') { const cv = cleanPh(e.target.value); if (cv !== e.target.value.trim()) e.target.value = cv; r.ph = cv; } else if (f === 'h') return; else r[f] = e.target.value;
      tr.classList.toggle('miss', !String(r.c || '').trim());
      H.later('עריכת שורות');
    });
    tb.addEventListener('change', async (e) => {
      const tr = e.target.closest('tr'); if (!tr) return; const r = rec(tr.dataset.id); if (!r) return;
      const f = e.target.dataset.f; if (!f) return;
      if (f === 'side' || f === 'done') r[f] = e.target.checked;
      else if (f === 'h') r.h = e.target.value;
      else if (f === 't') { const v = e.target.value.trim(), nt = v ? normTime(v) : ''; if (v && !nt) { toast('שעה לא תקינה. כתוב למשל 09:30'); e.target.value = normTime(r.t) || ''; return; } r.t = nt; if (nt) r.na = false; }
      /* כשכותבים שם בשורה ואין טלפון: מילוי אוטומטי מהטלפונים של לקוחות מהפיצולים השמורים */
      if (f === 'n' && !String(r.ph || '').trim()) {
        const lk = await phLookup(r.n, A());
        if (lk.p) { r.ph = lk.p; toast(lk.pm === 'a' ? 'הטלפון נמצא בהתאמה חלקית של השם. בדוק אותו' : 'הטלפון מולא אוטומטית'); }
        else if (lk.pm === 'amb') toast('יש כמה מספרים שונים לשם הזה. כתוב ידנית');
      }
      commit(ctx, H, 'עריכת שורות');
    });
    tb.addEventListener('click', (e) => {
      const fl = e.target.closest('[data-flip]');
      if (fl) {
        const r = rec(fl.dataset.flip); if (!r || !r.ln || !r.fn || (r.cnt || 1) > 1) return toast('אי אפשר להחליף בשורה הזו');
        if (r.note) { r.n = (r.fn + ' ' + r.ln).trim(); r.note = ''; learnNote(r.ln, false); } else { r.n = r.fn; r.note = r.ln; learnNote(r.ln, true); }
        commit(ctx, H, 'החלפת שם משפחה / הערה'); return;
      }
      const d = e.target.closest('[data-del]'); if (!d) return;
      if (!armed(d, 'מחק?', '×')) return;
      const a = A(); const i = a.records.findIndex(x => x._k === d.dataset.del); if (i >= 0) a.records.splice(i, 1);
      commit(ctx, H, 'מחיקת שורה');
    });
  }
}

// ---------- מסך ״העברה לאיסוף יומי״ #/xfer/<splitId> ----------
async function xferView(view, args) {
  if (!App.can.finance) { view.innerHTML = '<div class="note err">אין הרשאה</div>'; return; }
  style();
  const id = args[0]; if (!id) { location.hash = '#/accounts'; return; }
  view.innerHTML = '<div class="empty">טוען…</div>';
  const [a] = await Promise.all([get('/api/accounts/' + id), loadColl(true)]);
  if (a.kind !== 'split') { view.innerHTML = '<div class="note err">זה לא פיצול</div>'; return; }
  let hist = {}; try { hist = (await get('/api/docs/settings/ar_hist')).h || {}; } catch { /* אין עדיין */ }
  let works = []; try { works = await get('/api/accounts?kind=work'); } catch { /* */ }
  const X = stOf(id);
  const today = todayISO();
  if (!X.date) X.date = a.date > today ? a.date : today;
  const H = holder(a, () => { xfBuild(H.a, X); draw(); });
  xfBuild(H.a, X);

  const target = () => { const l = works.filter(w => w.date === X.date); return l.sort((x, y) => (y.rows - x.rows) || ((y.updatedAt || 0) - (x.updatedAt || 0)))[0] || null; };
  const statusText = () => { const st = xferStatus(H.a), T = target(); return st.text + (T ? ' · ייכנס לאיסוף היומי של ' + dmy(T.date) + ' (' + T.rows + ' שורות)' : ' · ייפתח איסוף יום חדש ל-' + dmy(X.date)); };

  function draw() {
    const A = H.a, sel = xfSel(), list = knownCollectors(A.records).filter(isRealColl);
    view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">${esc(A.title || 'פיצול')}</div><h1>העברה לאיסוף יומי</h1></div><a class="btn sm" href="#/acc/${esc(A.id)}">חזרה לפיצול</a></div>
    <div class="spt" id="xf-root">
    <div class="card"><p class="small muted" style="margin:0">רשום שעה ליד הלווים שצריך לאסוף מהם היום (בשדה ״שעה״ ליד כל שורה ברשימות הפיצול). סמן את הגובים שביניהם מחלקים ולחץ ״העברה לאיסוף יומי״. השורות נכנסות לרשימת האיסוף השמורה של היום ומעדכנות אותה, בלי לפתוח רשימה חדשה, ומי שעדיין בלי שעה נשאר בפיצול עד שתרשום לו שעה. ליד מי שלא ענה לחץ ״לא ענו״: הוא עובר בלי שעה, ובאיסוף היומי נכנס לבלוק נפרד בראש הרשימה. עוברות רק שורות עם שעה או סימון ״לא ענו״. ״חלק אוטומטית״ מחלק בין הגובים שסימנת: מספר החייבים שווה (הפרש של לכל היותר אחד) והסכומים קרובים ככל האפשר. כל מה שאתה מוסיף כאן (גובים, שורות, שעות ושיוכים) נשמר בשרת.</p>
      <div class="row" id="xf-c" style="margin-top:8px">${list.map(c => '<span class="row" style="gap:2px;flex-wrap:nowrap"><label class="chip-ck"><input type="checkbox" data-xc="' + esc(c) + '"' + (sel.has(c) ? ' checked' : '') + '>' + esc(c) + '</label><button class="x" type="button" data-xdelc="' + esc(c) + '" title="מחק את הגובה ' + esc(c) + ' מהרשימה" aria-label="מחק את הגובה ' + esc(c) + '">×</button></span>').join('')}</div>
      <div class="row"><input class="in" id="xf-new" placeholder="שם גובה חדש" autocomplete="off" aria-label="שם גובה חדש" style="max-width:220px"><button class="btn ghost" id="xf-add" type="button">הוסף גובה</button></div>
      <div class="row"><label class="f">תאריך האיסוף היומי<input class="in" type="date" id="xf-date" value="${esc(X.date)}"></label></div>
      <div class="row"><button class="btn" id="xf-go" type="button">העברה לאיסוף יומי</button><button class="btn plain sm" id="xf-dd" type="button">הסר מהפיצול מי שכבר באיסוף היומי</button>${xferStatus(A).nd ? '<button class="btn plain sm" id="xf-reset" type="button">אפס העברה (החזר את מה שהועבר)</button>' : ''}</div>
      <div class="small muted" id="xf-n">${esc(statusText())}</div>
      <div class="row"><input class="in" id="xf-q" type="search" placeholder="חפש לקוח לפי שם או טלפון" autocomplete="off" aria-label="חיפוש לקוח ברשימה שעוברת" style="max-width:300px" value="${esc(X.q || '')}"><span class="small muted" id="xf-qn"></span></div>
    </div>
    <datalist id="spt-colls">${knownCollectors(A.records).concat([CHANGE]).map(c => '<option value="' + esc(c) + '"></option>').join('')}</datalist>
    <div class="card"><div id="xf-l"></div></div></div>`;
    renderPv(); bindTop();
  }
  /* תצוגה חיה של הרשימה המחולקת (renderXfPv, app.html 3619-3651) */
  function renderPv() {
    const L = $('#xf-l', view); if (!L) return; const pv = X.pv, A = H.a, CUT = X.cut; if (!pv) { L.innerHTML = ''; return; }
    const skip = (A.records || []).filter(r => r && !r.side && r.c !== CHANGE && String(r.n || '').trim() && !normTime(r.t) && !r.na);
    const groups = xfGroups(pv), gl = groups.filter(Boolean);
    const opts = cur => gl.map(n => '<option value="' + esc(n) + '"' + (cleanColl(cur) === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '<option value=""' + (!cleanColl(cur) ? ' selected' : '') + '>ללא גובה</option>';
    const row = (e, i, no) => '<div class="xfe" data-pi="' + i + '" data-sid="' + esc(e.sid || '') + '" data-st="' + esc(e.s || '') + '">' +
      '<span class="xno" aria-label="מספר ' + no + ' ברשימה של הגובה">' + no + '.</span>' +
      '<input class="in num tm" data-pf="t" data-fk="pv|' + esc(e.id) + '|t" inputmode="numeric" placeholder="' + (e.s === ST_NA ? ST_NA : 'שעה') + '" value="' + esc(e.t || '') + '" aria-label="שעה">' +
      '<input class="in nm" data-pf="n" data-fk="pv|' + esc(e.id) + '|n" value="' + esc(e.n) + '" aria-label="שם">' +
      '<input class="in num am" data-pf="a" data-fk="pv|' + esc(e.id) + '|a" inputmode="decimal" value="' + esc(e.a === 0 ? '' : e.a) + '" aria-label="סכום">' +
      '<input class="in num ph2" data-pf="p" data-fk="pv|' + esc(e.id) + '|p" inputmode="tel" placeholder="טלפון" value="' + esc(e.p || '') + '" aria-label="טלפון">' +
      '<select class="in hd" data-pf="h" aria-label="קשה או לא קשה"><option value="">קשה / לא קשה</option><option value="קשה"' + (e.h === 'קשה' ? ' selected' : '') + '>קשה</option><option value="לא קשה"' + (e.h === 'לא קשה' ? ' selected' : '') + '>לא קשה</option></select>' +
      '<select class="in cs" data-pf="c" aria-label="גובה">' + opts(e.c) + '</select>' +
      partChip(e.pp) + (e.s && e.s !== ST_NA ? ' <span class="pill">' + esc(e.s) + '</span>' : '') +
      (/#g$/.test(String(e.sid || '')) ? '' : '<button class="cutb" type="button" data-cut-open="' + esc(e.sid || e.id) + '" aria-expanded="' + (CUT.key === (e.sid || e.id) ? 'true' : 'false') + '" title="פיצול החוב לכמה חלקים: סכום, שעה וגובה לכל חלק" aria-label="פיצול החוב של ' + esc(e.n || '') + ' לחלקים">פצל</button>') +
      '<button class="x" type="button" data-pdel="' + i + '" title="מחק את השורה (לחיצה שנייה מאשרת)" aria-label="מחק את השורה של ' + esc(e.n || '') + '">×</button></div>';
    const qv = X.q || '', q = normName(qv), qd = qv.replace(/\D/g, '');
    const hit = (n, p) => !q && !qd ? true : ((q && normName(n).indexOf(q) >= 0) || (qd.length >= 3 && String(p || '').replace(/\D/g, '').indexOf(qd) >= 0));
    let shown = 0, html = '';
    if (pv.entries.length) {
      html += '<div class="small muted">הרשימה שתעבור. השיוך לגובים ידני עד שתלחץ ״חלק אוטומטית״. אפשר לערוך כאן הכל:</div><div class="small" data-xfgap></div>';
      groups.forEach(g => {
        const l = pv.entries.map((e, i) => ({ e, i })).filter(o => (cleanColl(o.e.c) || '') === g && hit(o.e.n, o.e.p)).sort((x, y) => ((y.e.s === ST_NA ? 1 : 0) - (x.e.s === ST_NA ? 1 : 0)) || (timeMin(x.e.t) - timeMin(y.e.t)));
        shown += l.length; if (!l.length && (g === '' || q || qd)) return;
        html += '<div class="xfg"><b>' + (g ? esc(g) : 'ללא גובה') + '</b><span class="small muted" data-xfh="' + esc(g.replace(/"/g, '') || '__none') + '"></span></div>' + l.map((o, k) => row(o.e, o.i, k + 1) + (CUT.key && CUT.key === (o.e.sid || o.e.id) ? cutHTML(A, X) : '')).join('');
      });
      html += '<div class="row" style="margin-top:6px"><button class="btn ghost sm" type="button" data-pvadd="1">+ הוסף שורה</button><button class="btn plain sm" type="button" data-pvre="1">חלק אוטומטית</button></div>';
    } else html += '<div class="empty"><b>אין שורות להעברה</b>רשום שעה או ״לא ענו״ ליד לווים במסך הפיצול, או הוסף שורה ידנית.</div><div class="row"><button class="btn ghost sm" type="button" data-pvadd="1">+ הוסף שורה</button></div>';
    const sk = skip.filter(r => hit(r.n, r.ph));
    if (sk.length) html += '<div class="small muted" style="margin-top:6px">לא יעברו (אין שעה): ' + sk.map(r => esc(r.n)).join(', ') + '</div>';
    if ((q || qd) && !shown && !sk.length) html = '<div class="small muted">לא נמצא לקוח כזה</div>';
    const qn = $('#xf-qn', view); if (qn) qn.textContent = (q || qd) ? (shown + ' תוצאות ברשימה' + (sk.length ? ' · ' + sk.length + ' בלי שעה' : '')) : '';
    L.innerHTML = html; xfTotals();
    const cb = $('[data-cut-box]', L); if (cb) cutRem(A, X, cb);
  }
  function xfTotals() {
    const pv = X.pv; if (!pv) return;
    const groups = xfGroups(pv);
    const tot = groups.map(g => { const l = pv.entries.filter(e => (cleanColl(e.c) || '') === g); return { n: l.length, a: sum(l.map(e => num(e.a))) }; });
    groups.forEach((g, k) => { const el = view.querySelector('[data-xfh="' + CSS.escape(g.replace(/"/g, '') || '__none') + '"]'); if (el) el.textContent = tot[k].n + ' חייבים · ' + fmt(tot[k].a) + ' ₪'; });
    const real = tot.slice(0, pv.names.length).map(t => t.a);
    const g = view.querySelector('[data-xfgap]');
    if (g) g.textContent = real.length > 1 ? ('הפרש בסכום בין הגובים: ' + fmt(r2(Math.max(...real) - Math.min(...real))) + ' ₪') : '';
  }
  const rebuild = () => { xfBuild(H.a, X); renderPv(); const n = $('#xf-n', view); if (n) n.textContent = statusText(); };
  const after = async (label, msg) => { const f = focusKey(); const ok = await H.save(label); if (ok) rememberCollectors(H.a.records); xfBuild(H.a, X); draw(); refocus(f); if (ok && msg) toast(msg); };
  /* xfAuto (app.html 3599-3609) */
  function xfAuto() {
    xfBuild(H.a, X); const pv = X.pv;
    if (pv.names.length < 2) return toast('סמן לפחות שני גובים');
    const ents = pv.entries.filter(e => String(e.n || '').trim() || num(e.a));
    if (!ents.length) return toast('אין שורות לחלוקה');
    const pool = ents.filter(e => normStatus(e.s) !== ST_GOT && !/,"[1g]"\]$/.test(e.snap || ''));
    if (!pool.length) return toast('כל השורות כבר משויכות מהפיצול');
    arrangeCore(ents, pool, pv.names, H.a.date || todayISO(), hist);
    pv.entries.forEach(e => { if (cleanColl(e.c)) xfSync(H, e, 'c'); });
    renderPv(); H.save('חלוקה אוטומטית'); toast('הרשימה חולקה אוטומטית בין ' + pv.names.length + ' גובים');
  }
  async function cutOpen(key) {
    const CUT = X.cut;
    if (CUT.key === key) { CUT.key = null; CUT.parts = null; renderPv(); return; }
    const s = cutSrc(H.a, key); if (!s) return toast('השורה לא נמצאה');
    if (!(s.a > 0)) return toast('אין סכום לפצל. רשום סכום בשורה');
    const en = X.pv && X.pv.entries.find(x => (x.sid || x.id) === key), ec = en ? cleanColl(en.c) : s.c;
    CUT.dt = en ? (normTime(en.t) || '') : s.t; CUT.dc = isRealColl(ec) ? ec : '';
    const a1 = s.a >= 2 ? Math.round(s.a / 2) : r2(s.a / 2);
    CUT.key = key; CUT.parts = [{ a: String(a1), t: CUT.dt, c: CUT.dc, am: false }, { a: String(r2(s.a - a1)), t: CUT.dt, c: CUT.dc, am: false }];
    cutShow(0);
  }
  function cutShow(focusIdx) {
    renderPv();
    const box = $('#xf-l [data-cut-box]', view); if (!box) return;
    if (focusIdx != null) { try { box.scrollIntoView({ block: 'nearest' }); } catch { /* */ } const f = box.querySelector('[data-cut-a="' + focusIdx + '"]'); if (f) { f.focus(); try { f.select(); } catch { /* */ } } }
  }
  async function doXfer(btn) {
    if (X.busy) return;
    X.busy = true; btn.disabled = true; btn.textContent = 'מעביר…';
    try {
      await H.flush();
      xfBuild(H.a, X); const pv = X.pv, names = xfNames(H.a);
      const ents = (pv ? pv.entries : []).filter(e => String(e.n || '').trim() || num(e.a));
      if (!ents.length) { toast('אין שורות עם שעה. רשום שעה ליד הלווים שצריך לאסוף מהם'); return; }
      const T = target();
      if (!X.opId) X.opId = uid();
      const body = { splitId: H.a.id, baseVersion: H.a._version, date: X.date, workId: T ? T.id : null, names, opId: X.opId,
        entries: ents.map(e => ({ sid: e.sid || '', id: e.id, man: !e.sid, n: e.n, a: num(e.a), t: normTime(e.t) || '', s: e.s || '', p: e.p || '', c: e.c || '', h: e.h || '', ...(e.pg ? { pg: e.pg, pp: e.pp || '' } : {}) })) };
      const out = await save('POST', '/api/split-tools/xfer', body, { label: 'העברה לאיסוף יומי', queue: false });
      X.opId = null; X.pv = null; X.cut.key = null; X.cut.parts = null;
      const skipped = (H.a.records || []).filter(r => r && !r.side && r.c !== CHANGE && String(r.n || '').trim() && !normTime(r.t) && !r.na && !ents.some(e => e.sid === r._k)).length;
      const left = skipped ? ' (' + skipped + ' שורות בלי שעה נשארו בפיצול)' : '';
      toast((out.created ? 'הועברו ' : 'נוספו ') + out.added + ' שורות לאיסוף היומי של ' + dmy(out.date) + ' · עכשיו ' + out.total + ' שורות' + left + (out.summary && out.summary.length ? ' · ' + out.summary.map(s => s.c + ': ' + s.n + ' חייבים · ' + fmt(s.a) + ' ₪').join(' · ') : ''), 7000);
      location.hash = '#/acc/' + out.workId;
    } catch (e) {
      if (!e.network) X.opId = null;
      if (e.status === 409) { toast(e.message, 6000); try { H.a = await get('/api/accounts/' + id); works = await get('/api/accounts?kind=work'); } catch { /* */ } xfBuild(H.a, X); draw(); }
      else toast(e.network ? 'אין קליטה. לחץ שוב ״העברה לאיסוף יומי״ — ההעברה לא תירשם פעמיים' : e.message, 6000);
    } finally { X.busy = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = 'העברה לאיסוף יומי'; } }
  }
  function bindTop() {
    const root = $('#xf-root', view);
    $('#xf-c', root).addEventListener('change', e => { const c = e.target.dataset.xc; if (!c) return; const s = xfSel(); if (e.target.checked) s.add(c); else s.delete(c); CO.d = { ...(CO.d || {}), sel: Array.from(s) }; saveColl(d => { d.sel = Array.from(s); }); rebuild(); });
    $('#xf-c', root).addEventListener('click', async e => {
      const b = e.target.closest('[data-xdelc]'); if (!b) return;
      const c = b.dataset.xdelc;
      if (!armed(b, 'מחק?', '×')) return;
      await saveColl(d => { const del = new Set(Array.isArray(d.del) ? d.del : []); del.add(c); d.del = Array.from(del); d.coll = (Array.isArray(d.coll) ? d.coll : []).filter(x => x !== c); const sel = new Set(Array.isArray(d.sel) ? d.sel : ['עידן', 'טאייה']); sel.delete(c); d.sel = Array.from(sel); });
      xfBuild(H.a, X); draw(); toast('הגובה ' + c + ' נמחק מהרשימה');
    });
    const addXfColl = async () => {
      const inp = $('#xf-new', root), c = cleanColl(inp.value).replace(/\s+/g, ' ');
      if (!c) return toast('כתוב את שם הגובה');
      if (!isRealColl(c)) return toast('שם הגובה לא תקין');
      await saveColl(d => { const del = new Set(Array.isArray(d.del) ? d.del : []); del.delete(c); d.del = Array.from(del); const s = new Set(Array.isArray(d.coll) ? d.coll : []); s.add(c); d.coll = Array.from(s); const sel = new Set(Array.isArray(d.sel) ? d.sel : ['עידן', 'טאייה']); sel.add(c); d.sel = Array.from(sel); });
      xfBuild(H.a, X); draw(); toast('הגובה ' + c + ' נוסף וסומן');
    };
    $('#xf-add', root).onclick = addXfColl;
    $('#xf-new', root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addXfColl(); } });
    $('#xf-date', root).onchange = e => { X.date = e.target.value || todayISO(); const n = $('#xf-n', view); if (n) n.textContent = statusText(); };
    $('#xf-go', root).onclick = e => doXfer(e.currentTarget);
    $('#xf-q', root).oninput = e => { X.q = e.target.value; renderPv(); };
    const rs = $('#xf-reset', root);
    if (rs) rs.onclick = () => { const A = H.a; let n = 0; (A.records || []).forEach(r => { if (r && r.xd) { delete r.xd; n++; } }); if (A.xstash && A.xstash.length) { A.xstash.forEach(r => { delete r.xd; }); A.records.push(...A.xstash); n += A.xstash.length; A.xstash = []; } if (A.xmstash && A.xmstash.length) { A.xman = (A.xman || []).concat(A.xmstash); n += A.xmstash.length; A.xmstash = []; } X.pv = null; after('אפס העברה', 'הוחזרו ' + n + ' שורות לרשימת ההעברה'); };
    /* מסיר מהפיצול כל לקוח שכבר נמצא ברשימת האיסוף היומי (לפי שם וסכום) — app.html 4732-4748 */
    $('#xf-dd', root).onclick = async () => {
      const T = target(); if (!T) return toast('אין רשימה באיסוף היומי');
      let W; try { W = await get('/api/accounts/' + T.id); } catch (e) { return toast(e.message); }
      const used = (W.entries || []).filter(e => e && (String(e.n || '').trim() || num(e.a)));
      if (!used.length) return toast('אין רשימה באיסוף היומי');
      const key = (n, a) => normName(n) + '|' + r2(num(a)), pool = new Map();
      used.forEach(e => { const k = key(e.n, e.a); pool.set(k, (pool.get(k) || 0) + 1); });
      const gone = []; const A = H.a;
      A.records = A.records.filter(r => {
        if (!r || r.side || r.c === CHANGE || !String(r.n || '').trim()) return true;
        const k = key(r.n, r.a), c = pool.get(k) || 0;
        if (c > 0) { pool.set(k, c - 1); gone.push(Object.assign({}, r)); return false; }
        return true;
      });
      if (!gone.length) return toast('אף לקוח מהפיצול לא נמצא באיסוף היומי');
      A.xstash = (A.xstash || []).concat(gone);
      X.pv = null; after('הסרת מי שכבר באיסוף', 'הוסרו מהפיצול ' + gone.length + ' לקוחות שכבר באיסוף היומי');
    };
    const L = $('#xf-l', root);
    // עריכה ברשימה (initXfPv, app.html 3675-3712)
    L.addEventListener('input', e => {
      const t = e.target;
      const cbox = t.closest('[data-cut-box]');
      if (cbox && X.cut.parts) {
        const P = X.cut.parts;
        if (t.dataset.cutA != null) {
          const i = +t.dataset.cutA, p = P[i]; if (!p) return; p.a = t.value; p.am = true;
          /* החלק האחרון שלא נגעת בסכום שלו מקבל אוטומטית את מה שנשאר */
          const s = cutSrc(H.a, X.cut.key);
          if (s) { let j = -1; for (let k = P.length - 1; k >= 0; k--) { if (k !== i && !P[k].am) { j = k; break; } }
            if (j >= 0) { const rest = r2(s.a - sum(P.filter((_, k) => k !== j).map(x => num(x.a)))); P[j].a = rest > 0 ? String(rest) : ''; const inp = cbox.querySelector('[data-cut-a="' + j + '"]'); if (inp) inp.value = P[j].a; } }
        } else if (t.dataset.cutT != null) { const p = P[+t.dataset.cutT]; if (p) p.t = t.value; }
        else if (t.dataset.cutC != null) { const p = P[+t.dataset.cutC]; if (p) p.c = t.value; }
        else return;
        cutRem(H.a, X, cbox); return;
      }
      const f = t.dataset.pf; if (!f) return; const box = t.closest('[data-pi]'), en = X.pv && X.pv.entries[+box.dataset.pi]; if (!en) return;
      if (f === 'p') { const cv = cleanPh(t.value); if (cv !== t.value.trim()) t.value = cv; en.p = cv; en.pm = 'm'; }
      else if (f === 'c' || f === 'h') return;
      else en[f] = t.value;
      en.u = false; xfTotals();
      if (f === 'n' || f === 'a' || f === 'p' || (f === 't' && !en.sid)) xfSync(H, en, f);
    });
    L.addEventListener('change', async e => {
      const t = e.target;
      if (t.dataset.cutT != null && X.cut.parts) {
        const p = X.cut.parts[+t.dataset.cutT]; if (!p) return;
        const v = String(t.value || '').trim(), nt = v ? normTime(v) : '';
        if (v && !nt) return toast('שעה לא תקינה. כתוב למשל 09:30');
        p.t = nt; t.value = nt; return;
      }
      const f = t.dataset.pf; if (!f) return; const box = t.closest('[data-pi]'), en = X.pv && X.pv.entries[+box.dataset.pi]; if (!en) return;
      if (f === 'n') {
        if (!String(en.p || '').trim()) { const lk = await phLookup(en.n, H.a);
          if (lk.p) { en.p = lk.p; en.pm = 's'; xfSync(H, en, 'p'); renderPv(); if (lk.pm === 'a') toast('הטלפון נמצא בהתאמה חלקית של השם. בדוק אותו'); else toast('הטלפון מולא אוטומטית'); }
          else if (lk.pm === 'amb') toast('יש כמה מספרים שונים לשם הזה. כתוב ידנית'); }
        return; }
      if (f === 't') { const nt = normTime(en.t); if (nt) { en.t = nt; t.value = nt; if (en.s === ST_NA) en.s = ''; xfSync(H, en, 't'); } else if (String(en.t || '').trim()) { toast('שעה לא תקינה. כתוב למשל 09:30'); } renderPv(); return; }
      if (f === 'c') { en.c = t.value; en.cm = 'm'; xfSync(H, en, 'c'); renderPv(); return; }
      if (f === 'h') { en.h = t.value; en.hm = 'm'; xfSync(H, en, 'h'); renderPv(); return; }
      if (f === 'p') { const sh = phShow(en.p); if (sh && sh !== en.p) { en.p = sh; t.value = sh; } }
    });
    L.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('[data-cut-box]') && e.target.matches('input')) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); runCut(); } });
    const runCut = () => { const msg = doCut(H.a, X); if (msg) after('פיצול חוב לחלקים', msg); };
    L.addEventListener('click', e => {
      const pv = X.pv; if (!pv) return; const t = e.target;
      const op = t.closest('[data-cut-open]'); if (op) { cutOpen(op.dataset.cutOpen); return; }
      const cbox = t.closest('[data-cut-box]');
      if (cbox && X.cut.parts) {
        if (t.closest('[data-cut-x]')) { X.cut.key = null; X.cut.parts = null; renderPv(); return; }
        if (t.closest('[data-cut-add]')) { const s = cutSrc(H.a, X.cut.key), rest = s ? r2(s.a - sum(X.cut.parts.map(p => num(p.a)))) : 0; X.cut.parts.push({ a: rest > 0 ? String(rest) : '', t: X.cut.dt || '', c: X.cut.dc || '', am: false }); cutShow(X.cut.parts.length - 1); return; }
        const d = t.closest('[data-cut-del]'); if (d) { X.cut.parts.splice(+d.dataset.cutDel, 1); cutShow(); return; }
        if (t.closest('[data-cut-go]')) { runCut(); return; }
        if (t.closest('[data-cut-join]')) { const msg = doUncut(H.a, X); if (msg) after('איחוד חלקים', msg); return; }
        return;
      }
      const d = t.closest('[data-pdel]');
      if (d) {
        /* מחיקה רק בלחיצה על × ואישור: לחיצה ראשונה מסמנת, שנייה (תוך 4 שניות) מוחקת */
        if (!armed(d, 'מחק?', '×')) return;
        const en = pv.entries[+d.dataset.pdel]; if (!en) return; const A = H.a;
        let msg;
        if (!en.sid) { A.xman = (A.xman || []).filter(x => x !== en); msg = 'השורה נמחקה'; }
        else if (/#g$/.test(String(en.sid))) { const h = A.xhide || []; if (h.indexOf(en.sid) < 0) h.push(en.sid); A.xhide = h; msg = 'החלק שנאסף הוסר מרשימת ההעברה'; }
        else { const r = A.records.find(x => x && x._k === en.sid); if (r) { r.t = ''; r.na = false; } msg = 'הוסר מרשימת ההעברה. ' + (String(en.n || '').trim() || 'הלקוח') + ' נשאר בפיצול בלי שעה'; }
        pv.entries.splice(+d.dataset.pdel, 1); after('הסרה מרשימת ההעברה', msg); return;
      }
      if (t.closest('[data-pvadd]')) { const ne = { id: uid(), n: '', a: '', t: '', s: '', p: '', pm: '', c: pv.names[0] || '', cm: 'm', h: '', hm: '', src: 'ידני', u: false }; H.a.xman = (H.a.xman || []).concat([ne]); pv.entries.push(ne); H.later('שורה ידנית'); renderPv(); const ins = $$('#xf-l .xfe [data-pf="n"]', view); const last = ins.find(x => x.closest('[data-pi]').dataset.pi === String(pv.entries.length - 1)); if (last) last.focus(); return; }
      if (t.closest('[data-pvre]')) xfAuto();
    });
  }
  draw();
  const off = onLive(async (e) => {
    if (e.col === 'accounts' && e.id === id && e.version !== H.a._version && !H.pend && !X.busy) { await H.chain; if (e.version <= H.a._version) return; try { H.a = await get('/api/accounts/' + id); } catch { return; } rebuild(); }
    else if (e.col === 'accounts' && e.id !== id) { get('/api/accounts?kind=work').then(w => { works = w; const n = $('#xf-n', view); if (n) n.textContent = statusText(); }).catch(() => {}); }
  });
  return () => { off(); if (H.pend) H.save(); };
}

route('xfer', xferView);
accountAction('split', { label: 'העברה לאיסוף יומי', can: (App) => App.can.finance, run: (ctx) => { location.hash = '#/xfer/' + ctx.a.id; } });
accountPanel('split', panelRender, panelBind);
