// רשימת הגובים המשותפת לכל הלשוניות (פיצול, איסוף יום, חשבון גובים, הוצאות, הלוואות): מקור אחד — /api/collectors (פעילים בלבד).
// כל שינוי (הוספה, תיקון שם, לא פעיל / חזרה) נשמר בשרת ומגיע לכל המסכים והמכשירים דרך העדכון החי — בלי לצאת מהמסך ובלי רענון.
// enhanceCollSelect: ליד כל ״בחר גובה״ — חיפוש, ״+ הוסף גובה״, ״הוסף את [השם] כגובה חדש״ ו״ניהול גובים״, בתוך אותו מסך.
import { get, save, uid } from './api.js';
import { $, $$, esc, fmt, money, dmy, toast } from './ui.js';
import { cleanColl, collKey, CHANGE, NOC_SP } from './calc.js';
import { onLive } from './app.js';

let CACHE = null, hooked = false; const subs = new Set();
// העדכון החי נרשם בשימוש הראשון (לא בטעינת המודול — app.js עוד בטעינה בשלב הזה)
const hook = () => { if (hooked) return; hooked = true; onLive((e) => { if (e.col === 'settings' && e.id === 'coll') collsChanged(); }); };
export function activeColls() {
  hook();
  if (!CACHE) CACHE = get('/api/collectors').then(l => (l || []).map(cleanColl).filter(c => c && c !== CHANGE && c !== NOC_SP)).catch(() => { CACHE = null; return []; });
  return CACHE;
}
export function collsChanged() { CACHE = null; subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
export const onColls = (f) => { subs.add(f); setTimeout(hook, 0); return () => subs.delete(f); };

const q = (s) => collKey(s);
export async function addColl(name) {
  const r = await save('POST', '/api/collectors/add', { name, opId: uid() }, { queue: false, label: 'הוספת גובה' });
  collsChanged(); return r;
}

// ---- ליד <select> של בחירת גובה ----
export function enhanceCollSelect(sel, { emptyLabel = 'בחר גובה…', keep = [] } = {}) {
  if (!sel || sel.dataset.cpk) return; sel.dataset.cpk = '1';
  const host = document.createElement('div'); host.className = 'cpk no-print';
  host.innerHTML = `<div class="cpk-row"><input class="in cpk-q" type="search" placeholder="חיפוש גובה…" aria-label="חיפוש גובה ברשימה" autocomplete="off"><button type="button" class="btn ghost sm cpk-add">+ הוסף גובה</button><button type="button" class="btn ghost sm cpk-mng">ניהול גובים</button></div>
    <div class="cpk-new" hidden></div><div class="cpk-msg small" role="status"></div><div class="cpk-panel" hidden></div>`;
  (sel.closest('label') || sel).after(host);
  const qi = $('.cpk-q', host), nw = $('.cpk-new', host), msg = $('.cpk-msg', host), panel = $('.cpk-panel', host);
  let list = [];
  const fill = (filter = '') => {
    const cur = sel.value, f = q(filter);
    const names = [...new Set(list.concat(keep.filter(Boolean)).concat(cur && cur !== '__none' && cur !== CHANGE ? [cur] : []))];
    const shown = f ? names.filter(c => q(c).includes(f)) : names;
    const extra = [...sel.options].filter(o => o.dataset.keep === '1').map(o => o.outerHTML).join('');
    sel.innerHTML = `<option value="">${esc(emptyLabel)}</option>` + shown.map(c => `<option${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('') + extra;
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
    if (f && shown.length === 1 && sel.value !== shown[0]) { sel.value = shown[0]; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    const exact = names.some(c => q(c) === f);
    nw.hidden = !(f && !exact);
    nw.innerHTML = f && !exact ? `<button type="button" class="btn sm cpk-addq">הוסף את ״${esc(filter.trim())}״ כגובה חדש</button>` : '';
  };
  const pick = (name) => { fill(''); if (![...sel.options].some(o => o.value === name)) sel.insertAdjacentHTML('beforeend', `<option>${esc(name)}</option>`); sel.value = name; qi.value = ''; nw.hidden = true; sel.dispatchEvent(new Event('change', { bubbles: true })); };
  const doAdd = async (name) => {
    name = cleanColl(name); if (!name) { msg.innerHTML = '<span class="neg">כתוב שם גובה</span>'; return; }
    msg.textContent = 'מוסיף…';
    try { const r = await addColl(name); list = await activeColls(); pick(r.name); msg.innerHTML = r.existed ? `<span class="ok-t">״${esc(r.name)}״ כבר ברשימה${r.reactivated ? ' (הוחזר לפעילות)' : ''} — נבחר</span>` : `<span class="ok-t">✓ ${esc(r.name)} נוסף ונבחר</span>`; }
    catch (e) { msg.innerHTML = `<span class="neg">לא נשמר — ${esc(e.network ? 'בעיית קליטה. נסה שוב.' : e.message)}</span>`; }
  };
  qi.addEventListener('input', () => fill(qi.value));
  host.addEventListener('click', (e) => {
    if (e.target.closest('.cpk-addq')) return doAdd(qi.value);
    if (e.target.closest('.cpk-add')) {
      if (qi.value.trim()) return doAdd(qi.value);
      nw.hidden = false; nw.innerHTML = '<div class="cpk-row"><input class="in cpk-nn" placeholder="שם הגובה החדש" autocomplete="off"><button type="button" class="btn sm cpk-nok">שמור גובה</button></div>';
      const ni = $('.cpk-nn', nw); ni.focus(); ni.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAdd(ni.value); } };
      return;
    }
    if (e.target.closest('.cpk-nok')) return doAdd($('.cpk-nn', nw).value);
    if (e.target.closest('.cpk-mng')) { panel.hidden = !panel.hidden; if (!panel.hidden) mountManager(panel, { onPick: pick }); }
  });
  e_stop(host);
  const off = onColls(async () => { if (!host.isConnected) return off(); list = await activeColls(); fill(qi.value); });
  activeColls().then(l => { list = l; fill(''); });
}
const e_stop = (el) => { el.addEventListener('click', (e) => e.stopPropagation()); };

// ---- ניהול גובים: תיקון שם, לא פעיל / חזרה לפעילות (עם העברת גביות פתוחות) ----
export async function mountManager(box, { onPick } = {}) {
  box.innerHTML = '<div class="small muted">טוען את רשימת הגובים…</div>';
  let all = [];
  const load = async () => { try { all = await get('/api/collectors/all'); } catch (e) { box.innerHTML = `<div class="note err">${esc(e.message)}</div>`; return false; } return true; };
  const draw = () => {
    box.innerHTML = `<div class="cmg"><div class="row sp"><b>ניהול גובים</b><span class="small muted">${all.filter(x => x.active).length} פעילים${all.some(x => !x.active) ? ' · ' + all.filter(x => !x.active).length + ' לא פעילים' : ''}</span></div>
      <div class="cmg-list">${all.map(x => `<div class="cmg-i${x.active ? '' : ' off'}" data-cn="${esc(x.name)}"><span class="cmg-n">${esc(x.name)}${x.active ? '' : ' <span class="pill">לא פעיל</span>'}</span>
        <span class="cmg-b"><button type="button" class="btn ghost sm" data-cren>תיקון שם</button>${x.active ? '<button type="button" class="btn ghost sm" data-coff>סמן כלא פעיל</button>' : '<button type="button" class="btn sm" data-con>החזר לפעילות</button>'}</span><div class="cmg-x"></div></div>`).join('')}</div></div>`;
  };
  const refresh = async () => { if (await load()) draw(); };
  box.onclick = async (e) => {
    e.stopPropagation();
    const it = e.target.closest('[data-cn]'); if (!it) return; const name = it.dataset.cn, x = $('.cmg-x', it);
    if (e.target.closest('[data-cren]')) {
      x.innerHTML = `<div class="cpk-row"><input class="in cmg-to" value="${esc(name)}" aria-label="שם חדש ל${esc(name)}"><button type="button" class="btn sm" data-crok>שמור שם</button></div><div class="cmg-m small"></div>`;
      $('.cmg-to', x).focus(); return;
    }
    if (e.target.closest('[data-crok]')) {
      const to = cleanColl($('.cmg-to', x).value), m = $('.cmg-m', x); if (!to) return;
      const op = x.dataset.op && x.dataset.sig === to ? x.dataset.op : (x.dataset.op = uid(), x.dataset.sig = to, x.dataset.op);
      m.textContent = 'שומר…';
      try { const r = await save('POST', '/api/collectors/rename', { from: name, to, opId: op }, { queue: false, label: 'תיקון שם גובה' }); collsChanged(); toast(`השם תוקן: ${name} ← ${r.name}${r.rows ? ` (${r.rows} שורות ב-${r.docs} חשבונות)` : ''}`); await refresh(); }
      catch (err) {
        if (err.status === 409) { const ex = (err.message.match(/״(.+)״/) || [])[1] || to; m.innerHTML = `<span class="neg">${esc(err.message)}.</span> ${onPick ? `<button type="button" class="btn sm" data-cuse="${esc(ex)}">בחר בגובה הקיים ״${esc(ex)}״</button>` : 'אפשר להעביר את הגביות אליו דרך ״סמן כלא פעיל״.'}`; }
        else m.innerHTML = `<span class="neg">לא נשמר — ${esc(err.network ? 'בעיית קליטה' : err.message)}</span>`;
      }
      return;
    }
    const use = e.target.closest('[data-cuse]'); if (use) { onPick && onPick(use.dataset.cuse); return; }
    if (e.target.closest('[data-con]')) {
      try { await save('POST', '/api/collectors/active', { name, active: true, opId: uid() }, { queue: false, label: 'החזרת גובה לפעילות' }); collsChanged(); toast(`${name} חזר לפעילות`); await refresh(); } catch (err) { toast(err.message); }
      return;
    }
    if (e.target.closest('[data-coff]')) {
      x.innerHTML = '<div class="small muted">בודק גביות פתוחות…</div>';
      let open = []; try { open = await get('/api/collectors/open?name=' + encodeURIComponent(name)); } catch { /* */ }
      const act = (await activeColls()).filter(c => q(c) !== q(name));
      x.innerHTML = `<div class="cmg-off">${open.length ? `<p style="margin:4px 0"><b>נשארו אצל ${esc(name)} ${open.length} גביות פתוחות</b> — סמן אילו להעביר ולמי. מה שלא יועבר יישאר על שמו.</p>
        <div class="cmg-open">${open.map((o, i) => `<label class="row cmg-o"><input type="checkbox" class="ck" data-oi="${i}" checked> <span>${esc(o.n)} · ${money(o.a)} · ${esc(dmy(o.date))}${o.t ? ' ' + esc(o.t) : ''} · ${o.kind === 'split' ? 'פיצול' : 'איסוף יום'}${o.s ? ' · ' + esc(o.s) : ''}</span></label>`).join('')}</div>
        <label class="f">להעביר אל<select class="in cmg-tosel"><option value="">בחר גובה…</option>${act.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>` : `<p class="small muted" style="margin:4px 0">אין אצל ${esc(name)} גביות פתוחות.</p>`}
        <p class="small muted" style="margin:4px 0">הגבייה שכבר נרשמה וההיסטוריה נשארים על שמו. הוא לא יוצע לשיוכים חדשים עד שיוחזר לפעילות.</p>
        <div class="cpk-row">${open.length ? '<button type="button" class="btn sm" data-coffmv>העבר את המסומנות וסמן כלא פעיל</button>' : ''}<button type="button" class="btn ${open.length ? 'ghost ' : ''}sm" data-coffok>סמן כלא פעיל${open.length ? ' בלי להעביר' : ''}</button></div><div class="cmg-m small"></div></div>`;
      x._open = open; x._op = uid(); return;
    }
    const mv = e.target.closest('[data-coffmv]'), ok = e.target.closest('[data-coffok]');
    if (mv || ok) {
      const m = $('.cmg-m', x), open = x._open || [];
      let move = [], to = '';
      if (mv) { move = $$('[data-oi]', x).filter(c => c.checked).map(c => open[+c.dataset.oi]).map(o => ({ id: o.id, key: o.key })); to = ($('.cmg-tosel', x) || {}).value || ''; if (move.length && !to) { m.innerHTML = '<span class="neg">בחר לאיזה גובה להעביר</span>'; return; } }
      m.textContent = 'שומר…';
      try { const r = await save('POST', '/api/collectors/active', { name, active: false, move, to, opId: x._op }, { queue: false, label: 'סימון גובה כלא פעיל' }); collsChanged(); toast(`${name} סומן כלא פעיל${r.moved ? ` · ${r.moved} גביות הועברו ל${to}` : ''}`); await refresh(); }
      catch (err) { m.innerHTML = `<span class="neg">לא נשמר — ${esc(err.network ? 'בעיית קליטה. לחץ שוב — לא יירשם פעמיים.' : err.message)}</span>`; }
    }
  };
  await refresh();
}
