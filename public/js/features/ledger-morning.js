// הודעות בוקר — במקור (app.html 9616-9841) נשלחו אחת-אחת דרך WhatsApp Web. כאן הרשימה נבנית בשרת בדיוק כמו mbRecipients
// (app.html 9635, ב-ledger-calc.js), והשליחה נעשית בלחיצה אחת דרך הממשק הרשמי (openSendSheet), עם תבנית מאושרת ומעקב מסירה.
import { get, save } from '../api.js';
import { $, $$, esc, dmy, weekday, todayISO, toast, viewState } from '../ui.js';
import { App, onLive } from '../app.js';
import { openSendSheet } from '../wa-ui.js';
import { openPrivate } from './wa-private.js';
import { mbFill, fmtOrig } from './ledger-calc.js';

// נוסח התבנית לשליחה הרשמית: אותה הודעה בדיוק כמו mbFill. Meta לא מאפשרת להחליף ביטויים בתבנית מאושרת,
// ולכן ״בשעה {שעה}״ הופך ל-{שעה} והשעה נשלחת כ״בשעה 16:00״ או ״במהלך היום״, הגובה נשלח כ״שלנו״ כשאין גובה,
// והסכום נשלח עם ₪ (כך הוא בכל ההודעות הרשמיות).
export const waDraftOf = (tpl) => String(tpl || '').replace(/בשעה\s*\{שעה\}/g, '{שעה}').replace(/\{סכום\}\s*₪/g, '{סכום}');
export const itemOf = (g, date) => ({ ref: g.k, name: g.n, phone: g.ph, amount: g.a, time: g.t ? 'בשעה ' + g.t : 'במהלך היום', collector: g.c || 'שלנו', date: dmy(date) });

