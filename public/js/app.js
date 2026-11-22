// יומן חשבון בוקר — ממשק ראשי
import { SaveCtl, unwatchHeader } from './savectl.js';
import { get, save, onNet, retryPending, pendingOps, uid } from './api.js';
import { $, $$, esc, fmt, money, dmy, weekday, todayISO, when, toast, openSheet, viewState, ICON } from './ui.js';
import { fmtPhone } from './phone.js';
import { renderAccounts, renderAccount, renderNew } from './acc.js';
import { renderWa, renderBatch } from './wa-ui.js';
import { R } from './registry.js';
import './features/index.js';

export const App = { me: null, can: {}, route: '', live: null };

// ---- ניווט ----
const NAV = () => [
  ['#/today', 'היום', ICON.today],
  ['#/accounts', 'חשבונות', ICON.acc],
  ['#/clients', 'לקוחות', ICON.clients],
  ...(App.can.send ? [['#/wa', 'וואטסאפ', ICON.wa]] : []),
  ['#/more', 'עוד', ICON.more],
];
function drawNav() {
  const cur = '#/' + (location.hash.split('/')[1] || 'today').split('?')[0];
  const items = NAV().map(([h, t, i]) => `<a href="${h}" ${cur === h || (h === '#/accounts' && cur === '#/acc') || (h === '#/wa' && cur === '#/batch') ? 'aria-current="page"' : ''}>${i}<span>${t}</span></a>`).join('');
  $('#tabbar').innerHTML = items;
  $('#side').innerHTML = `<div class="row" style="padding:8px 10px 12px"><div class="seal" style="width:40px;height:40px;font-size:18px">₪</div><b>יומן חשבון בוקר</b></div>` + items +
    `<div class="who">${esc(App.me.name)} · ${esc(App.me.roleName)}${App.me.collector_name ? ' (' + esc(App.me.collector_name) + ')' : ''}<br><a href="#" data-logout>יציאה</a></div>`;
}

const routes = {
  login: renderLogin, today: renderToday, accounts: renderAccounts, acc: renderAccount, new: renderNew,
  clients: renderClients, client: renderClient, wa: renderWa, batch: renderBatch, more: renderMore,
  migration: renderMigration, users: renderUsers, audit: renderAudit,
};
let leaving = null;
export async function go() {
  const h = location.hash || '#/today';
  const [pathPart, qs] = h.slice(2).split('?');
  const [name, ...rest] = pathPart.split('/');
  const rname = name || 'today';
  if (App.route && h !== App.route && !SaveCtl.guard(h, App.route)) return; // יש שינויים שטרם נשמרו — שואלים לפני מעבר
  SaveCtl.reset(); unwatchHeader();
  if (leaving) { try { leaving(); } catch { /* */ } leaving = null; }
  // שמירת מיקום הגלילה של המסך הקודם
  if (App.route) viewState.set(App.route, { scroll: window.scrollY });
  if (rname !== 'login' && !App.me) {
    try { const m = await get('/api/me'); App.me = m.user; App.can = m.can; startLive(); } catch { return; }
  }
  App.route = h;
  if (App.me) drawNav();
  const fn = routes[rname] || R.routes[rname] || renderToday;
  const view = $('#view');
  try {
    const out = await fn(view, rest.map(decodeURIComponent), new URLSearchParams(qs || ''));
    if (typeof out === 'function') leaving = out;
    const sc = viewState.get(h).scroll; window.scrollTo(0, sc || 0);
  } catch (e) {
    if (e.status === 401) return;
    view.innerHTML = `<div class="band"><div class="grow"><h1>שגיאה</h1></div></div><div class="note err">${esc(e.message)}</div><button class="btn" data-act="reload">נסה שוב</button>`;
  }
}
window.addEventListener('hashchange', go);
document.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]');
  if (act) { const a = act.dataset.act; if (a === 'back') history.back(); else if (a === 'print') print(); else if (a === 'reload') location.reload(); else if (a === 'hidep') act.parentNode.hidden = true; return; }
  if (e.target.closest('[data-logout]')) { e.preventDefault(); await save('POST', '/api/logout', {}, { queue: false }).catch(() => {}); App.me = null; location.hash = '#/login'; }
});

// ---- עדכונים חיים בין מכשירים ----
const liveHandlers = new Set();
export const onLive = (fn) => { liveHandlers.add(fn); return () => liveHandlers.delete(fn); };
function startLive() {
  if (App.live) return;
  try { App.live = new EventSource('/api/events'); App.live.onmessage = (m) => { try { const e = JSON.parse(m.data); liveHandlers.forEach(f => f(e)); } catch { /* */ } }; } catch { /* */ }
}

// ---- פס מצב שמירה/קליטה ----
function drawNet(s) {
  const n = $('#net'); const p = pendingOps();
  if (s && s.failed || p.length) {
    n.className = 'net err'; n.hidden = false;
    n.innerHTML = `<span>⚠ ${p.length ? p.length + ' פעולות לא נשמרו' : 'הפעולה לא נשמרה'} — ${esc((s && s.error) || 'בעיית קליטה')}. שום דבר לא נרשם פעמיים.</span><button class="btn sm" id="net-retry">נסה שוב</button>`;
    $('#net-retry').onclick = async () => { n.className = 'net warn'; n.firstChild.textContent = 'מנסה שוב…'; const r = await retryPending(); if (!r.fail) { toast('נשמר ✓'); go(); } };
  } else if (s && s.conflict && s.conflict.length) {
    n.className = 'net warn'; n.hidden = false; n.innerHTML = `<span>${esc(s.conflict.join(' · '))}</span><button class="btn sm plain" data-act="hidep">סגור</button>`;
  } else n.hidden = true;
}
onNet(drawNet);
window.addEventListener('offline', () => { const n = $('#net'); n.className = 'net warn'; n.hidden = false; n.innerHTML = '<span>אין חיבור לאינטרנט. מה שתשמור עכשיו יישלח כשהקליטה תחזור.</span>'; });
window.addEventListener('online', () => drawNet());

