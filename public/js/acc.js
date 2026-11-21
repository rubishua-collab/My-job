// חשבונות: חשבון בוקר, פיצול, חשבון גובים, איסוף יום
import { get, save, uid } from './api.js';
import { $, $$, esc, fmt, money, dmy, weekday, todayISO, when, toast, openSheet, viewState } from './ui.js';
import { App, onLive } from './app.js';
import { calcMorning, calcCollectors, calcSplit, workGroups, calcWork, wExpList, normName, num, r2, sum, collKey, cleanColl, normStatus, CHANGE, NOC_SP } from './calc.js';
import { normPhone, phoneProblem, fmtPhone } from './phone.js';
import { openSendSheet } from './wa-ui.js';
import { openPrivate } from './features/wa-private.js';
import { R } from './registry.js';

const KINDS = { morning: 'חשבון בוקר', split: 'פיצול', collectors: 'חשבון גובים', work: 'איסוף יום' };

export async function renderAccounts(view) {
  const vs = viewState.get('accounts');
  const L = await get('/api/accounts');
  const kind = vs.kind || '';
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">${L.length} חשבונות שמורים</div><h1>חשבונות</h1></div>
    ${App.can.finance ? `<button class="btn sm" id="newacc">+ חשבון חדש</button>` : ''}</div>
    <div class="search"><input class="in" id="aq" type="search" placeholder="חיפוש לפי תאריך או כותרת…" value="${esc(vs.q || '')}"></div>
    <div class="chips" style="margin-bottom:10px">${[['', 'הכול'], ...Object.entries(KINDS)].map(([k, t]) => `<button class="chip" data-k="${k}" aria-pressed="${kind === k}">${t}</button>`).join('')}</div>
    <div id="alist"></div>`;
  const draw = () => {
    const q = $('#aq').value.trim(); const k = viewState.get('accounts').kind || '';
    const rows = L.filter(a => (!k || a.kind === k) && (!q || (a.title + ' ' + dmy(a.date) + ' ' + a.date).includes(q)));
    $('#alist').innerHTML = rows.length ? `<div class="list">${rows.map(a => `<a class="li noc link" href="#/acc/${a.id}" style="text-decoration:none;color:inherit"><div class="t">${esc(a.title || KINDS[a.kind])} <span class="pill ${a.kind === 'morning' ? 'acc' : a.kind === 'work' ? 'ok' : a.kind === 'collectors' ? 'warn' : ''}">${KINDS[a.kind]}</span></div>
      <div class="a">${a.headline ? money(a.headline.value) + `<div class="small muted">${esc(a.headline.label)}</div>` : ''}</div>
      <div class="m"><span>${esc(weekday(a.date))} ${dmy(a.date)}</span><span>${a.rows} שורות</span>${a.updatedBy && a.updatedBy !== 'ייבוא' ? `<span>עודכן ע״י ${esc(a.updatedBy)}</span>` : ''}</div></a>`).join('')}</div>` : '<div class="empty">לא נמצאו חשבונות</div>';
  };
  $('#aq').oninput = () => { viewState.set('accounts', { q: $('#aq').value }); draw(); };
  $$('.chip', view).forEach(b => b.onclick = () => { viewState.set('accounts', { kind: b.dataset.k }); $$('.chip', view).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
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
  location.replace(`#/acc/${r.id}?edit=1`);
}