export async function renderMorning(view, args, q) {
  if (!App.can.send) { view.innerHTML = '<div class="note err">שליחת הודעות בוקר זמינה לבעלים ולמנהל</div>'; return; }
  const vs = viewState.get('mb');
  const date = q.get('date') || todayISO();
  let d = await get('/api/ledger/morning?date=' + date);
  const st = { coll: vs.coll || '', off: new Set(), tpl: d.tpl, ver: d.tplVersion, saveT: null };
  const inColl = g => !st.coll || (st.coll === '__none' ? !g.c : g.c === st.coll); // app.html 9679
  const draw = () => {
    const all = d.list.concat(d.noPhone);
    const colls = Array.from(new Set(all.map(g => g.c).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')); // app.html 9754
    const hasNone = all.some(g => !g.c);
    if (st.coll && st.coll !== '__none' && colls.indexOf(st.coll) < 0) st.coll = '';
    const shown = d.list.filter(inColl), noPh = d.noPhone.filter(inColl), sel = shown.filter(g => !st.off.has(g.k));
    const src = [d.split ? `קובץ הפיצול של ${dmy(d.split.date)} (${d.split.records} שורות${d.split.xstash ? ' + ' + d.split.xstash + ' שהועברו לאיסוף' : ''})` : '', d.work ? `רשימת האיסוף של ${dmy(d.work.date)} (שעה וגובה מעודכנים, מי שכבר ״נאסף״ לא מקבל)` : ''].filter(Boolean).join(' · ');
    $('#mb-out').innerHTML = `
      <div class="note info small">${src ? 'הלקוחות נלקחים מ' + esc(src) + '.' : 'אין קובץ פיצול או רשימת איסוף לתאריך הזה.'} כמה חובות על אותו טלפון = הודעה אחת עם הסכום המצטבר.</div>
      <div class="chips" id="mb-colls"><span class="small muted">שלח ל:</span><button class="chip" data-c="" aria-pressed="${!st.coll}">כל הגובים</button>${colls.map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${st.coll === c}">${esc(c)}</button>`).join('')}${hasNone && colls.length ? `<button class="chip" data-c="__none" aria-pressed="${st.coll === '__none'}">ללא גובה</button>` : ''}</div>
      ${noPh.length ? `<div class="note warn small" id="mb-noph">דילוג על ${noPh.length} לקוחות בלי טלפון (לא יקבלו הודעה): ${esc(noPh.map(g => g.n).join(', '))}</div>` : ''}
      <div class="row sp"><b>${sel.length} מתוך ${shown.length} לקוחות נבחרו</b><span><button class="btn plain sm" id="mb-all-on">בחר הכל</button><button class="btn plain sm" id="mb-all-off">נקה הכל</button></span></div>
      <div class="list" id="mb-list">${shown.length ? shown.map(g => `<div class="li mb-row" data-k="${esc(g.k)}"><input type="checkbox" class="ck" data-sel="${esc(g.k)}" ${st.off.has(g.k) ? '' : 'checked'} aria-label="${esc(g.n)}">
        <div class="t">${esc(g.n)}</div><div class="a"><span class="num">${fmtOrig(g.a)} ₪</span></div>
        <div class="m"><span>${g.t ? 'שעה ' + esc(g.t) : 'בלי שעה'}</span><span>${g.c ? 'גובה: ' + esc(g.c) : 'בלי גובה'}</span><span class="num">${esc(g.shown)}</span></div>
        <details style="grid-column:1/-1"><summary class="small">ההודעה</summary><div class="preview mb-msg">${esc(mbFill(st.tpl, g))}</div></details></div>`).join('') : `<div class="note warn">${d.list.length ? 'אין לקוחות עם טלפון אצל הגובה הזה.' : 'אין בפיצול של היום לקוחות עם טלפון.'}</div>`}</div>
      <div class="actionbar"><button class="btn wa xl" id="mb-priv" ${sel.length ? '' : 'disabled'}>וואטסאפ פרטי · הכן הודעה אישית ל־${sel.length} לקוחות</button><button class="btn ghost" id="mb-send" ${sel.length ? '' : 'disabled'}>שלח דרך החשבון העסקי ל־${sel.length} לקוחות</button></div>`;
    $$('[data-c]', view).forEach(b => b.onclick = () => { st.coll = b.dataset.c; viewState.set('mb', { coll: st.coll }); draw(); });
    $$('[data-sel]', view).forEach(c => c.onchange = () => { c.checked ? st.off.delete(c.dataset.sel) : st.off.add(c.dataset.sel); draw(); });
    $('#mb-all-on').onclick = () => { shown.forEach(g => st.off.delete(g.k)); draw(); };
    $('#mb-all-off').onclick = () => { shown.forEach(g => st.off.add(g.k)); draw(); };
    $('#mb-priv').onclick = () => openPrivate(sel.map(g => ({ ref: g.k, name: g.n, phone: g.ph, amount: g.a, time: g.t, collector: g.c })), { col: 'accounts', id: d.work ? d.work.id : (d.split ? d.split.id : null), title: 'הודעות בוקר ' + dmy(d.date), kind: 'morning-msgs' });
    $('#mb-send').onclick = () => {
      const items = sel.map(g => itemOf(g, d.date));
      openSendSheet(items, { col: 'accounts', id: d.work ? d.work.id : (d.split ? d.split.id : null), title: 'הודעות בוקר ' + dmy(d.date) + (st.coll ? ' · ' + (st.coll === '__none' ? 'ללא גובה' : st.coll) : ''), kind: 'morning-msgs' });
    };
    const sample = sel[0] || shown[0] || d.list[0];
    const pv = $('#mb-prev'); pv.hidden = !(st.tpl.trim() && sample); if (!pv.hidden) pv.textContent = 'כך תיראה ההודעה ל' + sample.n + ':\n' + mbFill(st.tpl, sample);
  };
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">${esc(weekday(date))}</div><h1>הודעות בוקר · ${dmy(date)}</h1></div>
    <input type="date" class="in" id="mb-date" value="${date}" style="max-width:170px;background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)"></div>
    <details class="card" id="mb-setup" ${vs.open ? 'open' : ''}><summary><b>נוסח ההודעה</b> <span class="small muted">— {שם} {סכום} {שעה} {גובה}</span></summary>
      <div class="grid" style="grid-template-columns:1fr;margin-top:8px">
        <textarea class="in" id="mb-tpl" rows="3" dir="rtl">${esc(st.tpl)}</textarea>
        <div class="chips">${['{שם}', '{סכום}', '{שעה}', '{גובה}'].map(v => `<button class="chip" data-ins="${v}">${v}</button>`).join('')}<button class="btn plain sm" id="mb-def">נוסח ברירת המחדל</button></div>
        <div class="preview" id="mb-prev" hidden></div>
        <div class="note info small">שליחה בוואטסאפ העסקי נעשית בתבנית שאושרה מראש על ידי Meta. <button class="btn ghost sm" id="mb-todraft">הכן טיוטת תבנית מהנוסח הזה</button> — אחר כך ״עריכת נוסח התבנית״ בחלון השליחה ושליחה לאישור.</div>
      </div></details>
    <div id="mb-out"></div>`;
  $('#mb-date').onchange = (e) => { location.hash = '#/morning-msgs?date=' + e.target.value; };
  $('#mb-setup').ontoggle = () => viewState.set('mb', { open: $('#mb-setup').open });
  const saveTpl = () => { // app.html 9786 mbSaveTpl: נשמר ב-settings/mb {tpl,at}
    clearTimeout(st.saveT);
    st.saveT = setTimeout(async () => {
      if (!App.can.finance) return;
      try { const r = await save('PUT', '/api/docs/settings/mb', { data: { tpl: st.tpl, at: Date.now() }, baseVersion: st.ver == null ? undefined : st.ver }, { label: 'נוסח הודעות הבוקר', queue: false }); st.ver = r.version; }
      catch (e) { if (e.status === 409) { const m = await get('/api/docs/settings/mb').catch(() => null); st.ver = m ? m._version : st.ver; toast('הנוסח עודכן ממכשיר אחר — הנוסח שלך יישמר בשינוי הבא'); } else toast(e.message); }
    }, 900);
  };
  const ta = $('#mb-tpl');
  ta.oninput = () => { st.tpl = ta.value; saveTpl(); draw(); };
  $$('[data-ins]', view).forEach(b => b.onclick = () => { const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? s, v = b.dataset.ins; ta.value = ta.value.slice(0, s) + v + ta.value.slice(en); ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); st.tpl = ta.value; saveTpl(); draw(); });
  $('#mb-def').onclick = () => { ta.value = d.def; st.tpl = d.def; saveTpl(); draw(); toast('הוחזר נוסח ברירת המחדל'); };
  $('#mb-todraft').onclick = () => { try { localStorage.setItem('yh_wa_draft', waDraftOf(st.tpl)); toast('טיוטת התבנית הוכנה. פתח ״עריכת נוסח התבנית״ בחלון השליחה'); } catch { toast('לא ניתן לשמור טיוטה במכשיר הזה'); } };
  draw();
  let t;
  return onLive((e) => {
    if (!(e.col === 'accounts' || (e.col === 'settings' && e.id === 'sp_draft'))) return;
    clearTimeout(t); t = setTimeout(async () => { if (document.querySelector('#sheet:not([hidden])')) return; try { d = { ...(await get('/api/ledger/morning?date=' + date)), tpl: st.tpl }; draw(); } catch { /* */ } }, 400);
  });
}
