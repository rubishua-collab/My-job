// ניתוחים, לוח בקרה, השוואות, PDF ושיתוף, חיפוש חשבונות, אחוזי חלוקה — הועתק מהתוכנה המקורית (app.html).
// כל הנתונים הכספיים מחושבים מפונקציות החישוב המקוריות (calc.js) בלי שינוי.
import { SaveCtl } from '../savectl.js';
import { route, more, accountAction, accountPanel, todayPanel } from '../registry.js';
import { get, save, uid, pendingOps } from '../api.js';
import { $, $$, toast, viewState } from '../ui.js';
import { App, onLive } from '../app.js';
import { calcMorning, mRp, r2, num, normName, todayISO } from '../calc.js';
import { esc, money, fmt, pctS, isoLabel, weekday, KL, reportHTML, shareText, mCompareHTML, origView, sharePdf, REPORT_CSS } from './reports-print.js';
import { S, LN, AN, anBody, anPdf, xlExport, clientCard, AN_CSS, addDays } from './reports-an.js';
import { dashHTML, savedHTML, SV, progData, alertsOf, alertsHTML, DASH_CSS } from './reports-dash.js';

// ---- עיצוב: פעם אחת ----
(() => { const st = document.createElement('style'); st.id = 'reports-css'; st.textContent = REPORT_CSS + AN_CSS + DASH_CSS; document.head.appendChild(st); })();

const fin = (A) => !!(A && A.can && A.can.finance);

// ---- טעינת כל החשבונות המלאים (במקור: S.s.list). מתרענן אחרי כל שינוי בחשבון ----
let loadedAt = 0, loading = null;
async function loadAll(force) {
  if (!force && loadedAt && Date.now() - loadedAt < 60000) return S.s.list;
  if (loading) return loading;
  loading = (async () => {
    const [list, loans] = await Promise.all([get('/api/reports/accounts'), get('/api/loans').catch(() => [])]);
    S.s.list = list; LN.list = loans || []; loadedAt = Date.now(); return list;
  })();
  try { return await loading; } finally { loading = null; }
}
let liveHooked = false;
function hookLive() { if (liveHooked) return; liveHooked = true; onLive((e) => { if (e.col === 'accounts' || e.col === 'loans') loadedAt = 0; }); }
const denied = (view) => { view.innerHTML = '<div class="band"><div class="grow"><h1>אין הרשאה</h1></div></div><div class="note err">המסך הזה פתוח רק לבעל התוכנה ולמנהלים.</div>'; };
const band = (title, eyebrow, extra = '') => `<div class="band"><div class="grow"><div class="eyebrow">${esc(eyebrow || '')}</div><h1>${esc(title)}</h1></div>${extra}</div>`;

// ====================== לוח בקרה ======================
route('dashboard', async (view) => {
  if (!fin(App)) return denied(view);
  hookLive(); view.innerHTML = '<div class="boot">טוען…</div>';
  await loadAll();
  const draw = () => {
    view.innerHTML = band('לוח בקרה', weekday(todayISO()) + ' · ' + isoLabel(todayISO())) + '<div class="rpx" id="dash">' + dashHTML(pendingOps().length) + '</div>';
    $$('[data-go]', view).forEach(b => b.onclick = () => { viewState.set('accounts', { kind: b.dataset.go }); location.hash = '#/accounts'; });
    const q = $('#h-q', view); q.onkeydown = (e) => { if (e.key === 'Enter' && q.value.trim()) { viewState.set('clients', { q: q.value.trim() }); location.hash = '#/clients'; } };
  };
  draw();
  let t; return onLive((e) => { if (e.col !== 'accounts' && e.col !== 'loans') return; clearTimeout(t); t = setTimeout(async () => { if (!document.querySelector('#dash')) return; await loadAll(true); const y = window.scrollY; draw(); window.scrollTo(0, y); }, 800); });
});
more({ href: '#/dashboard', label: 'לוח בקרה', can: fin, order: 1 });