// ---- כניסה ----
async function renderLogin(view) {
  $('#tabbar').innerHTML = ''; $('#side').innerHTML = '';
  view.innerHTML = `<div class="login"><div class="card"><div class="row" style="margin-bottom:14px"><div class="seal">₪</div><div><div class="muted small">ברוכים הבאים</div><h1 style="font-size:22px">יומן חשבון בוקר</h1></div></div>
  <form id="lf" class="grid" style="grid-template-columns:1fr"><label class="f">שם משתמש<input class="in" name="u" autocomplete="username" autocapitalize="off" required></label>
  <label class="f">סיסמה<input class="in" name="p" type="password" autocomplete="current-password" required></label>
  <div id="lerr"></div><button class="btn xl">כניסה</button></form></div></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { const r = await save('POST', '/api/login', { username: f.u.value, password: f.p.value }, { queue: false }); App.me = null; location.hash = '#/today'; }
    catch (er) { $('#lerr').innerHTML = `<div class="note err">${esc(er.message)}</div>`; }
  };
}

// ---- מסך ״היום״ ----
async function renderToday(view, args, q) {
  const vs = viewState.get('today');
  const date = q.get('date') || vs.date || todayISO();
  viewState.set('today', { date });
  const d = await get('/api/today?date=' + date);
  const filt = vs.kpi || 'pending';
  const groupsHtml = d.groups.map(w => (w.groups || []).length ? `<div class="card"><h2>${esc(w.title)}</h2><div class="tbl-wrap"><table><thead><tr><th>גובה</th><th class="a">לקוחות</th><th class="a">צפוי (ברוטו)</th><th class="a">נגבה</th><th class="a">נשאר</th>${App.can.finance ? '<th class="a">הוצאות</th><th class="a">נטו</th>' : ''}</tr></thead><tbody>
    ${w.groups.map(g => `<tr><td><b>${esc(g.name)}</b></td><td class="a">${g.count}</td><td class="a">${money(g.total)}</td><td class="a">${money(g.got)}</td><td class="a">${money(g.left)}</td>${App.can.finance ? `<td class="a">${money(g.exp)}</td><td class="a"><b>${money(g.net)}</b></td>` : ''}</tr>`).join('')}
    </tbody></table></div>${App.can.finance ? '<p class="small muted">נטו = צפוי פחות הוצאות, כמו בתוכנה המקורית.</p>' : ''}</div>` : '').join('');
  const sel = { all: d.items, got: d.items.filter(i => i.s === 'נאסף'), left: d.items.filter(i => i.s !== 'נאסף'), pending: d.pending }[filt] || d.pending;
  const title = { all: 'כל האיסופים שמרכיבים את הצפוי', got: 'האיסופים שנגבו', left: 'מה שנשאר לגבות', pending: 'ממתינים לאיסוף' }[filt];
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">${esc(weekday(date))}</div><h1>היום · ${dmy(date)}</h1></div>
    <input type="date" class="in" id="tdate" value="${date}" style="max-width:170px;background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)"></div>
    ${!d.works.length ? `<div class="empty">אין רשימת איסוף ליום הזה.${App.can.finance ? ` <a href="#/new/work?date=${date}">פתח איסוף יום</a>` : ''}</div>` : ''}
    <div class="kpis">
      <button class="kpi" data-k="all" aria-pressed="${filt === 'all'}"><div class="l">צפוי להיגבות</div><div class="v">${money(d.expected)}</div><div class="s">${d.items.length} איסופים</div></button>
      <button class="kpi good" data-k="got" aria-pressed="${filt === 'got'}"><div class="l">נגבה בפועל</div><div class="v">${money(d.got)}</div><div class="s">${d.items.filter(i => i.s === 'נאסף').length} נאספו</div></button>
      <button class="kpi bad" data-k="left" aria-pressed="${filt === 'left'}"><div class="l">נשאר לגבות</div><div class="v">${money(d.left)}</div><div class="s">${d.items.filter(i => i.s !== 'נאסף').length} פתוחים</div></button>
      <button class="kpi" data-k="pending" aria-pressed="${filt === 'pending'}"><div class="l">ממתינים לאיסוף</div><div class="v">${d.pending.length}</div><div class="s">${money(d.pending.reduce((t, i) => t + i.a, 0))}</div></button>
    </div>
    <div class="card"><div class="row sp"><h2>${title}</h2><span class="muted small">לחיצה על סכום למעלה מציגה את הרשומות שלו</span></div>
      ${sel.length ? `<div class="list">${sel.map(i => todayRow(i)).join('')}</div>` : '<div class="empty">אין רשומות</div>'}</div>
    ${groupsHtml}
    ${d.works.map(w => `<a class="btn ghost" href="#/acc/${w.id}">פתח את ${esc(w.title)}</a> `).join('')}
    ${d.splits.map(w => `<a class="btn ghost" href="#/acc/${w.id}">פתח את ${esc(w.title)}</a> `).join('')}
    ${d.morning.map(w => `<a class="btn ghost" href="#/acc/${w.id}">${esc(w.title)} · קרן סופית ${money(w.final)}</a> `).join('')}
    ${R.todayPanels.map(f => { try { return f(d, App) || ''; } catch (e) { return ''; } }).join('')}`;
  $('#tdate').onchange = (e) => { viewState.set('today', { date: e.target.value }); location.hash = '#/today?date=' + e.target.value; };
  $$('.kpi', view).forEach(b => b.onclick = () => { viewState.set('today', { kpi: b.dataset.k }); renderToday(view, args, q); });
  $$('[data-mark]', view).forEach(b => b.onclick = async () => {
    const [acc, key, s] = b.dataset.mark.split('|');
    b.disabled = true;
    try { await save('POST', `/api/accounts/${acc}/mark`, { key, s }, { label: 'סימון איסוף' }); toast(s ? 'סומן: ' + s : 'הסימון בוטל'); renderToday(view, args, q); }
    catch (e) { toast(e.network ? 'לא נשמר — בעיית קליטה. לחץ ״נסה שוב״ למעלה' : e.message); b.disabled = false; }
  });
  return onLive((e) => { if (e.col === 'accounts' && d.works.some(w => w.id === e.id) && !document.querySelector('#sheet:not([hidden])')) renderToday(view, args, q); });
}
function todayRow(i) {
  const courier = i.by && i.by !== '@' ? `<span>גובה אחראי: <b>${esc(i.c)}</b> · אסף בפועל: <b>${esc(i.by)}</b></span>` : (i.c ? `<span>גובה: ${esc(i.c)}</span>` : '');
  return `<div class="li noc ${i.s === 'נאסף' ? 'got' : ''}"><div class="t">${i.t ? `<span class="num">${esc(i.t)}</span> · ` : ''}${esc(i.n)} ${i.s ? `<span class="pill ${i.s === 'נאסף' ? 'ok' : i.s === 'לא נאסף' ? 'err' : 'warn'}">${esc(i.s)}</span>` : ''}${i.h === 'קשה' ? ' <span class="pill err">קשה</span>' : ''}</div>
  <div class="a">${money(i.a)}${i.s === 'נאסף' && i.got !== i.a ? `<div class="small muted">נגבה ${money(i.got)}</div>` : ''}</div>
  <div class="m">${courier}${i.p ? `<a href="tel:${esc(i.p)}">${esc(fmtPhone(i.p))}</a>` : ''}</div>
  <div class="st">${['נאסף', 'לא נאסף', 'לעבור', 'לא ענו'].map(s => `<button data-s="${s}" aria-pressed="${i.s === s}" data-mark="${i.acc}|${i.key}|${i.s === s ? '' : s}">${s}</button>`).join('')}</div></div>`;
}