// ---------- מסך חשבון ----------
export async function renderAccount(view, [id], q) {
  const a = await get('/api/accounts/' + id);
  const st = viewState.get('acc:' + id);
  const ctx = { a, id, view, q, sel: new Set(st.sel || []), filter: st.filter || '', coll: st.coll || '' };
  if (q.get('edit') === '1' && App.can.finance) return renderEditor(ctx);
  draw(ctx);
  const hl = q.get('hl'); if (hl) { const el = view.querySelector(`[data-key="${CSS.escape(hl)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '3px solid var(--gold)'; } }
  return onLive(async (e) => {
    if (e.col !== 'accounts' || e.id !== id || e.version === ctx.a._version) return;
    if (document.querySelector('#sheet:not([hidden])')) return;
    ctx.a = await get('/api/accounts/' + id); const y = window.scrollY; draw(ctx); window.scrollTo(0, y);
    toast('עודכן ממכשיר אחר' + (e.by ? ' (' + e.by + ')' : ''));
  });
}

function header(ctx, extra = '') {
  const a = ctx.a;
  return `<div class="band"><div class="grow"><div class="eyebrow">${KINDS[a.kind]} · ${esc(weekday(a.date))}</div><h1>${esc(a.title || KINDS[a.kind])}</h1>${a._updatedBy ? `<div class="small" style="color:var(--band-muted)">עודכן ${when(a._updatedAt)} ע״י ${esc(a._updatedBy)}</div>` : ''}</div>
  <div class="row no-print">${App.can.finance ? `<a class="btn sm" href="#/acc/${a.id}?edit=1">עריכה</a>` : ''}<button class="btn sm" data-act="print">הדפסה</button>${(R.accountActions[a.kind] || []).concat(R.accountActions['*'] || []).map((x, i) => (!x.can || x.can(App, a)) ? `<button class="btn sm" data-xact="${i}">${esc(x.label)}</button>` : '').join('')}${extra}</div></div>`;
}

// items לשליחה: {ref,name,phone,amount,time,collector,date}
function itemsOf(ctx) {
  const a = ctx.a;
  if (a.kind === 'split') return (a.records || []).filter(r => r.n || r.a).map(r => ({ ref: r._k, name: r.n, first: r.fn, phone: r.ph, amount: num(r.a), time: r.t || '', collector: r.c || '', date: dmy(a.date), side: !!r.side, h: r.h, note: r.note }));
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
  const { a, view } = ctx;
  const all = itemsOf(ctx); ctx.items = all;
  const vis = all.filter(it => matches(it, ctx.filter) && (!ctx.coll || collKey(it.collector) === collKey(ctx.coll)));
  ctx.visible = new Set(vis.map(v => v.ref));
  const colls = [...new Set(all.map(i => i.collector).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'he'));
  let body = '';
  if (a.kind === 'morning') body = morningView(ctx, vis);
  else if (a.kind === 'collectors') body = collectorsView(ctx, vis);
  else if (a.kind === 'split') body = splitView(ctx, vis);
  else if (a.kind === 'work') body = workView(ctx, vis);
  view.innerHTML = header(ctx) + `
  <div class="search no-print"><input class="in" id="fq" type="search" placeholder="סינון: שם, טלפון, גובה, שליח או שעה…" value="${esc(ctx.filter)}" autocomplete="off">
  ${colls.length > 1 ? `<div class="chips" style="margin-top:8px">${['', ...colls].map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${ctx.coll === c}">${c ? esc(c) : 'כל הגובים'}</button>`).join('')}</div>` : ''}</div>
  ${body}${(R.accountPanels[a.kind] || []).concat(R.accountPanels['*'] || []).map(f => { try { return f(ctx) || ''; } catch (e) { console.error(e); return ''; } }).join('')}${App.can.send ? actionBar(ctx, vis) : ''}`;
  bind(ctx); if (App.can.send && ctx.sel.size) exactCount(ctx);
}
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
  return `<div class="actionbar no-print"><div class="row sp"><label class="row" style="font-weight:700;cursor:pointer"><input type="checkbox" id="selall" class="ck" style="width:24px;height:24px" ${allVisSel ? 'checked' : ''}> בחר את כל תוצאות הסינון (${vis.length})</label>
    ${ctx.sel.size ? `<button class="btn plain sm" id="selnone">נקה בחירה (${ctx.sel.size} שורות)</button>` : ''}</div>
    <button class="btn wa ${ctx.sel.size ? 'xl' : ''}" id="sendpriv" ${ctx.sel.size ? '' : 'disabled'}>וואטסאפ פרטי · הכן הודעה אישית ל־${ctx.sel.size} שורות</button>
    <button class="btn ghost" id="sendwa" disabled>שלח בוואטסאפ ל־0 לקוחות</button><div id="sendinfo" class="small muted">הכפתור התחתון שולח דרך החשבון העסקי (יעבוד אחרי אישור Meta)</div></div>`;
}

