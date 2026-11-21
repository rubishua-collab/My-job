// וואטסאפ פרטי — שליחה מהוואטסאפ הרגיל שלך, לקוח אחרי לקוח, עד שהחשבון העסקי יאושר.
// הנוסחים והמילוי הועתקו מהתוכנה המקורית:
//   לשונית פיצול: WA_DEF + waFill (app.html 4317, 4340), הנוסח השמור בהגדרות 'wa'
//   איסוף יומי / הודעות בוקר: MB_DEF + mbFill (app.html 9619, 9668), הנוסח השמור בהגדרות 'mb'
// פתיחת צ׳אט לא מסמנת ״נשלח״. מסמנים ״שלחתי״ ידנית. המקום ברשימה נשמר בשרת.
import { get, save, uid } from '../api.js';
import { $, $$, esc, dmy, toast, openSheet, closeSheet } from '../ui.js';
import { route } from '../registry.js';
import { App } from '../app.js';
import { waPhone, phShow, r2, num } from '../calc.js';
import { MB_DEF, mbFill, fmtOrig as fmt } from './ledger-calc.js';

// ---- נוסחים מקוריים ----
export const WA_DEF = 'בוקר טוב {שם פרטי} ☀️\nתזכורת לתשלום של היום: {סכום} ₪.\nנא להשיב להודעה זו עם השעה שנוחה לך היום, ונציג שלנו יגיע לאסוף.\nאם כבר שולם או שיש שינוי – נא לעדכן כאן.\nתודה ויום טוב 🙏';
// app.html 4340
export const waFill = (tpl, g) => String(tpl).replace(/\{שם פרטי\}/g, g.first).replace(/\{שם\}/g, g.n).replace(/\{סכום\}/g, fmt(g.a)).replace(/\{גובה\}/g, g.c).replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n');
const KINDS = {
  wa: { label: 'נוסח הודעת הפיצול', def: WA_DEF, fill: waFill, vars: ['{שם פרטי}', '{שם}', '{סכום}', '{גובה}'] },
  mb: { label: 'נוסח הודעת הבוקר', def: MB_DEF, fill: mbFill, vars: ['{שם}', '{סכום}', '{שעה}', '{גובה}'] },
};
export const tplKindFor = (accKind) => accKind === 'split' ? 'wa' : 'mb';
const isMobile = () => { try { return matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 820; } catch { return false; } };
export const chatHref = (ph, text) => (isMobile() ? 'https://wa.me/' + ph + '?text=' : 'https://web.whatsapp.com/send?phone=' + ph + '&text=') + encodeURIComponent(text);

async function loadTpl(kind) {
  try { const d = await get('/api/docs/settings/' + kind); return { tpl: typeof d.tpl === 'string' && d.tpl.trim() ? d.tpl : KINDS[kind].def, version: d._version, saved: true }; }
  catch { return { tpl: KINDS[kind].def, version: null, saved: false }; }
}
async function saveTpl(kind, tpl, version) {
  const data = kind === 'wa' ? { tpl, updatedAt: Date.now() } : { tpl, at: Date.now() };
  const r = await save('PUT', '/api/docs/settings/' + kind, { data, baseVersion: version ?? undefined, action: 'עריכת נוסח הודעה' }, { queue: false });
  return r.version;
}

// ---- קיבוץ נמענים כמו במקור: הודעה אחת לכל מספר, עם הסכום המצטבר ----
function group(items, kind) {
  const by = new Map(), problems = [];
  for (const it of items) {
    const ph = it.ph || waPhone(it.phone);
    if (!ph) { problems.push({ name: it.name || '(ללא שם)', why: it.why || (String(it.phone || '').trim() ? 'מספר לא תקין' : 'אין מספר טלפון'), ref: it.ref }); continue; }
    if (!by.has(ph)) {
      const first = String(it.first || '').trim() || String(it.name || '').trim().split(/\s+/)[0] || '';
      by.set(ph, { k: ph, ph, shown: phShow(ph) || it.phone, n: String(it.name || '').trim(), first, a: 0, t: '', c: '', cs: [], refs: [], names: new Set(), resolved: !!it.resolved });
    }
    const g = by.get(ph);
    g.a = r2(g.a + num(it.amount)); g.refs.push(it.ref); g.names.add(String(it.name || '').trim());
    if (it.time && (!g.t || it.time < g.t)) g.t = it.time;
    if (it.collector && g.cs.indexOf(it.collector) < 0) g.cs.push(it.collector);
  }
  const list = [...by.values()].map(g => {
    g.c = kind === 'wa' ? g.cs.join(' / ') : (g.cs[0] || '');
    g.shared = g.names.size > 1; g.names = [...g.names];
    return g;
  });
  list.sort((x, y) => (x.t ? 0 : 1) - (y.t ? 0 : 1) || String(x.t).localeCompare(String(y.t)) || String(x.c).localeCompare(String(y.c), 'he') || x.n.localeCompare(y.n, 'he'));
  return { list, problems };
}