// ---- לקוחות: חיפוש לפי שם, טלפון, גובה, שליח ותאריך ----
async function renderClients(view) {
  const vs = viewState.get('clients');
  const colls = await get('/api/collectors');
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">חיפוש</div><h1>לקוחות</h1></div></div>
  <div class="search"><input class="in" id="cq" type="search" placeholder="שם, טלפון או גובה…" value="${esc(vs.q || '')}" autocomplete="off"></div>
  <details ${vs.adv ? 'open' : ''} id="adv" class="card"><summary>סינון לפי גובה, שליח ותאריך</summary><div class="grid" style="margin-top:8px">
    <label class="f">גובה<select class="in" id="cc"><option value="">הכול</option>${colls.map(c => `<option ${vs.c === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="f">שליח (אסף בפועל)<input class="in" id="ck" value="${esc(vs.k || '')}"></label>
    <label class="f">מתאריך<input class="in" type="date" id="cf" value="${esc(vs.f || '')}"></label>
    <label class="f">עד תאריך<input class="in" type="date" id="ct" value="${esc(vs.t || '')}"></label></div></details>
  <div id="cres"></div>`;
  let timer;
  const run = async () => {
    const st = { q: $('#cq').value, c: $('#cc').value, k: $('#ck').value, f: $('#cf').value, t: $('#ct').value, adv: $('#adv').open };
    viewState.set('clients', st);
    const p = new URLSearchParams({ q: st.q, collector: st.c, courier: st.k, from: st.f, to: st.t });
    const res = await get('/api/search?' + p);
    $('#cres').innerHTML = res.length ? `<div class="muted small" style="margin:4px 2px">${res.length} לקוחות</div><div class="list">${res.map(c => `<a class="li noc link" href="#/client/${encodeURIComponent(c.key)}" style="text-decoration:none;color:inherit"><div class="t">${esc(c.name)} ${c.sharedPhone ? '<span class="pill warn">מספר משותף</span>' : ''}</div><div class="a small muted">${dmy(c.last)}</div><div class="m"><span>${c.phones.map(fmtPhone).map(esc).join(', ') || 'אין טלפון'}</span><span>${esc(c.collectors.join(', '))}</span><span>${c.count} רשומות</span></div></a>`).join('')}</div>` : '<div class="empty">לא נמצאו לקוחות</div>';
    const sc = viewState.get('#/clients').scroll; if (sc) { window.scrollTo(0, sc); viewState.set('#/clients', { scroll: 0 }); }
  };
  ['cq', 'ck'].forEach(id => $('#' + id).oninput = () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  ['cc', 'cf', 'ct'].forEach(id => $('#' + id).onchange = run);
  $('#adv').ontoggle = () => viewState.set('clients', { adv: $('#adv').open });
  await run();
  if (!vs.q) $('#cq').focus({ preventScroll: true });
}

async function renderClient(view, [key]) {
  const c = await get('/api/clients/' + encodeURIComponent(key));
  const kinds = { morning: 'חשבון בוקר', split: 'פיצול', collectors: 'חשבון גובים', work: 'איסוף יום', loan: 'הלוואה', loan_request: 'בקשה', contract: 'חוזה', client: 'כרטיס' };
  const link = (r) => ['morning', 'split', 'collectors', 'work'].includes(r.kind) ? `#/acc/${r.acc}?hl=${encodeURIComponent(r.key || '')}` : r.kind === 'loan' ? '#/loans/' + r.acc : r.kind === 'loan_request' ? '#/requests' : r.kind === 'contract' ? '#/contracts-manage/view/' + encodeURIComponent(r.acc) : r.kind === 'client' ? '#/clients-db/' + r.acc : '';
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">כרטיס לקוח</div><h1>${esc(c.name)}</h1></div><button class="btn sm" data-act="back">חזרה</button></div>
  <div class="card"><dl class="kv"><dt>טלפון</dt><dd>${c.phones.map(p => `<a href="tel:+${p}">${esc(fmtPhone(p))}</a>`).join(', ') || 'אין'}</dd><dt>גובים</dt><dd>${esc(c.collectors.join(', ') || '—')}</dd>
  ${c.balance ? `<dt>יתרה בפיצול האחרון</dt><dd>${money(c.balance.amount)} <span class="muted small">(${dmy(c.balance.date)})</span></dd>` : ''}
  ${c.totals ? `<dt>ריבית ששילם (בוקר)</dt><dd>${money(c.totals.interest)}</dd><dt>קרן ששילם (בוקר)</dt><dd>${money(c.totals.principal)}</dd><dt>נגבה באיסופים</dt><dd>${money(c.totals.workGot)} מתוך ${money(c.totals.work)}</dd>` : ''}
  ${c.consent.length ? `<dt>וואטסאפ</dt><dd>${c.consent.map(x => x.status === 'opt_out' ? '<span class="pill err">ביקש הסרה</span>' : '<span class="pill ok">הסכים לקבל הודעות</span>').join(' ')}</dd>` : ''}</dl>
  ${c.samePhone.length ? `<div class="note warn">אותו מספר משויך גם ל: ${c.samePhone.map(s => `<a href="#/client/${encodeURIComponent(s.key)}">${esc(s.name)}</a>`).join(', ')}. שליחת וואטסאפ למספר הזה תיעצר עד שתאשר את השיוך.</div>` : ''}</div>
  ${(c.loans || []).length ? `<div class="card"><h2>הלוואות (${c.loans.length})</h2><div class="list">${c.loans.map(l => `<a class="li noc link" href="#/loans/${encodeURIComponent(l.id)}" style="text-decoration:none;color:inherit"><div class="t">${esc(l.name)} <span class="pill ${l.cls === 'ok' ? 'ok' : l.cls === 'err' || l.cls === 'bad' ? 'err' : 'acc'}">${esc(l.status)}</span></div><div class="a">${money(l.remain)}<div class="small muted">יתרת קרן</div></div><div class="m"><span>ניתנה ${dmy(l.date)}</span><span>סכום ${money(l.amount)}</span>${l.paidSum ? `<span>שולם ${money(l.paidSum)}</span>` : ''}${l.lateAmt ? `<span class="neg">בפיגור ${money(l.lateAmt)}</span>` : ''}${l.next && !l.closed ? `<span>התשלום הבא ${dmy(l.next.date)} · ${money(l.next.payment)}</span>` : ''}</div></a>`).join('')}</div></div>` : ''}
  ${(c.contracts || []).length ? `<div class="card"><h2>חוזים (${c.contracts.length})</h2><div class="list">${c.contracts.map(k => `<div class="li noc"><div class="t"><a href="#/contracts-manage/view/${encodeURIComponent(k.id)}">${esc(k.title || 'חוזה')}</a> <span class="pill ${k.status === 'signed' ? 'ok' : k.status === 'sent' ? 'acc' : 'warn'}">${esc(k.statusName)}</span></div><div class="a">${k.amount ? money(k.amount) : ''}</div><div class="m">${k.date ? `<span>${dmy(k.date)}</span>` : ''}${k.signedAt ? `<span>נחתם ${dmy(String(k.signedAt).slice(0, 10))}</span>` : k.sentAt ? `<span>נשלח ${dmy(String(k.sentAt).slice(0, 10))}</span>` : ''}<a class="btn ghost sm" href="#/contracts-manage/view/${encodeURIComponent(k.id)}">פתח את החוזה</a>${App.can.sensitive ? k.files.map(f => `<a class="btn plain sm" target="_blank" rel="noopener" href="/api/files/${encodeURIComponent(f.id)}">${esc(FILE_NAMES[f.field] || f.name)}</a>`).join('') : ''}</div></div>`).join('')}</div></div>` : ''}
  <div class="card"><h2>היסטוריה (${c.rows.length})</h2><div class="list">${c.rows.map(r => `<a class="li noc ${link(r) ? 'link' : ''}" ${link(r) ? `href="${link(r)}"` : ''} style="text-decoration:none;color:inherit"><div class="t">${esc(r.what)} <span class="pill acc">${kinds[r.kind] || ''}</span></div><div class="a">${money(r.amount)}</div><div class="m"><span>${dmy(r.date)}</span>${r.c ? `<span>גובה אחראי: <b>${esc(r.c)}</b></span>` : ''}${collectedBy(r)}${r.t && !r.s ? `<span class="num">${esc(r.t)}</span>` : ''}${r.s ? `<span class="pill ${r.s === 'נאסף' ? 'ok' : r.s === 'לא נאסף' ? 'err' : 'warn'}">${esc(r.s)}</span>` : ''}${r.s === 'נאסף' && r.ga != null && r.ga !== '' && +r.ga !== +r.amount ? `<span>נגבה בפועל <b>${money(r.ga)}</b> מתוך ${money(r.amount)}</span>` : ''}${r.i ? `<span>ריבית ${money(r.i)}</span>` : ''}${r.p ? `<span>קרן ${money(r.p)}</span>` : ''}${r.note ? `<span>${esc(r.note)}</span>` : ''}</div></a>`).join('')}</div></div>
  ${c.msgs.length ? `<div class="card"><h2>הודעות וואטסאפ</h2><div class="list">${c.msgs.map(m => `<div class="li noc"><div class="t">${esc(m.template_name)}</div><div class="a">${statusPill(m.status)}</div><div class="m"><span>${when(m.updated_at)}</span>${m.error_text ? `<span class="neg">${esc(m.error_text)}</span>` : ''}</div></div>`).join('')}</div><p class="small muted">שליחת הודעה לא משנה יתרה. רק סימון ״נאסף״ ברשימת האיסוף משנה את הגבייה.</p></div>` : ''}`;
}
const FILE_NAMES = { pdf: 'החוזה החתום (PDF)', sig: 'החתימה', id1: 'ת.ז. צד קדמי', id2: 'ת.ז. צד אחורי' };
// מי אסף בפועל: שליח (by), הגובה עצמו (@), או — כשסומן ״נאסף״ בלי שליח — הגובה האחראי
const collectedBy = (r) => r.by === '@' ? '<span>אסף: הגובה עצמו</span>' : r.by ? `<span>אסף בפועל: <b>${esc(r.by)}</b></span>` : (r.s === 'נאסף' && r.c && r.kind === 'work' ? `<span>אסף: ${esc(r.c)}</span>` : '');
export const STATUS = { queued: ['ממתינה', ''], sending: ['בשליחה', 'acc'], sent: ['נשלחה', 'acc'], delivered: ['נמסרה', 'ok'], read: ['נקראה', 'ok'], failed: ['נכשלה', 'err'], unknown: ['לא ידוע', 'warn'], skipped: ['דולגה', 'warn'] };
export const statusPill = (s) => `<span class="pill ${STATUS[s]?.[1] || ''}">${STATUS[s]?.[0] || esc(s)}</span>`;

// ---- עוד ----
async function renderMore(view) {
  const L = [
    App.can.finance && ['#/migration', 'דוח התאמת נתונים וגיבוי'],
    App.can.finance && ['#/audit', 'יומן שינויים'], App.can.users && ['#/users', 'משתמשים והרשאות'],
    ...R.more.filter(m => !m.can || m.can(App)).sort((a, b) => (a.order || 50) - (b.order || 50)).map(m => [m.href, m.label]),
  ].filter(Boolean);
  view.innerHTML = `<div class="band"><div class="grow"><h1>עוד</h1></div></div><div class="list">${L.map(([h, t]) => `<a class="li noc link" href="${h}" style="text-decoration:none;color:inherit"><div class="t">${t}</div><div class="a">‹</div></a>`).join('')}</div>
  <div class="card" style="margin-top:12px"><h2>התקנה באייפון</h2><ol class="small" style="margin:0;padding-inline-start:20px"><li>פתח את הקישור בדפדפן Safari.</li><li>לחץ על כפתור השיתוף (ריבוע עם חץ למעלה).</li><li>בחר ״הוספה למסך הבית״ ואשר.</li></ol></div>
  <div class="card"><div class="row sp"><span>${esc(App.me.name)} · ${esc(App.me.roleName)}</span><button class="btn ghost sm" data-logout>יציאה</button></div></div>`;
}

async function renderLoans(view) {
  const L = await get('/api/loans');
  view.innerHTML = `<div class="band"><div class="grow"><h1>הלוואות</h1></div></div>${L.map(l => `<div class="card"><div class="row sp"><h2>${esc(l.name)}</h2><span class="pill ${l.sum?.cls === 'ok' ? 'ok' : l.sum?.cls === 'err' ? 'err' : 'acc'}">${esc(l.sum?.status || '')}</span></div>
    <dl class="kv"><dt>סכום</dt><dd>${money(l.amount)}</dd><dt>ריבית</dt><dd>${l.rate}% ל${l.type === 'week' ? 'שבוע' : 'חודש'}</dd><dt>תשלומים</dt><dd>${l.n} × ${money(l.sum?.pay)}</dd><dt>יתרת קרן</dt><dd>${money(l.sum?.remain)}</dd><dt>סה״כ להחזר</dt><dd>${money(l.sum?.totalPay)} (ריבית ${money(l.sum?.totalInt)})</dd></dl>
    <details><summary>לוח סילוקין</summary><div class="tbl-wrap"><table><thead><tr><th>#</th><th>תאריך</th><th class="a">תשלום</th><th class="a">ריבית</th><th class="a">קרן</th><th class="a">יתרה</th><th>שולם</th></tr></thead><tbody>${(l.sum?.rows || []).map(r => `<tr><td>${r.i}</td><td>${dmy(r.date)}</td><td class="a">${money(r.payment)}</td><td class="a">${money(r.interest)}</td><td class="a">${money(r.principal)}</td><td class="a">${money(r.close)}</td><td>${l.paid && l.paid[r.i] ? '✓ ' + dmy(l.paid[r.i]) : ''}</td></tr>`).join('')}</tbody></table></div></details></div>`).join('') || '<div class="empty">אין הלוואות</div>'}
    <p class="small muted">החישוב זהה ללוח הסילוקין שבתוכנה המקורית.</p>`;
}
async function renderRequests(view) {
  const L = await get('/api/loan_requests');
  view.innerHTML = `<div class="band"><div class="grow"><h1>בקשות להלוואה</h1></div></div><div class="list">${L.map(r => `<div class="li noc"><div class="t">${esc(r.name)}</div><div class="a">${money(r.amount)}</div><div class="m"><span>${dmy(r.date)}</span>${r.phone ? `<span>${esc(r.phone)}</span>` : ''}${r.note ? `<span>${esc(r.note)}</span>` : ''}</div></div>`).join('')}</div><p class="small muted">סה״כ ${money(L.reduce((t, r) => t + (+r.amount || 0), 0))}. רישום בלבד — לא נכנס לקרן ולגבייה.</p>`;
}
async function renderContracts(view) {
  const L = await get('/api/contracts');
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">מידע רגיש — בעלים ומנהל בלבד</div><h1>חוזים</h1></div></div>${L.map(c => `<div class="card"><div class="row sp"><h2>${esc(c.d?.o || c.d?.nm || '')}</h2>${c.status === 'signed' ? '<span class="pill ok">נחתם</span>' : '<span class="pill warn">נשלח, לא נחתם</span>'}</div>
  <dl class="kv"><dt>תאריך</dt><dd>${dmy(c.d?.t)}</dd>${c.d?.a ? `<dt>סכום</dt><dd>${money(c.d.a)}</dd>` : ''}${c.d?.p ? `<dt>רווח</dt><dd>${money(c.d.p)}</dd>` : ''}<dt>טלפון</dt><dd>${esc(c.d?.q || '')}</dd><dt>ת.ז.</dt><dd>${esc(c.d?.d || '')}</dd>${c.signedAt ? `<dt>נחתם</dt><dd>${when(Date.parse(c.signedAt))}</dd>` : ''}</dl>
  <div class="row" style="margin-top:8px">${c.files.map(f => `<a class="btn ghost sm" target="_blank" href="/api/files/${f.id}">${esc(f.name)}</a>`).join('')}</div>
  ${c.files.some(f => f.field === 'id1') && c.files.some(f => f.field === 'id2') ? '<p class="small muted">שים לב: צילום ת.ז. הקדמי והאחורי בחוזה הזה זהים (אותו קובץ במקור).</p>' : ''}</div>`).join('')}`;
}

// תא בטבלת ההשוואה: ערך אחד אם זהה, ״מקור → עכשיו״ אם שונה
const cmpCell = (b, a, isMoney = true) => { const f = (v) => isMoney ? money(v) : `<span class="num">${fmt(v)}</span>`; return Math.round(((+a || 0) - (+b || 0)) * 100) ? `<td class="a"><span class="muted small">${f(b)}</span><br><b class="neg">${f(a)}</b></td>` : `<td class="a">${f(a)}</td>`; };
const cmpStatus = (s) => s === 'ok' ? '<span class="pill ok">✓ תואם</span>' : s === 'edited' ? '<span class="pill warn">עודכן אחרי ההעברה</span>' : '<span class="pill err">לא תואם</span>';
function migrationCompareHtml(c) {
  if (!c) return '';
  const vs = viewState.get('migration'); const onlyDiff = vs.onlyDiff !== false;
  const dRows = c.dates.map(x => { const b = x.before, a = x.after; return `<tr data-st="${x.status}"><td>${dmy(x.date)}</td>${cmpCell(b.rows, a.rows, false)}${cmpCell(b.morning.keren, a.morning.keren)}${cmpCell(b.morning.final, a.morning.final)}${cmpCell(b.coll.gross, a.coll.gross)}${cmpCell(b.coll.exp, a.coll.exp)}${cmpCell(b.coll.net, a.coll.net)}${cmpCell(b.work.expected, a.work.expected)}${cmpCell(b.work.got, a.work.got)}${cmpCell(b.work.exp, a.work.exp)}${cmpCell(b.work.net, a.work.net)}${cmpCell(b.split.grand, a.split.grand)}${cmpCell(b.split.all, a.split.all)}<td>${cmpStatus(x.status)}</td></tr>`; }).join('');
  const cl = c.colls.filter(x => !onlyDiff || x.status !== 'ok');
  const cRows = cl.map(x => { const b = x.before, a = x.after; return `<tr data-st="${x.status}"><td>${dmy(x.date)}</td><td><b>${esc(x.c)}</b></td>${cmpCell(b.rows, a.rows, false)}${cmpCell(b.coll.gross, a.coll.gross)}${cmpCell(b.coll.exp, a.coll.exp)}${cmpCell(b.coll.net, a.coll.net)}${cmpCell(b.work.expected, a.work.expected)}${cmpCell(b.work.got, a.work.got)}${cmpCell(b.work.exp, a.work.exp)}${cmpCell(b.work.net, a.work.net)}${cmpCell(b.split.total, a.split.total)}<td>${cmpStatus(x.status)}</td></tr>`; }).join('');
  const D = c.duplicates; const inOne = D.sameDay.filter(x => x.accs.length === 1), inMany = D.sameDay.filter(x => x.accs.length > 1);
  const sdList = (l) => `<div class="list">${l.map(x => `<a class="li noc link" href="#/acc/${encodeURIComponent(x.accs[0])}?hl=${encodeURIComponent(x.rows[0].key || '')}" style="text-decoration:none;color:inherit"><div class="t">${esc(x.name)} <span class="pill acc">${esc(x.kindName)}</span></div><div class="a">${money(x.amount)} × ${x.count}</div><div class="m"><span>${dmy(x.date)}</span>${[...new Set(x.rows.map(r => r.c).filter(Boolean))].map(v => `<span>גובה: ${esc(v)}</span>`).join('')}${x.accs.length > 1 ? `<span>ב-${x.accs.length} חשבונות שמורים של אותו יום</span>` : ''}</div></a>`).join('') || '<div class="empty">אין</div>'}</div>`;
  return `<div class="card" id="mig-dates"><h2>השוואה לפי תאריך</h2>
    <p class="small muted">לכל תאריך: המקור (${c.baseline.kind === 'file' ? 'קובץ הגיבוי שיובא ' + when(c.baseline.at) : 'המצב כפי שיובא, משוחזר מיומן השינויים'}) מול האפליקציה עכשיו, מחושב באותן נוסחאות. כשיש הפרש מוצג הערך מהמקור (אפור) ומתחתיו הערך עכשיו. ״עודכן אחרי ההעברה״ = באותו יום יש חשבון שנערך, נמחק או נוסף באפליקציה החדשה — זה צפוי. ״לא תואם״ = הפרש בלי שום עריכה, צריך בדיקה.</p>
    <div class="kpis"><div class="kpi good"><div class="l">תואמים</div><div class="v">${c.counts.ok}</div></div><div class="kpi"><div class="l">עודכנו אחרי ההעברה</div><div class="v">${c.counts.edited}</div></div><div class="kpi bad"><div class="l">לא תואמים</div><div class="v" id="mig-mismatch">${c.counts.mismatch}</div></div></div>
    <div class="tbl-wrap"><table class="small"><thead><tr><th>תאריך</th><th class="a">שורות</th><th class="a">קרן קיימת</th><th class="a">קרן סופית</th><th class="a">גובים ברוטו</th><th class="a">גובים הוצאות</th><th class="a">גובים נטו</th><th class="a">איסוף צפוי</th><th class="a">נגבה</th><th class="a">הוצאות איסוף</th><th class="a">נטו איסוף</th><th class="a">פיצול (גובים)</th><th class="a">פיצול (הכול)</th><th>מצב</th></tr></thead><tbody>${dRows}</tbody></table></div></div>
  <div class="card" id="mig-colls"><div class="row sp"><h2>השוואה לפי גובה</h2><label class="row small"><input type="checkbox" id="mig-only" class="ck" ${onlyDiff ? 'checked' : ''}> רק שורות עם הפרש</label></div>
    <p class="small muted">${c.colls.length} שילובים של תאריך וגובה · ${c.counts.collMismatch} לא תואמים.</p>
    ${cl.length ? `<div class="tbl-wrap"><table class="small"><thead><tr><th>תאריך</th><th>גובה</th><th class="a">שורות</th><th class="a">גובים ברוטו</th><th class="a">גובים הוצאות</th><th class="a">גובים נטו</th><th class="a">איסוף צפוי</th><th class="a">נגבה</th><th class="a">הוצאות</th><th class="a">נטו</th><th class="a">פיצול</th><th>מצב</th></tr></thead><tbody>${cRows}</tbody></table></div>` : '<div class="note ok">✓ אין הפרשים לפי גובה.</div>'}</div>
  <div class="card" id="mig-dups"><h2>לבדיקה — כפילויות אפשריות</h2><p class="small muted">דוח בלבד. שום דבר לא מאוחד ולא נמחק אוטומטית. לחיצה פותחת את הכרטיס או את החשבון.</p>
    <details><summary>אותו לקוח עם כמה מספרי טלפון (${D.namePhones.length})</summary><div class="list">${D.namePhones.map(x => `<a class="li noc link" href="#/client/${encodeURIComponent(x.key)}" style="text-decoration:none;color:inherit"><div class="t">${esc(x.name)}</div><div class="m">${x.phones.map(p => `<span>${esc(fmtPhone(p))}</span>`).join('')}</div></a>`).join('') || '<div class="empty">אין</div>'}</div></details>
    <details><summary>אותו טלפון עם כמה שמות (${D.phoneNames.length})</summary><div class="list">${D.phoneNames.map(x => `<div class="li noc"><div class="t">${esc(fmtPhone(x.phone))}</div><div class="m">${x.names.map(n => `<a href="#/client/${encodeURIComponent(n.key)}">${esc(n.name)}</a>`).join(' · ')}</div></div>`).join('') || '<div class="empty">אין</div>'}</div></details>
    <details><summary>אותו שם ואותו סכום פעמיים באותו חשבון (${inOne.length})</summary>${sdList(inOne)}</details>
    <details><summary>אותו שם ואותו סכום באותו יום בשני חשבונות שמורים (${inMany.length})</summary>${sdList(inMany)}</details></div>`;
}

async function renderMigration(view) {
  const [d, cmp] = await Promise.all([get('/api/migration'), get('/api/migration/compare').catch(() => null)]);
  const run = d.runs[0]; const rep = run?.report; const rc = rep?.reconcile;
  const tbl = (sec) => `<div class="tbl-wrap"><table><thead><tr><th>מה</th><th class="a">לפני (במקור)</th><th class="a">אחרי (באפליקציה)</th><th class="a">הפרש</th></tr></thead><tbody>${Object.keys(rc.before[sec]).map(k => { const b = rc.before[sec][k], a = rc.after[sec][k]; const df = Math.round(((+a || 0) - (+b || 0)) * 100) / 100; return `<tr><td>${esc(k)}</td><td class="a">${sec === 'sums' ? money(b) : `<span class="num">${fmt(b)}</span>`}</td><td class="a">${sec === 'sums' ? money(a) : `<span class="num">${fmt(a)}</span>`}</td><td class="a">${df ? `<b class="neg">${fmt(df)}</b>` : '✓'}</td></tr>`; }).join('')}</tbody></table></div>`;
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">העברת נתונים</div><h1>דוח התאמה</h1></div></div>
  ${!rc ? '<div class="empty">עוד לא בוצע ייבוא</div>' : `
  <div class="note ${rc.ok ? 'ok' : 'err'}">${rc.ok ? '✓ כל הרשומות, הסכומים והקבצים תואמים בין המקור לאפליקציה.' : 'נמצאו הפרשים — פירוט למטה.'}</div>
  <div class="card"><dl class="kv"><dt>מקור</dt><dd>${esc(rep.source)}</dd><dt>זמן ייבוא</dt><dd>${when(run.at)}</dd><dt>טביעת קובץ</dt><dd class="num small">${esc(run.file_sha256.slice(0, 16))}…</dd><dt>ייבואים שבוצעו</dt><dd>${d.runs.length} ${d.runs.length > 1 ? '(ייבוא חוזר לא יצר כפילויות: ' + d.runs.slice(1).map(r => Object.values(r.report.cols).reduce((t, c) => t + c.added, 0)).join(', ') + ' רשומות חדשות)' : ''}</dd></dl></div>
  <div class="card"><h2>מספר רשומות</h2>${tbl('counts')}</div>
  <div class="card"><h2>סכומים (מחושבים באותן נוסחאות של התוכנה המקורית)</h2>${tbl('sums')}</div>
  <div class="card"><h2>קבצים מצורפים</h2><p>${rc.after.files.present} מתוך ${rc.after.files.referenced} קבצים שהחוזים מפנים אליהם נמצאים באפליקציה.</p>${rc.after.files.missing.length ? `<div class="note err">חסרים: ${rc.after.files.missing.map(m => esc(m.owner + ' · ' + m.field)).join(', ')}</div>` : ''}</div>
  <div class="card"><h2>שרשרת הקרן</h2><p class="small muted">בכל חשבון בוקר, ״קרן קיימת״ צריכה להיות שווה לקרן הסופית של החשבון הקודם — כך הקרן ההתחלתית נספרת פעם אחת בלבד.</p>
  <div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th class="a">קרן קיימת</th><th class="a">סופית בחשבון הקודם</th><th class="a">הפרש</th><th class="a">קרן סופית</th></tr></thead><tbody>${rc.after.chain.map(c => `<tr><td>${dmy(c.date)}</td><td class="a">${money(c.keren)}</td><td class="a">${c.prevFinal == null ? 'ראשון' : money(c.prevFinal)}</td><td class="a">${c.diff ? `<b class="neg">${fmt(c.diff)}</b>` : '✓'}</td><td class="a">${money(c.final)}</td></tr>`).join('')}</tbody></table></div></div>`}
  ${migrationCompareHtml(cmp)}
  ${App.me.role === 'owner' ? `<div class="card"><h2>גיבוי ושחזור</h2><div class="row"><a class="btn" href="/api/backup">הורד גיבוי מלא</a><a class="btn ghost" href="#/backups">גיבויים אוטומטיים ושחזור</a><label class="btn ghost">ייבוא קובץ גיבוי<input type="file" id="impf" accept=".json,application/json" hidden></label></div><div id="impr"></div><p class="small muted">ייבוא חוזר של אותו קובץ לא יוצר כפילויות. רשומה ששונתה כאן לא נדרסת — היא מדווחת לבדיקה.</p></div>` : ''}`;
  const mo = $('#mig-only'); if (mo) mo.onchange = () => { viewState.set('migration', { onlyDiff: mo.checked }); const y = window.scrollY; renderMigration(view).then(() => window.scrollTo(0, y)); };
  const f = $('#impf'); if (f) f.onchange = async () => {
    const file = f.files[0]; if (!file) return; $('#impr').innerHTML = '<div class="note info">מייבא…</div>';
    try {
      const r = await fetch('/api/backup/import', { method: 'POST', body: await file.text(), credentials: 'same-origin' }); const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      $('#impr').innerHTML = `<div class="note ${j.reconcile.ok ? 'ok' : 'warn'}">נוספו ${Object.values(j.cols).reduce((t, c) => t + c.added, 0)} · ללא שינוי ${Object.values(j.cols).reduce((t, c) => t + c.same, 0)} · התנגשויות ${j.conflicts.length}. ${j.reconcile.diffs.length ? 'הפרשים: ' + j.reconcile.diffs.map(x => esc(x.what)).join(', ') : ''}</div>`;
    } catch (e) { $('#impr').innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
  };
}

async function renderUsers(view) {
  const [U, colls] = await Promise.all([get('/api/users'), get('/api/collectors')]);
  view.innerHTML = `<div class="band"><div class="grow"><h1>משתמשים והרשאות</h1></div></div>
  <div class="card small"><b>בעלים</b> — הכול. <b>מנהל</b> — הכול חוץ ממשתמשים ושחזור גיבוי. <b>גובה</b> — רואה רק את האיסופים שלו (שם, טלפון, סכום, שעה וסטטוס) ויכול לסמן איסוף. לא רואה קרן, הלוואות, חוזים, תעודות זהות או נתונים של גובים אחרים.</div>
  <div class="list">${U.map(u => `<div class="li noc"><div class="t">${esc(u.name)} <span class="pill acc">${esc(u.roleName)}</span>${u.disabled ? ' <span class="pill err">חסום</span>' : ''}</div><div class="a"><button class="btn ghost sm" data-u="${u.id}" data-dis="${u.disabled ? 0 : 1}">${u.disabled ? 'הפעל' : 'חסום'}</button></div><div class="m"><span>${esc(u.username)}</span>${u.collector_name ? `<span>גובה: ${esc(u.collector_name)}</span>` : ''}</div></div>`).join('')}</div>
  <form class="card" id="nu" style="margin-top:12px"><h2>משתמש חדש</h2><div class="grid">
  <label class="f">שם תצוגה<input class="in" name="name" required></label><label class="f">שם משתמש<input class="in" name="username" autocapitalize="off" required></label>
  <label class="f">סיסמה (8+ תווים)<input class="in" name="password" type="password" minlength="8" required></label>
  <label class="f">תפקיד<select class="in" name="role"><option value="collector">גובה</option><option value="manager">מנהל</option><option value="owner">בעלים</option></select></label>
  <label class="f">שם הגובה בחשבונות<select class="in" name="collector_name"><option value="">—</option>${colls.map(c => `<option>${esc(c)}</option>`).join('')}</select></label></div>
  <div id="nuerr"></div><button class="btn" style="margin-top:10px">צור משתמש</button></form>`;
  $('#nu').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await save('POST', '/api/users', f, { queue: false }); toast('המשתמש נוצר'); renderUsers(view); } catch (er) { $('#nuerr').innerHTML = `<div class="note err">${esc(er.message)}</div>`; } };
  $$('[data-u]', view).forEach(b => b.onclick = async () => { try { await save('PATCH', '/api/users/' + b.dataset.u, { disabled: b.dataset.dis === '1' }, { queue: false }); renderUsers(view); } catch (e) { toast(e.message); } });
}
async function renderAudit(view) {
  const L = await get('/api/audit?limit=400');
  view.innerHTML = `<div class="band"><div class="grow"><h1>יומן שינויים</h1></div></div><div class="list">${L.map(a => `<div class="li noc"><div class="t">${esc(a.action)}${a.item ? ' · ' + esc(a.item) : ''}</div><div class="a small muted">${when(a.at)}</div><div class="m"><span>${esc(a.user_name || '')}</span>${a.note ? `<span>${esc(a.note)}</span>` : ''}${a.doc_id && a.col === 'accounts' ? `<a href="#/acc/${a.doc_id}">לחשבון</a>` : ''}</div></div>`).join('')}</div>`;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// עדכון אוטומטי: האפליקציה שמותקנת באייפון נשארת פתוחה ברקע ולא טוענת קוד חדש לבד.
// בכל חזרה לאפליקציה (וכל 5 דקות) בודקים אם יש גרסה חדשה בשרת. אם כן — מרעננים מיד, אלא אם באמצע עריכה / חלון פתוח, ואז מציגים פס ״יש גרסה חדשה — רענן״.
(() => {
  let mine = null;
  const busy = () => document.querySelector('#sheet:not([hidden])') || /[?&]edit=1/.test(location.hash) || document.activeElement?.matches?.('input,textarea,select');
  const check = async () => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' }); const j = await r.json(); if (!j.build) return;
      if (!mine) { mine = j.build; return; }
      if (j.build === mine) return;
      if (!busy()) { location.reload(); return; }
      if (document.getElementById('newver')) return;
      const b = document.createElement('button'); b.id = 'newver'; b.className = 'btn xl no-print'; b.textContent = 'יש גרסה חדשה של התוכנה — לחץ לרענון';
      b.style.cssText = 'position:fixed;inset-inline:12px;top:calc(8px + env(safe-area-inset-top));z-index:90;box-shadow:0 6px 20px rgba(0,0,0,.25)';
      b.onclick = () => location.reload(); document.body.appendChild(b);
    } catch { /* אין קליטה — ננסה שוב */ }
  };
  check(); setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  addEventListener('focus', check); addEventListener('pageshow', check);
})();
go();