function bind(ctx) {
  const { view } = ctx;
  ctx.reload = async () => { ctx.a = await get('/api/accounts/' + ctx.id); const y = window.scrollY; draw(ctx); window.scrollTo(0, y); };
  const acts = (R.accountActions[ctx.a.kind] || []).concat(R.accountActions['*'] || []);
  $$('[data-xact]', view).forEach(b => b.onclick = () => acts[+b.dataset.xact].run(ctx));
  (R.panelBinders[ctx.a.kind] || []).concat(R.panelBinders['*'] || []).forEach(f => { try { f(ctx); } catch (e) { console.error(e); } });
  const fq = $('#fq', view); let t;
  fq.oninput = () => { clearTimeout(t); t = setTimeout(() => { ctx.filter = fq.value; persist(ctx); const pos = fq.selectionStart; draw(ctx); const n = $('#fq', ctx.view); n.focus(); n.setSelectionRange(pos, pos); }, 180); };
  $$('[data-c]', view).forEach(b => b.onclick = () => { ctx.coll = b.dataset.c; persist(ctx); draw(ctx); });
  $$('input.ck[data-ref]', view).forEach(c => c.onchange = () => { c.checked ? ctx.sel.add(c.dataset.ref) : ctx.sel.delete(c.dataset.ref); persist(ctx); refreshBar(ctx); });
  bindBar(ctx);
  $$('[data-row]', view).forEach(el => el.onclick = (e) => { if (e.target.closest('input,button,a')) return; rowSheet(ctx, el.dataset.row); });
  $$('[data-mark]', view).forEach(b => b.onclick = () => quickMark(ctx, b));
}
function refreshBar(ctx) {
  const vis = ctx.items.filter(i => ctx.visible.has(i.ref));
  const bar = $('.actionbar', ctx.view); if (!bar) return;
  bar.outerHTML = actionBar(ctx, vis); bindBar(ctx); clearTimeout(ctx.ct); ctx.ct = setTimeout(() => exactCount(ctx), 250);
  $$('[data-ref]', ctx.view).forEach(c => { c.checked = ctx.sel.has(c.dataset.ref); c.closest('.li')?.classList.toggle('sel', c.checked); });
}
function bindBar(ctx) {
  const v = ctx.view;
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
  const c = calcSplit(a.records || []);
  const rec = (r) => `<div class="li ${ctx.sel.has(r._k) ? 'sel' : ''}" data-key="${esc(r._k)}">${ck(ctx, r._k)}<div class="t">${esc(r.n)} ${r.pp ? `<span class="pill acc">חלק ${esc(r.pp)}</span>` : ''}${r.h === 'קשה' ? ' <span class="pill err">קשה</span>' : ''}${r.na ? ' <span class="pill acc">לא ענו</span>' : ''}</div><div class="a">${money(num(r.a))}</div>
    <div class="m">${r.t ? `<span class="num">${esc(r.t)}</span>` : ''}${r.ph ? `<span>${esc(fmtPhone(r.ph))}</span>` : '<span class="neg">אין טלפון</span>'}${r.note ? `<span>${esc(r.note)}</span>` : ''}</div></div>`;
  const blocks = c.blocks.map(b => { const rows = b.sections.flatMap(s => s.rows.map(r => ({ r, s: s.t }))).filter(x => visSet.has(x.r._k)); if (!rows.length && (ctx.filter || ctx.coll)) return '';
    return `<div class="card"><div class="row sp"><h2>${esc(b.c === CHANGE ? 'לשנות במערכת' : b.c === NOC_SP ? 'ללא גובה (להשלים)' : b.c)}</h2><b>${money(b.total)}</b></div><div class="muted small">${b.count} לקוחות</div>
    <div class="list" style="margin-top:8px">${b.sections.map(s => { const rs = s.rows.filter(r => visSet.has(r._k)); return (s.t ? `<div class="grp"><span>${esc(s.t)}</span><span class="s">${money(s.total)}</span></div>` : '') + rs.map(rec).join(''); }).join('')}</div></div>`; }).join('');
  const sides = c.sides.filter(r => visSet.has(r._k));
  return `${blocks}${sides.length ? `<div class="card"><div class="row sp"><h2>לא נגבה היום</h2><b>${money(c.sideTotal)}</b></div><div class="list">${sides.map(rec).join('')}</div></div>` : ''}
  <div class="card"><h2>סיכום</h2><dl class="kv"><dt>סה״כ גובים</dt><dd>${money(c.grand)}</dd>${c.specialTotal ? `<dt>לשנות / ללא גובה</dt><dd>${money(c.specialTotal)}</dd>` : ''}${c.sideTotal ? `<dt>לא נגבה היום</dt><dd>${money(c.sideTotal)}</dd>` : ''}<dt>סה״כ הכול</dt><dd>${money(c.all)}</dd></dl>
  ${c.dups.length ? `<div class="note warn">אותו שם אצל כמה גובים: ${c.dups.map(d => esc(d.n) + ' (' + d.cs.map(esc).join(', ') + ')').join(' · ')}</div>` : ''}</div>`;
}