// ====================== ניתוחים ======================
const RANGES = [['7', '7 ימים'], ['30', '30 ימים'], ['mon', 'החודש'], ['pmon', 'חודש קודם'], ['90', '90 ימים'], ['all', 'הכל'], ['custom', 'טווח']];
route('analytics', async (view, args, query) => {
  if (!fin(App)) return denied(view);
  hookLive(); view.innerHTML = '<div class="boot">טוען…</div>';
  Object.assign(AN, viewState.get('analytics').an || {}); AN.client = null;
  if (query.get('range')) AN.range = query.get('range');
  if (query.get('from')) { AN.range = 'custom'; AN.from = query.get('from'); AN.to = query.get('to') || AN.from; }
  await loadAll();
  view.innerHTML = band('ניתוחים ומגמות', 'דוחות') + `<div class="rpx">
    <div class="panel">
      <div class="row sp"><h2>ניתוחים ומגמות</h2><span class="small muted" id="an-n"></span></div>
      <p class="small muted" style="margin:0">הניתוחים מחושבים מהחשבונות השמורים בלבד. בחר תקופה, ולמטה תראה את המספרים, הגרפים, הלקוחות הבולטים, הגובים והתראות על לקוחות שלא שילמו.</p>
      <div class="row" id="an-range">${RANGES.map(([k, l]) => `<button class="rchip" type="button" data-r="${k}" aria-pressed="${AN.range === k}">${l}</button>`).join('')}</div>
      <div class="row" id="an-custom" ${AN.range === 'custom' ? '' : 'hidden'}>
        <label class="f" for="an-from">מתאריך<input class="in" type="date" id="an-from" value="${esc(AN.from)}"></label>
        <label class="f" for="an-to">עד תאריך<input class="in" type="date" id="an-to" value="${esc(AN.to)}"></label>
      </div>
      <div class="row"><button class="btn ghost" id="an-pdf" type="button">דוח תקופה PDF לוואטסאפ</button><button class="btn ghost" id="an-xlsx" type="button">ייצוא ל-Excel</button><span class="grow"></span></div>
      <div class="sharebox" id="an-share"></div>
    </div>
    <div id="an-out" class="rpx"></div></div>`;
  const persist = () => viewState.set('analytics', { an: { range: AN.range, from: AN.from, to: AN.to, stale: AN.stale, coll: AN.coll } });
  const render = () => { const r = anBody(); $('#an-n', view).textContent = r.head; $('#an-out', view).innerHTML = r.html; persist(); };
  $('#an-range', view).onclick = (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return; AN.range = b.dataset.r;
    $$('#an-range .rchip', view).forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#an-custom', view).hidden = AN.range !== 'custom';
    if (AN.range === 'custom' && !AN.from) { AN.from = addDays(todayISO(), -29); AN.to = todayISO(); $('#an-from', view).value = AN.from; $('#an-to', view).value = AN.to; }
    render();
  };
  $('#an-from', view).oninput = (e) => { AN.from = e.target.value; render(); };
  $('#an-to', view).oninput = (e) => { AN.to = e.target.value; render(); };
  const out = $('#an-out', view);
  out.onclick = (e) => {
    const c = e.target.closest('[data-client]'); if (c) { AN.client = c.dataset.client; AN.q = ''; render(); const el = $('#an-client', view); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const s = e.target.closest('[data-stale]'); if (s) { AN.stale = +s.dataset.stale; render(); return; }
    const k = e.target.closest('[data-coll]'); if (k) { AN.coll = k.dataset.coll; render(); return; }
  };
  let qt = null;
  out.oninput = (e) => { if (e.target.id !== 'an-q') return; AN.q = e.target.value; clearTimeout(qt);
    qt = setTimeout(() => { const k = normName(AN.q); AN.client = k || null; $('#an-card', view).innerHTML = k ? clientCard(k) : ''; }, 250); };
  $('#an-pdf', view).onclick = () => anPdf($('#an-pdf', view), $('#an-share', view));
  $('#an-xlsx', view).onclick = () => xlExport($('#an-xlsx', view), toast);
  render();
  if (query.get('sec') === 'stale') { const el = $('#an-stale', view); if (el) el.scrollIntoView({ block: 'start' }); }
});
more({ href: '#/analytics', label: 'ניתוחים ומגמות', can: fin, order: 2 });

// ====================== חיפוש בחשבונות שמורים ======================
const TYPES = [['', 'הכל'], ['ריבית', 'ריבית ששילם'], ['קרן', 'קרן ששילם'], ['הלוואה', 'הלוואה שניתנה'], ['פיצול', 'פיצול'], ['איסוף', 'איסוף יומי'], ['חוב', 'חוב (חשבון גובים)'], ['הוצאה', 'הוצאה (חשבון גובים)']];
route('saved', async (view) => {
  if (!fin(App)) return denied(view);
  hookLive(); view.innerHTML = '<div class="boot">טוען…</div>';
  Object.assign(SV, viewState.get('saved').sv || {});
  await loadAll();
  view.innerHTML = band('חשבונות שמורים', S.s.list.length + ' חשבונות') + `<div class="rpx">
    <div class="panel" id="s-search-panel"><h2>חיפוש בחשבונות שמורים</h2>
      <div class="grid2">
        <label class="f" for="s-name">שם הלקוח<input class="in" id="s-name" autocomplete="off" placeholder="חלק מהשם מספיק" value="${esc(SV.q.name)}"></label>
        <label class="f" for="s-amount">סכום (₪)<input class="in num" id="s-amount" inputmode="decimal" autocomplete="off" placeholder="סכום ששילם או הלוואה" value="${esc(SV.q.amount)}"></label>
        <label class="f" for="s-type">סוג<select class="in" id="s-type">${TYPES.map(([v, l]) => `<option value="${v}" ${SV.q.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="row"><button class="btn plain sm" id="s-clear" type="button">נקה חיפוש</button><span class="small muted" id="s-status"></span></div>
      <div class="row" id="s-kinds"><span class="small muted">הצג:</span>${[['', 'הכל'], ...Object.entries(KL)].map(([k, l]) => `<button class="rchip" type="button" data-k="${k}" aria-pressed="${SV.kind === k}">${l}</button>`).join('')}</div>
    </div>
    <div id="s-list" class="list"></div></div>`;
  const draw = () => { const r = savedHTML(); $('#s-status', view).textContent = r.status; $('#s-list', view).innerHTML = r.html; viewState.set('saved', { sv: SV }); };
  let t;
  const upd = () => { SV.q = { name: $('#s-name', view).value, amount: $('#s-amount', view).value, type: $('#s-type', view).value }; clearTimeout(t); t = setTimeout(draw, 150); };
  ['s-name', 's-amount'].forEach(id => $('#' + id, view).oninput = upd); $('#s-type', view).onchange = upd;
  $('#s-clear', view).onclick = () => { $('#s-name', view).value = ''; $('#s-amount', view).value = ''; $('#s-type', view).value = ''; upd(); };
  $('#s-kinds', view).onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; SV.kind = b.dataset.k; $$('#s-kinds .rchip', view).forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); };
  draw();
});
more({ href: '#/saved', label: 'חיפוש בחשבונות שמורים', can: fin, order: 3 });

// ====================== חשבון מודפס: הדפסה, PDF ושיתוף ======================
route('report', async (view, [id], query) => {
  if (!fin(App)) return denied(view);
  hookLive(); view.innerHTML = '<div class="boot">טוען…</div>';
  const [acc] = await Promise.all([get('/api/accounts/' + encodeURIComponent(id)), loadAll()]);
  const hn = query.get('hn'), ha = query.get('ha');
  const hit = hn != null ? { n: hn, a: num(ha) } : null;
  const hf = hit ? ((n, a) => normName(n) === hit.n && Math.abs(num(a) - hit.a) < 0.005) : null;
  let showOrig = false;
  const draw = () => {
    const so = !!(showOrig && acc.orig), v = so ? origView(acc) : acc;
    const txt = shareText(v);
    view.innerHTML = band(acc.title || KL[acc.kind], KL[acc.kind] + ' · ' + weekday(acc.date) + ' · ' + isoLabel(acc.date)) + `<div class="rpx">
      <div class="rbar no-print"><button class="btn plain" type="button" data-back="1">חזרה</button><button class="btn" type="button" id="r-pdf">PDF לוואטסאפ</button><button class="btn ghost" type="button" data-act="print">הדפסה</button><button class="btn ghost" type="button" id="r-copy">העתק טקסט</button><a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">שיתוף בוואטסאפ</a><a class="btn ghost" href="#/acc/${encodeURIComponent(acc.id)}">פתח את החשבון</a>${acc.orig && acc.edits ? `<button class="btn plain" type="button" id="r-orig">${so ? 'הצג גרסה נוכחית' : 'הצג כפי שנשמר במקור'}</button>` : ''}<span class="grow"></span>${acc.edits ? `<span class="chip">נערך ${acc.edits} פעמים</span>` : ''}</div>
      <div class="sharebox no-print" id="s-share"></div>
      <article class="report" id="r-report">${reportHTML(v, { hit: hf })}${v.kind === 'morning' && !so ? mCompareHTML(v, S.s.list) : ''}</article></div>`;
    $('[data-back]', view).onclick = () => history.back();
    $('#r-pdf', view).onclick = () => sharePdf(reportHTML(v), v, txt, $('#s-share', view), $('#r-pdf', view));
    $('#r-copy', view).onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('הועתק'); } catch { toast('ההעתקה לא הצליחה'); } };
    const ob = $('#r-orig', view); if (ob) ob.onclick = () => { showOrig = !showOrig; draw(); };
    const h = view.querySelector('.report .hit'); if (h) h.scrollIntoView({ block: 'center' });
  };
  draw();
});
accountAction('*', { label: 'דוח להדפסה / שיתוף', can: (A) => fin(A), run(ctx) { location.hash = '#/report/' + encodeURIComponent(ctx.a.id); } });

// ====================== חלוקת הריבית: סרגל אחוזים (app.html 9842-9874) ======================
// האחוז נשמר עם החשבון בשדה rp (החלק של רובי). חשבון בלי rp הוא 25/75. המשלוחים יורדים מהחלק של הקו.
accountPanel('morning', (ctx) => {
  if (!fin(App)) return '';
  const rp = mRp(ctx.a), lp = r2(100 - rp);
  return `<div class="ish no-print" id="m-split">
    <div class="row sp"><h3>חלוקת הריבית</h3><button class="btn plain sm" type="button" id="m-rp-reset" ${rp === 25 ? 'disabled' : ''}>החזר ל-75/25</button></div>
    <div class="ish-bar"><span class="ish-l">רובי <b class="num" id="m-rp-v">${pctS(rp)}</b></span><input type="range" id="m-rp-range" min="0" max="100" step="1" value="${rp}" style="--p:${rp}%" aria-label="החלק של רובי מהריבית, באחוזים"><span class="ish-r">קו <b class="num" id="m-lp-v">${pctS(lp)}</b></span></div>
    <div class="grid2">
      <label class="f" for="m-lp-in">חלק הקו (%)<input class="in num" id="m-lp-in" inputmode="decimal" autocomplete="off" value="${lp}"></label>
      <label class="f" for="m-rp-in">חלק רובי (%)<input class="in num" id="m-rp-in" inputmode="decimal" autocomplete="off" value="${rp}"></label>
    </div>
    <div class="small muted" id="m-rp-amt"></div><div class="small" id="m-rp-st" role="status"></div></div>`;
}, (ctx) => {
  const box = $('#m-split', ctx.view); if (!box) return;
  let cur = mRp(ctx.a), timer = null, opId = null;
  const amt = () => {
    const c = calcMorning({ ...ctx.a, rp: cur });
    $('#m-rp-amt', box).innerHTML = c.interest ? ('מהריבית של היום (' + money(c.interest) + '): לקו ' + money(c.line) + ' · לרובי ' + money(c.robi) + ' · לקו אחרי משלוחים ' + money(c.lineRem) + ' · סה״כ סופי ' + money(c.final)) : 'הסכומים יופיעו כאן אחרי טעינת דו״ח ההכנסות. כל הטבלאות וה-PDF מתעדכנים לפי החלוקה.';
  };
  const renderR = (skip) => {
    const rp = cur, lp = r2(100 - rp), rg = $('#m-rp-range', box);
    if (skip !== 'range') rg.value = String(rp);
    rg.style.setProperty('--p', rp + '%');
    $('#m-rp-v', box).textContent = pctS(rp); $('#m-lp-v', box).textContent = pctS(lp);
    if (skip !== 'rp') $('#m-rp-in', box).value = String(rp);
    if (skip !== 'lp') $('#m-lp-in', box).value = String(lp);
    $('#m-rp-reset', box).disabled = rp === 25;
    amt();
  };
  const persist = async () => {
    if (cur === mRp(ctx.a)) return;
    const data = { ...ctx.a }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]);
    if (cur !== 25) data.rp = cur; else delete data.rp; // כמו במקור: rp נשמר רק כשהוא שונה מ-25
    opId = opId || uid(); $('#m-rp-st', box).textContent = 'שומר…';
    SaveCtl.saving();
    try { await save('PUT', '/api/accounts/' + ctx.a.id, { data, baseVersion: ctx.a._version, opId }, { label: 'חלוקת הריבית ' + (ctx.a.title || ''), queue: false }); opId = null; rpFail = false; SaveCtl.saved(); toast('החלוקה נשמרה: רובי ' + pctS(cur) + ' · קו ' + pctS(r2(100 - cur))); loadedAt = 0; await ctx.reload(); return true; }
    catch (e) { rpFail = true; SaveCtl.failed(); $('#m-rp-st', box).innerHTML = '<span class="neg">השמירה נכשלה — נסה שוב. ' + esc(e.network ? 'אין קליטה.' : e.message) + '</span>'; if (!e.network) opId = null; if (e.status === 409) ctx.reload(); return false; }
  };
  const later = () => { clearTimeout(timer); SaveCtl.dirty(); timer = setTimeout(() => { timer = null; persist(); }, 700); };
  let rpFail = false;
  SaveCtl.register('morning-rp', { isDirty: () => !!timer || rpFail || cur !== mRp(ctx.a), save: async () => { clearTimeout(timer); timer = null; if (cur === mRp(ctx.a)) return true; return persist(); }, discard: () => { clearTimeout(timer); timer = null; } });
  const set = (v, skip) => { const rp = mRp({ rp: v }); cur = rp; renderR(skip); later(); };
  const typed = v => { v = String(v || '').trim().replace(',', '.'); if (!/^\d{1,3}(\.\d{0,2})?$/.test(v)) return null; const n = parseFloat(v); return isFinite(n) && n >= 0 && n <= 100 ? n : null; };
  $('#m-rp-range', box).oninput = (e) => { cur = mRp({ rp: +e.target.value }); renderR('range'); };
  $('#m-rp-range', box).onchange = (e) => set(+e.target.value, 'range');
  $('#m-rp-in', box).oninput = (e) => { const n = typed(e.target.value); if (n !== null) set(n, 'rp'); };
  $('#m-lp-in', box).oninput = (e) => { const n = typed(e.target.value); if (n !== null) set(r2(100 - n), 'lp'); };
  ['m-rp-in', 'm-lp-in'].forEach(id => $('#' + id, box).onblur = () => renderR());
  $('#m-rp-reset', box).onclick = () => { set(25); toast('החלוקה הוחזרה ל-75/25'); };
  amt();
});

// ====================== מסך ״היום״: התראות (מלוח הבקרה) ======================
todayPanel((d, A) => {
  if (!fin(A)) return '';
  const date = d.date;
  setTimeout(async () => {
    const el = document.getElementById('rep-today-alerts'); if (!el) return;
    try {
      await loadAll(); hookLive();
      const ws = S.s.list.filter(a => a.kind === 'work' && a.date === date).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
      const pd = progData(ws.length ? ws[ws.length - 1].entries || [] : []);
      const al = alertsOf(date, pd, pendingOps().length);
      const box = document.getElementById('rep-today-alerts'); if (!box) return;
      box.innerHTML = '<div class="row sp"><h2>התראות</h2><a class="btn plain sm" href="#/dashboard">ללוח הבקרה</a></div><div class="alerts">' + alertsHTML(al) + '</div>';
    } catch (e) { el.innerHTML = '<div class="note err">' + esc(e.message) + '</div>'; }
  }, 0);
  return '<div class="card rep-alerts" id="rep-today-alerts"><div class="muted small">טוען התראות…</div></div>';
});

// ====================== קיצורי מקלדת (מחשב) — app.html 6492-6502 ======================
// Ctrl/⌘+S שומר את מסך העריכה הפתוח (אותו כפתור ״שמור״); Alt+1–9 עובר בין מסכים
const TABS = ['#/dashboard', '#/today', '#/accounts', '#/clients', '#/analytics', '#/saved', '#/loans', '#/contracts', '#/requests', '#/more'];
document.addEventListener('keydown', (e) => {
  if (!App.me) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
    const b = document.getElementById('ed-save'); if (!b) return;
    e.preventDefault(); if (!b.disabled) b.click(); else toast('כבר נשמר');
    return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[0-9]$/.test(e.code)) {
    const dg = +e.code.slice(5); const h = TABS[dg === 0 ? 9 : dg - 1];
    if (!fin(App) && !['#/today', '#/accounts', '#/clients', '#/more'].includes(h)) return;
    e.preventDefault(); location.hash = h;
  }
});