// ---- שלב 1: הכנת ההודעות ----
// items: [{ref,name,first?,phone,amount,time,collector}], source: {col,id,title,kind}
export async function openPrivate(items, source) {
  const kind = tplKindFor(source.kind);
  const s = openSheet(`<div class="hd"><h2>וואטסאפ פרטי</h2><button class="x" data-close>×</button></div><div id="wp">מכין…</div>`);
  let resolved;
  try { resolved = await save('POST', '/api/wa-private/resolve', { items: items.map(i => ({ ref: i.ref, name: i.name, first: i.first, phone: i.phone, amount: i.amount, time: i.time, collector: i.collector })) }, { queue: false }); }
  catch (e) { $('#wp', s.el).innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  const T = await loadTpl(kind);
  const st = { tpl: T.tpl, ver: T.version, over: {}, off: new Set() };
  const { list, problems } = group(resolved, kind);
  const draw = () => {
    const fill = (g) => st.over[g.k] ?? KINDS[kind].fill(st.tpl, g);
    const n = list.filter(g => !st.off.has(g.k)).length;
    $('#wp', s.el).innerHTML = `
    <p class="small muted">ההודעות יישלחו מהוואטסאפ הרגיל שלך. לכל לקוח ייפתח הצ׳אט עם ההודעה כתובה, ואתה לוחץ ״שלח״ בוואטסאפ. פתיחת צ׳אט לא נחשבת שליחה — מסמנים ״שלחתי״ ידנית.</p>
    <details ${T.saved ? '' : 'open'}><summary>${KINDS[kind].label} ${st.tpl === KINDS[kind].def ? '(הנוסח המומלץ)' : '(הנוסח השמור שלך)'}</summary>
      <p class="small muted">משתנים: ${KINDS[kind].vars.join(' ')}${kind === 'mb' ? ' · בלי שעה: ״בשעה {שעה}״ ← ״במהלך היום״. בלי גובה: ״הגובה {גובה}״ ← ״הגובה שלנו״.' : ''}</p>
      <textarea class="in" id="wptpl" style="min-height:120px">${esc(st.tpl)}</textarea>
      <div class="row" style="margin-top:6px"><button class="btn sm" id="wpsave">שמור נוסח</button><button class="btn ghost sm" id="wpdef">החזר לנוסח המומלץ</button></div></details>
    <h3>${list.length} לקוחות · כל אחד יקבל הודעה אישית</h3>
    <div class="list">${list.map(g => `<div class="li"><input type="checkbox" class="ck" data-on="${esc(g.k)}" ${st.off.has(g.k) ? '' : 'checked'}>
      <div class="t">${esc(g.n)}${g.refs.length > 1 ? ` <span class="pill acc">${g.refs.length} שורות אוחדו</span>` : ''}${g.resolved ? ' <span class="pill">מספר מההיסטוריה</span>' : ''}${g.shared ? ` <span class="pill warn">אותו מספר: ${esc(g.names.join(', '))}</span>` : ''}</div>
      <div class="a">${esc(fmt(g.a))} ₪</div><div class="m"><span class="num">${esc(g.shown)}</span>${g.t ? `<span>${esc(g.t)}</span>` : ''}${g.c ? `<span>${esc(g.c)}</span>` : ''}</div>
      <textarea class="in" data-msg="${esc(g.k)}" style="grid-column:1/-1;min-height:90px;margin-top:6px">${esc(fill(g))}</textarea></div>`).join('')}</div>
    ${problems.length ? `<div class="note warn"><b>בלי מספר תקין (${problems.length}) — לא ייכנסו לתור:</b><ul style="margin:4px 0;padding-inline-start:18px">${problems.map(p => `<li>${esc(p.name)} — ${esc(p.why)}</li>`).join('')}</ul></div>` : ''}
    <div class="actionbar" style="bottom:0"><button class="btn wa xl" id="wpgo" ${n ? '' : 'disabled'}>הכן ${n} הודעות אישיות</button></div>`;
    $('#wptpl', s.el).oninput = (e) => { st.tpl = e.target.value; st.over = {}; $$('[data-msg]', s.el).forEach(t => { const g = list.find(x => x.k === t.dataset.msg); t.value = KINDS[kind].fill(st.tpl, g); }); };
    $('#wpsave', s.el).onclick = async () => { try { st.ver = await saveTpl(kind, st.tpl, st.ver); toast('הנוסח נשמר'); } catch (e) { toast(e.message); } };
    $('#wpdef', s.el).onclick = () => { st.tpl = KINDS[kind].def; st.over = {}; draw(); };
    $$('[data-msg]', s.el).forEach(t => t.oninput = () => { st.over[t.dataset.msg] = t.value; });
    $$('[data-on]', s.el).forEach(c => c.onchange = () => { c.checked ? st.off.delete(c.dataset.on) : st.off.add(c.dataset.on); const n2 = list.filter(g => !st.off.has(g.k)).length; $('#wpgo', s.el).textContent = `הכן ${n2} הודעות אישיות`; $('#wpgo', s.el).disabled = !n2; });
    const runId = 'P' + uid().replace(/-/g, '').slice(0, 16);
    $('#wpgo', s.el).onclick = async (ev) => {
      ev.target.disabled = true;
      const chosen = list.filter(g => !st.off.has(g.k)).map(g => ({ k: g.k, ph: g.ph, shown: g.shown, n: g.n, a: g.a, t: g.t, c: g.c, refs: g.refs, msg: st.over[g.k] ?? KINDS[kind].fill(st.tpl, g), state: '' }));
      const data = { created: Date.now(), by: App.me.name, source, tplKind: kind, items: chosen, pos: 0, problems };
      try { await save('POST', '/api/docs/wa_private', { id: runId, data, opId: runId }, { label: 'הכנת הודעות' }); closeSheet(); location.hash = '#/wa-run/' + runId; }
      catch (e) { ev.target.disabled = false; toast(e.network ? 'לא נשמר — בעיית קליטה. לחץ שוב, זה לא ייצור כפילות' : e.message); }
    };
  };
  draw();
}

// ---- שלב 2: תור השליחה ----
const STATE = { '': ['ממתין', ''], opened: ['נפתח צ׳אט', 'warn'], sent: ['שלחתי ✓', 'ok'], skip: ['דילגתי', ''] };
route('wa-run', async (view, [id]) => {
  let d = await get('/api/docs/wa_private/' + id);
  const put = async (label) => {
    const data = { ...d }; ['id', '_version'].forEach(k => delete data[k]);
    try { const r = await save('PUT', '/api/docs/wa_private/' + id, { data, baseVersion: d._version }, { label }); d._version = r.version; }
    catch (e) { if (e.status === 409) { d = await get('/api/docs/wa_private/' + id); draw(); toast('עודכן ממכשיר אחר — הרשימה רועננה'); } else toast(e.network ? 'לא נשמר — בעיית קליטה. ״נסה שוב״ למעלה' : e.message); }
  };
  const draw = () => {
    const it = d.items, i = Math.max(0, Math.min(d.pos || 0, it.length - 1)), g = it[i];
    const done = it.filter(x => x.state === 'sent').length, skip = it.filter(x => x.state === 'skip').length;
    view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">וואטסאפ פרטי · ${esc(d.source?.title || '')}</div><h1>${done} מתוך ${it.length} נשלחו</h1><div class="small" style="color:var(--band-muted)">${skip ? skip + ' דולגו · ' : ''}נוצר ע״י ${esc(d.by || '')}</div></div>${d.source?.id ? `<a class="btn sm" href="#/acc/${esc(d.source.id)}">חזרה ליומן</a>` : ''}</div>
    <div class="bar" style="margin-bottom:12px"><i style="width:${it.length ? done / it.length * 100 : 0}%;background:var(--wa)"></i></div>
    ${g ? `<div class="card" id="cur"><div class="row sp"><span class="muted small">לקוח ${i + 1} מתוך ${it.length}</span>${statePill(g.state)}</div>
      <h2 style="font-size:24px;margin:6px 0">${esc(g.n)}</h2>
      <div class="row" style="gap:6px 16px"><b style="font-size:20px">${esc(fmt(g.a))} ₪</b><span class="num">${esc(g.shown)}</span>${g.t ? `<span>שעה ${esc(g.t)}</span>` : ''}${g.c ? `<span>גובה: ${esc(g.c)}</span>` : ''}</div>
      <label class="f" style="margin-top:10px">ההודעה (אפשר לערוך לפני הפתיחה)<textarea class="in" id="rmsg" style="min-height:130px">${esc(g.msg)}</textarea></label>
      <a class="btn wa xl" id="ropen" href="${esc(chatHref(g.ph, g.msg))}" target="_blank" rel="noopener" style="margin-top:10px">פתח צ׳אט עם ${esc(g.n)}</a>
      <div class="grid" style="margin-top:10px;grid-template-columns:1fr 1fr">
        <button class="btn" id="rsent">${g.state === 'sent' ? 'בטל סימון ״שלחתי״' : 'שלחתי ✓ ועבור לבא'}</button>
        <button class="btn plain" id="rskip">${g.state === 'skip' ? 'בטל דילוג' : 'דלג'}</button>
        <button class="btn ghost" id="rprev" ${i === 0 ? 'disabled' : ''}>→ הקודם</button>
        <button class="btn ghost" id="rnext" ${i >= it.length - 1 ? 'disabled' : ''}>הבא ←</button></div>
      <p class="small muted">פתיחת הצ׳אט לא מסמנת שליחה. אחרי שלחצת ״שלח״ בוואטסאפ, חזור לכאן וסמן ״שלחתי״.</p></div>` : '<div class="empty">אין לקוחות בתור</div>'}
    ${done + skip === it.length && it.length ? '<div class="note ok">סיימת את כל הרשימה ✓</div>' : ''}
    <div class="card"><h2>כל הרשימה</h2><div class="list">${it.map((x, j) => `<button class="li noc link" data-go="${j}" style="text-align:start;border:0;border-top:1px solid var(--line);background:${j === i ? 'var(--accent-soft)' : 'transparent'};font:inherit;color:inherit;width:100%"><div class="t">${j + 1}. ${esc(x.n)}</div><div class="a">${statePill(x.state)}</div><div class="m"><span>${esc(fmt(x.a))} ₪</span><span class="num">${esc(x.shown)}</span>${x.sentAt ? `<span>${new Date(x.sentAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div></button>`).join('')}</div></div>
    ${(d.problems || []).length ? `<div class="note warn"><b>לא נכנסו לתור (אין מספר תקין):</b> ${d.problems.map(p => esc(p.name)).join(', ')}</div>` : ''}`;
    if (!g) return;
    const msg = $('#rmsg'), open = $('#ropen');
    msg.oninput = () => { g.msg = msg.value; open.href = chatHref(g.ph, g.msg); clearTimeout(msg._t); msg._t = setTimeout(() => put('עריכת הודעה'), 600); };
    open.onclick = () => { if (!g.state) { g.state = 'opened'; g.openedAt = Date.now(); setTimeout(() => { put('פתיחת צ׳אט'); draw(); }, 50); } };
    $('#rsent').onclick = async () => {
      if (g.state === 'sent') { g.state = 'opened'; delete g.sentAt; }
      else { g.state = 'sent'; g.sentAt = Date.now(); g.sentBy = App.me.name; const nx = it.findIndex((x, j) => j > i && x.state !== 'sent' && x.state !== 'skip'); if (nx >= 0) d.pos = nx; }
      draw(); await put('סימון שליחה');
    };
    $('#rskip').onclick = async () => { g.state = g.state === 'skip' ? '' : 'skip'; if (g.state === 'skip' && i < it.length - 1) d.pos = i + 1; draw(); await put('דילוג'); };
    $('#rprev').onclick = async () => { d.pos = i - 1; draw(); await put('מעבר'); };
    $('#rnext').onclick = async () => { d.pos = i + 1; draw(); await put('מעבר'); };
    $$('[data-go]').forEach(b => b.onclick = async () => { d.pos = +b.dataset.go; draw(); window.scrollTo(0, 0); await put('מעבר'); });
  };
  const statePill = (s) => `<span class="pill ${STATE[s || '']?.[1] || ''}">${STATE[s || '']?.[0] || ''}</span>`;
  draw();
});

// רשימת תורים קודמים
route('wa-private', async (view) => {
  const L = (await get('/api/docs/wa_private')).sort((a, b) => (b.created || 0) - (a.created || 0));
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">מהוואטסאפ הרגיל שלך</div><h1>וואטסאפ פרטי</h1></div></div>
  <p class="small muted">כדי להתחיל: פתח חשבון (פיצול / איסוף יום), סמן לקוחות ולחץ ״וואטסאפ פרטי״.</p>
  ${L.length ? `<div class="list">${L.map(r => { const s = r.items.filter(x => x.state === 'sent').length; return `<a class="li noc link" href="#/wa-run/${esc(r.id)}" style="text-decoration:none;color:inherit"><div class="t">${esc(r.source?.title || 'תור')}</div><div class="a">${s}/${r.items.length}</div><div class="m"><span>${new Date(r.created).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span>${esc(r.by || '')}</span></div></a>`; }).join('')}</div>` : '<div class="empty">עוד לא נשלחו הודעות מהוואטסאפ הפרטי</div>'}`;
});

import { more } from '../registry.js';
more({ href: '#/wa-private', label: 'וואטסאפ פרטי · תורי שליחה', can: A => A.can.send, order: 22 });