// ---------- איסוף יום ----------
function workView(ctx, vis) {
  const a = ctx.a; const visSet = new Set(vis.map(v => v.ref));
  const es = (a.entries || []).filter(e => e && (e.n || e.a));
  const groups = workGroups(es, wExpList(a)) || [{ name: '', calc: calcWork(es), exp: wExpList(a), expTotal: sum(wExpList(a).map(x => x.a)), net: r2(calcWork(es).total - sum(wExpList(a).map(x => x.a))) }];
  const byIdx = es; // calcWork מחזיר i = אינדקס בתוך הרשימה של הקבוצה
  const html = groups.map(g => {
    const list = g.name ? es.filter(e => (g.name === NOC_SP ? !collKey(cleanColl(e.c)) : collKey(cleanColl(e.c)) === collKey(g.name))) : es;
    const rows = g.calc.rows.map(r => list[r.i]).filter(e => e && visSet.has(e._k));
    if (!rows.length && (ctx.filter || ctx.coll)) return '';
    const netGot = r2(g.calc.gotTotal - g.expTotal);
    return `<div class="card"><div class="row sp"><h2>${esc(g.name || 'איסוף')}</h2><span class="muted small">${g.calc.count} לקוחות</span></div>
    <div class="grid" style="margin-bottom:8px"><div><div class="muted small">גבייה ברוטו (צפוי)</div><b>${money(g.calc.total)}</b></div><div><div class="muted small">נגבה בפועל</div><b>${money(g.calc.gotTotal)}</b></div><div><div class="muted small">נשאר</div><b>${money(g.calc.left)}</b></div>
    ${App.can.finance ? `<div><div class="muted small">הוצאות הגובה</div><b>${money(g.expTotal)}</b></div><div><div class="muted small">נטו אחרי הוצאות</div><b>${money(g.net)}</b></div><div title="תצוגה בלבד — לא משנה נוסחה"><div class="muted small">נגבה בפועל פחות הוצאות</div><b>${money(netGot)}</b></div>` : ''}</div>
    <div class="list">${rows.map(e => workRow(ctx, e, g.name)).join('')}</div>
    ${g.exp.length && App.can.finance ? `<details style="margin-top:8px"><summary>הוצאות (${g.exp.length}) · ${money(g.expTotal)}</summary><div class="list">${g.exp.map(x => `<div class="li noc"><div class="t">${esc(x.n)}</div><div class="a">${money(x.a)}</div></div>`).join('')}</div></details>` : ''}</div>`;
  }).join('');
  const all = calcWork(es); const ex = sum(wExpList(a).map(x => x.a));
  return `<div class="kpis"><div class="kpi"><div class="l">צפוי</div><div class="v">${money(all.total)}</div></div><div class="kpi good"><div class="l">נגבה</div><div class="v">${money(all.gotTotal)}</div></div><div class="kpi bad"><div class="l">נשאר</div><div class="v">${money(all.left)}</div></div>${App.can.finance ? `<div class="kpi"><div class="l">הוצאות</div><div class="v">${money(ex)}</div></div>` : ''}</div>
  ${html}${App.can.finance ? '<p class="small muted">״נטו אחרי הוצאות״ = גבייה ברוטו (צפוי) פחות הוצאות — הנוסחה של התוכנה המקורית. ״נגבה בפועל פחות הוצאות״ מוצג לידו לעיון בלבד; שינוי הנוסחה הראשית דורש את אישורך.</p>' : ''}
  <button class="btn ghost no-print" id="hist">היסטוריית סימונים ותיקונים</button>`;
}
function workRow(ctx, e, gname) {
  const s = normStatus(e.s);
  const courier = e.by && e.by !== '@' ? `<span>גובה אחראי: <b>${esc(cleanColl(e.c) || gname)}</b> · אסף בפועל: <b>${esc(e.by)}</b></span>` : (e.by === '@' ? `<span>נאסף ע״י הגובה</span>` : '');
  return `<div class="li ${s === 'נאסף' ? 'got' : ''} ${ctx.sel.has(e._k) ? 'sel' : ''} link" data-row="${esc(e._k)}" data-key="${esc(e._k)}">${ck(ctx, e._k)}
    <div class="t">${!s && e.t ? `<span class="num">${esc(e.t)}</span> · ` : ''}${esc(e.n)} ${s ? `<span class="pill ${s === 'נאסף' ? 'ok' : s === 'לא נאסף' ? 'err' : s === 'לא ענו' ? 'acc' : 'warn'}">${esc(s)}</span>` : ''}${e.h === 'קשה' ? ' <span class="pill err">קשה</span>' : ''}${e.pp ? ` <span class="pill acc">חלק ${esc(e.pp)}</span>` : ''}</div>
    <div class="a">${money(num(e.a))}${s === 'נאסף' && e.ga != null && e.ga !== '' ? `<div class="small muted">נגבה ${money(e.ga)}</div>` : ''}</div>
    <div class="m">${courier}${e.p ? `<a href="tel:${esc(e.p)}">${esc(fmtPhone(e.p))}</a>` : '<span class="neg">אין טלפון</span>'}${e.pmt ? `<span>${esc(e.pmt)}</span>` : ''}${e.mk ? `<span>סומן ע״י ${esc(e.mk.u)} ${when(e.mk.at)}</span>` : ''}</div>
    <div class="st no-print">${['נאסף', 'לא נאסף', 'לעבור', 'לא ענו'].map(x => `<button data-s="${x}" aria-pressed="${s === x}" data-mark="${esc(e._k)}|${s === x ? '' : x}">${x}</button>`).join('')}</div></div>`;
}
async function quickMark(ctx, b) {
  const [key, s] = b.dataset.mark.split('|');
  const e = ctx.a.entries.find(x => x._k === key);
  const prev = normStatus(e.s);
  // תיקון סימון קיים (למשל ״נאסף״ שסומן בטעות) — מבקשים סיבה ומתעדים
  let reason = '';
  if (prev === 'נאסף' && s !== 'נאסף') { reason = prompt(`לבטל את הסימון ״נאסף״ של ${e.n}? כתוב סיבה לתיעוד (לא חובה):`, ''); if (reason === null) return; }
  b.disabled = true;
  try {
    const r = await save('POST', `/api/accounts/${ctx.a.id}/mark`, { key, s, reason }, { label: 'סימון איסוף של ' + e.n });
    Object.assign(e, r.entry); if (r.entry.ga === undefined) delete e.ga; ctx.a._version = r.version;
    const y = window.scrollY; draw(ctx); window.scrollTo(0, y); toast(s ? `${e.n}: ${s}` : 'הסימון בוטל');
  } catch (err) { b.disabled = false; toast(err.network ? 'לא נשמר — בעיית קליטה. לחץ ״נסה שוב״ למעלה' : err.message); }
}
async function rowSheet(ctx, key) {
  const e = ctx.a.entries.find(x => x._k === key); if (!e) return;
  const colls = await get('/api/collectors').catch(() => []);
  const s = openSheet(`<div class="hd"><h2>${esc(e.n)}</h2><button class="x" data-close>×</button></div>
    <dl class="kv"><dt>סכום</dt><dd>${money(num(e.a))}</dd><dt>שעה</dt><dd>${esc(e.t || '—')}</dd><dt>גובה אחראי</dt><dd>${esc(cleanColl(e.c) || '—')}</dd><dt>טלפון</dt><dd>${e.p ? `<a href="tel:${esc(e.p)}">${esc(fmtPhone(e.p))}</a>` : '—'}</dd></dl>
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
    $('#rh', s.el).innerHTML = L.length ? `<div class="list">${L.map(x => { const b = JSON.parse(x.before || '{}'), af = JSON.parse(x.after || '{}'); return `<div class="li noc"><div class="t">${esc(b.s || 'ממתין')} ← ${esc(af.s || 'ממתין')}${af.by && af.by !== b.by ? ' · אסף: ' + esc(af.by === '@' ? 'הגובה' : af.by) : ''}</div><div class="a small">${when(x.at)}</div><div class="m"><span>${esc(x.user_name)}</span></div></div>`; }).join('')}</div>` : 'אין שינויים מתועדים';
  }).catch(() => { $('#rh', s.el).textContent = ''; });
  const opId = uid();
  const rp = $('#rpriv', s.el); if (rp) rp.onclick = () => { const it = itemsOf(ctx).find(x => x.ref === key); s.close(); openPrivate([it], { col: 'accounts', id: ctx.a.id, title: ctx.a.title + ' · ' + e.n, kind: ctx.a.kind }); };
  $('#rsave', s.el).onclick = async (ev) => {
    const btn = ev.target; btn.disabled = true;
    let by = $('#rb', s.el).value.trim(); if (by === 'הגובה עצמו') by = '@';
    try {
      const r = await save('POST', `/api/accounts/${ctx.a.id}/mark`, { opId, key, s: $('#rs', s.el).value, by, ga: $('#rga', s.el).value.trim(), pmt: $('#rp', s.el).value, nt: $('#rn', s.el).value, reason: $('#rr', s.el).value }, { label: 'עדכון איסוף של ' + e.n });
      Object.keys(e).forEach(k => { if (!['_k', 'n', 'a', 't', 'p', 'c', 'h', 'pg', 'pp'].includes(k)) delete e[k]; }); Object.assign(e, r.entry); ctx.a._version = r.version;
      s.close(); draw(ctx); toast('נשמר');
    } catch (err) { btn.disabled = false; $('#rerr', s.el).innerHTML = `<div class="note err">${esc(err.network ? 'לא נשמר בגלל בעיית קליטה. לחץ שוב ״שמור״ — הפעולה לא תירשם פעמיים.' : err.message)}</div>`; }
  };
}
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'hist') return;
  const id = location.hash.split('/')[2].split('?')[0];
  const h = await get(`/api/accounts/${id}/history`);
  openSheet(`<div class="hd"><h2>היסטוריית סימונים</h2><button class="x" data-close>×</button></div>${h.length ? `<div class="list">${h.map(x => { const b = JSON.parse(x.before || '{}'), af = JSON.parse(x.after || '{}'); return `<div class="li noc"><div class="t">${esc(x.note || '')}: ${esc(b.s || 'ממתין')} ← ${esc(af.s || 'ממתין')}</div><div class="a small">${when(x.at)}</div><div class="m"><span>${esc(x.user_name)}</span>${af.by ? `<span>אסף: ${esc(af.by === '@' ? 'הגובה' : af.by)}</span>` : ''}</div></div>`; }).join('')}</div>` : '<div class="empty">אין עדיין סימונים</div>'}`);
});

// ---------- עריכה ----------
const COLS = {
  morning: { rows: [['n', 'לקוח'], ['i', 'ריבית', 'n'], ['p', 'קרן', 'n']], loans: [['n', 'הלוואה'], ['a', 'סכום', 'n']] },
  collectors: { entries: [['n', 'שם'], ['a', 'סכום', 'n'], ['c', 'גובה'], ['k', 'סוג', 'k'], ['t', 'שעה']] },
  split: { records: [['n', 'שם'], ['ph', 'טלפון'], ['a', 'יתרה', 'n'], ['c', 'גובה'], ['t', 'שעה'], ['h', 'קושי', 'h'], ['note', 'הערה'], ['side', 'לא היום', 'b']] },
  work: { entries: [['n', 'שם'], ['p', 'טלפון'], ['a', 'סכום', 'n'], ['c', 'גובה'], ['t', 'שעה'], ['h', 'קושי', 'h']], expenses: [['n', 'הוצאה'], ['a', 'סכום', 'n'], ['c', 'גובה']] },
};
const LIST_NAMES = { rows: 'שורות גבייה (ריבית/קרן)', loans: 'הלוואות שיצאו', entries: 'שורות', records: 'לקוחות', expenses: 'הוצאות' };
function renderEditor(ctx) {
  const a = structuredClone(ctx.a); const { view } = ctx; const spec = COLS[a.kind];
  const opId = uid();
  const cell = (r, [k, , t], li, ri) => {
    const v = r[k] ?? '';
    if (t === 'k') return `<select class="in" data-l="${li}" data-r="${ri}" data-k="${k}"><option value="d" ${v !== 'e' ? 'selected' : ''}>חוב</option><option value="e" ${v === 'e' ? 'selected' : ''}>הוצאה</option></select>`;
    if (t === 'h') return `<select class="in" data-l="${li}" data-r="${ri}" data-k="${k}"><option></option><option ${v === 'קשה' ? 'selected' : ''}>קשה</option><option ${v === 'לא קשה' ? 'selected' : ''}>לא קשה</option></select>`;
    if (t === 'b') return `<input type="checkbox" data-l="${li}" data-r="${ri}" data-k="${k}" ${v ? 'checked' : ''}>`;
    return `<input class="in ${t === 'n' ? 'n' : ''}" ${t === 'n' ? 'inputmode="decimal"' : ''} data-l="${li}" data-r="${ri}" data-k="${k}" value="${esc(v)}">`;
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
    else if (a.kind === 'split') { const c = calcSplit(a.records || []); el.innerHTML = `<div class="note info">סה״כ גובים ${money(c.grand)} · סה״כ הכול ${money(c.all)}</div>`; }
    else if (a.kind === 'collectors') { const c = calcCollectors(a.entries || []); el.innerHTML = `<div class="note info">חובות ${money(c.totalDebts)} · הוצאות ${money(c.totalExp)} · נטו ${money(c.totalNet)}</div>`; }
  };
  const drawE = () => {
    view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">עריכה</div><h1>${esc(a.title)}</h1></div></div>
    <div class="card"><div class="grid"><label class="f">תאריך<input class="in" type="date" id="ed-date" value="${esc(a.date)}"></label><label class="f">כותרת<input class="in" id="ed-title" value="${esc(a.title)}"></label>
    ${a.kind === 'morning' ? `<label class="f">קרן קיימת<input class="in n" id="ed-keren" inputmode="decimal" value="${esc(a.keren ?? '')}"></label><label class="f">משלוחים<input class="in n" id="ed-courier" inputmode="decimal" value="${esc(a.courier ?? '')}"></label>` : ''}</div>
    <div id="ed-sum"></div></div>
    ${Object.entries(spec).map(([li, cols]) => `<div class="card"><div class="row sp"><h2>${LIST_NAMES[li]} (${(a[li] || []).length})</h2><div class="row"><button class="btn ghost sm" data-paste="${li}">הדבקה מאקסל</button><button class="btn sm" data-add="${li}">+ שורה</button></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>#</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${(a[li] || []).map((r, ri) => `<tr><td>${ri + 1}</td>${cols.map(c => `<td>${cell(r, c, li, ri)}</td>`).join('')}<td><button class="x" data-del="${li}|${ri}" aria-label="מחק">×</button></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
    ${(R.editorActions[a.kind] || []).length ? `<div class="card row">${R.editorActions[a.kind].map((x, i) => `<button class="btn ghost" data-eact="${i}">${esc(x.label)}</button>`).join('')}</div>` : ''}
    <div class="actionbar"><div id="ed-err"></div><div class="row"><button class="btn xl" id="ed-save" style="flex:2">שמור</button><a class="btn ghost" href="#/acc/${a.id}" style="flex:1">ביטול</a></div></div>`;
    summary();
    $$('[data-l]', view).forEach(inp => inp.onchange = () => {
      const r = a[inp.dataset.l][+inp.dataset.r]; const k = inp.dataset.k; const col = spec[inp.dataset.l].find(c => c[0] === k);
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (col[2] === 'n') v = v === '' ? 0 : num(v);
      if (col[2] === 'b' && !v) delete r[k]; else r[k] = v;
      summary();
    });
    ['date', 'title', 'keren', 'courier'].forEach(k => { const el = $('#ed-' + k, view); if (el) el.onchange = () => { a[k] = ['keren', 'courier'].includes(k) ? num(el.value) : el.value; summary(); }; });
    $$('[data-add]', view).forEach(b => b.onclick = () => { const li = b.dataset.add; const r = {}; spec[li].forEach(([k, , t]) => { if (t === 'n') r[k] = 0; else if (t === 'k') r[k] = 'd'; else if (t !== 'b') r[k] = ''; }); if (a.kind === 'split') Object.assign(r, { fn: '', ln: '', cnt: 1, side: false }); if (a.kind === 'work' && li === 'entries') r.s = ''; (a[li] ||= []).push(r); drawE(); const ins = $$(`[data-l="${li}"][data-k="n"]`, view); ins[ins.length - 1]?.focus(); });
    $$('[data-del]', view).forEach(b => b.onclick = () => { const [li, ri] = b.dataset.del.split('|'); const r = a[li][+ri]; if (confirm(`למחוק את השורה ״${r.n || ''}״?`)) { a[li].splice(+ri, 1); drawE(); } });
    $$('[data-paste]', view).forEach(b => b.onclick = () => {
      const li = b.dataset.paste; const cols = spec[li];
      const s = openSheet(`<div class="hd"><h2>הדבקה מאקסל</h2><button class="x" data-close>×</button></div><p class="small muted">העתק מאקסל עמודות בסדר הזה: ${cols.map(c => c[1]).join(' · ')}. כל שורה תתווסף לסוף הרשימה.</p><textarea class="in" id="pt" style="min-height:200px"></textarea><button class="btn xl" id="pok" style="margin-top:10px">הוסף</button>`);
      $('#pok', s.el).onclick = () => { const lines = $('#pt', s.el).value.split(/\r?\n/).filter(l => l.trim()); for (const l of lines) { const parts = l.split('\t'); const r = {}; cols.forEach(([k, , t], i) => { const v = (parts[i] || '').trim(); r[k] = t === 'n' ? num(v) : t === 'b' ? !!v : t === 'k' ? (/הוצ|^e$/.test(v) ? 'e' : 'd') : v; }); if (a.kind === 'work' && li === 'entries') r.s = ''; (a[li] ||= []).push(r); } s.close(); drawE(); toast(lines.length + ' שורות נוספו'); };
    });
    $$('[data-eact]', view).forEach(b => b.onclick = () => R.editorActions[a.kind][+b.dataset.eact].run(a, drawE, ctx));
    $('#ed-save', view).onclick = async (ev) => {
      ev.target.disabled = true;
      if (a.kind === 'split') (a.records || []).forEach(r => { if (r.n && !r.fn) { const p = String(r.n).trim().split(' '); r.fn = p[0]; r.ln = p.slice(1).join(' '); } });
      const data = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]);
      try { await save('PUT', '/api/accounts/' + a.id, { data, baseVersion: ctx.a._version, opId }, { label: 'שמירת ' + a.title }); toast('נשמר ✓'); location.hash = '#/acc/' + a.id; }
      catch (e) { ev.target.disabled = false; $('#ed-err', view).innerHTML = `<div class="note err">${esc(e.network ? 'השמירה נכשלה בגלל בעיית קליטה. לחץ שוב ״שמור״ — השמירה לא תירשם פעמיים.' : e.message)}${e.status === 409 ? ' <a href="#/acc/' + a.id + '">פתח את הגרסה העדכנית</a>' : ''}</div>`; }
    };
  };
  drawE();
}
