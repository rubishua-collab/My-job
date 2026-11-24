// כרטיס ״הוצאות של גובה״ — משותף ל״איסוף יום״, ״חשבון גובים״ ו״פיצול״.
// הזנת כמה הוצאות (שורה לכל הוצאה: שם הגובה, סכום, על מה), שמירה לשורה או לכולן בלי לצאת מהכרטיס,
// ו״הוצאות לתאריך הנבחר״ מקובצות לפי גובה. כל הוצאה נשמרת פעם אחת (server/features/day-expense.js, opId לכל שורה).
import { get, save, uid } from './api.js';
import { $, $$, esc, dmy, toast, openSheet, closeSheet } from './ui.js';
import { num, collKey } from './calc.js';
import { collectorsList, matchCollectors } from './expense-form.js';

const fmtN = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export async function openExpensesCard({ date, workId, collId, preColl = '', onChange }) {
  const list = await collectorsList();
  const newRow = (c = '') => ({ id: uid(), op: uid(), c, chosen: matchCollectors(list, c).exact || '', a: '', n: '', err: {}, busy: false });
  let rows = [newRow(preColl)], items = [], changed = false;
  const s = openSheet(`<div class="hd"><h2>הוצאות של גובה · ${dmy(date)}</h2><button class="x" id="xc-x" aria-label="סגירה">×</button></div>
    <p class="small muted" style="margin:0">כל הוצאה משויכת לגובה ולתאריך ${dmy(date)}, ומופיעה ב״איסוף יום״, ב״חשבון גובים״ וב״פיצול״ של אותו תאריך.</p>
    <datalist id="xc-colls">${list.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
    <div id="xc-rows"></div>
    <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px"><button class="btn ghost" id="xc-add">+ הוסף שורת הוצאה</button><button class="btn" id="xc-all">שמור את כל ההוצאות</button></div>
    <div id="xc-msg" role="status" aria-live="polite"></div>
    <h3 style="margin:14px 0 6px">הוצאות לתאריך הנבחר</h3><div id="xc-list"><div class="small muted">טוען…</div></div>
    <button class="btn xl" id="xc-done" style="width:100%;margin-top:12px">סיום</button>`);
  const el = s.el, box = $('#xc-rows', el);
  // סגירה רק ב״סיום״ / × (או נגיעה מחוץ לכרטיס) — ואם נשארו שורות שלא נשמרו, שואלים קודם
  // שורה ״לא נשמרה״ רק אם הוקלד בה משהו — גובה שמולא מראש בשורה ריקה לא נחשב
  const pending = () => rows.filter(r => String(r.a).trim() || String(r.n).trim() || (String(r.c).trim() && String(r.c).trim() !== String(preColl).trim()));
  const tryClose = () => {
    const p = pending();
    if (p.length && !confirm(`יש ${p.length} שורות הוצאה שלא נשמרו. לסגור בלי לשמור אותן?\n(״ביטול״ — חזרה לכרטיס)`)) return;
    closeSheet(); if (changed && onChange) onChange();
  };
  const sheet = document.getElementById('sheet');
  sheet.onclick = (e) => { if (e.target === sheet) tryClose(); };
  $('#xc-x', el).onclick = tryClose; $('#xc-done', el).onclick = tryClose;

  const rowHTML = (r, i) => `<div class="card xc-row" data-rid="${r.id}" style="padding:10px;margin:8px 0">
    <div class="row sp"><b>הוצאה ${i + 1}</b>${rows.length > 1 ? `<button type="button" class="btn plain sm" data-xrm="${r.id}">הסר שורה</button>` : ''}</div>
    <div class="grid">
      <label class="f ${r.err.c ? 'bad' : ''}">שם הגובה<input class="in" data-xf="c" value="${esc(r.c)}" list="xc-colls" autocomplete="off" placeholder="התחל להקליד שם גובה"><span class="small xc-cs">${r.chosen ? `<span class="ok-t">✓ ${esc(r.chosen)}</span>` : r.err.c ? `<span class="neg">${esc(r.err.c)}</span>` : ''}</span></label>
      <label class="f ${r.err.a ? 'bad' : ''}">סכום (₪)<input class="in n" data-xf="a" inputmode="decimal" value="${esc(r.a)}" placeholder="0"><span class="small neg">${r.err.a ? esc(r.err.a) : ''}</span></label>
      <label class="f">על מה<input class="in" data-xf="n" value="${esc(r.n)}" placeholder="למשל דלק"></label>
    </div>
    <div class="xc-sug chips" style="margin:4px 0"></div>
    ${r.err.save ? `<div class="note err small">השמירה נכשלה — נסה שוב. ${esc(r.err.save)}</div>` : ''}<button type="button" class="btn sm" data-xsave="${r.id}" ${r.busy ? 'disabled' : ''}>${r.busy ? 'שומר…' : 'שמור הוצאה'}</button></div>`;
  const drawRows = () => { box.innerHTML = rows.map(rowHTML).join(''); };
  const rowOf = (node) => rows.find(r => r.id === node.closest('[data-rid]')?.dataset.rid);
  box.addEventListener('input', (e) => {
    const r = rowOf(e.target); if (!r) return; const f = e.target.dataset.xf; r[f] = e.target.value; delete r.err[f];
    if (f === 'c') {
      const m = matchCollectors(list, r.c); r.chosen = m.exact || '';
      const card = e.target.closest('[data-rid]');
      card.querySelector('.xc-cs').innerHTML = r.chosen ? `<span class="ok-t">✓ ${esc(r.chosen)}</span>` : (r.c.trim() && !m.sugg.length ? '<span class="neg">אין גובה בשם הזה</span>' : '');
      card.querySelector('.xc-sug').innerHTML = r.chosen ? '' : m.sugg.map(c => `<button type="button" class="chip" data-xpick="${esc(c)}">${esc(c)}</button>`).join('');
    }
    e.target.closest('label')?.classList.remove('bad');
  });
  box.addEventListener('click', (e) => {
    const pk = e.target.closest('[data-xpick]'); if (pk) { const r = rowOf(pk); r.c = r.chosen = pk.dataset.xpick; delete r.err.c; const card = pk.closest('[data-rid]'); card.querySelector('[data-xf="c"]').value = r.c; card.querySelector('.xc-cs').innerHTML = `<span class="ok-t">✓ ${esc(r.c)}</span>`; card.querySelector('.xc-sug').innerHTML = ''; card.querySelector('[data-xf="a"]').focus(); return; }
    const rm = e.target.closest('[data-xrm]'); if (rm) { rows = rows.filter(r => r.id !== rm.dataset.xrm); if (!rows.length) rows = [newRow(preColl)]; drawRows(); return; }
    const sv = e.target.closest('[data-xsave]'); if (sv) { const r = rows.find(x => x.id === sv.dataset.xsave); saveRows([r]); }
  });
  $('#xc-add', el).onclick = () => { rows.push(newRow(preColl)); drawRows(); const ins = $$('[data-xf="c"]', box); ins[ins.length - 1]?.focus(); };
  $('#xc-all', el).onclick = () => { const p = pending(); if (!p.length) { msg('info', 'אין שורות למילוי'); return; } saveRows(p); };
  const msg = (cls, t) => { $('#xc-msg', el).innerHTML = t ? `<div class="note ${cls}">${esc(t)}</div>` : ''; };
  const valid = (r) => { r.err = {}; if (!r.chosen) r.err.c = String(r.c).trim() ? 'בחר גובה מהרשימה' : 'חסר שם גובה'; if (!(num(r.a) > 0)) r.err.a = 'חסר סכום'; return !Object.keys(r.err).length; };

  async function saveRows(list2) {
    let ok = 0, bad = 0, fail = 0;
    for (const r of list2) {
      if (r.busy) continue;
      if (!valid(r)) { bad++; continue; }
      r.busy = true; drawRows();
      try {
        await save('POST', '/api/day-expense', { date, workId, collId, c: r.chosen, a: num(r.a), n: String(r.n || '').trim(), opId: r.op }, { queue: false, label: 'הוספת הוצאה' });
        rows = rows.filter(x => x !== r); ok++; changed = true;
      } catch (e) { r.busy = false; r.err.save = e.message; fail++; }
    }
    if (!rows.length) rows = [newRow(preColl)];
    drawRows(); await loadList(); if (ok && onChange) onChange(); // המסך שמאחורי הכרטיס מתעדכן מיד
    msg(fail || bad ? 'warn' : 'ok', [ok ? `נשמרו ${ok} הוצאות` : '', bad ? `${bad} שורות חסרות פרטים — סימנתי אותן` : '', fail ? `${fail} שורות לא נשמרו — נסה שוב` : ''].filter(Boolean).join(' · '));
  }
  async function loadList() {
    try { items = (await get('/api/day-expense?date=' + date)).items; } catch { $('#xc-list', el).innerHTML = '<div class="note err">לא הצלחתי לטעון את ההוצאות</div>'; return; }
    const groups = new Map(); for (const x of items) { const k = collKey(x.c) || '—'; if (!groups.has(k)) groups.set(k, { c: x.c || 'ללא גובה', xs: [] }); groups.get(k).xs.push(x); }
    const tot = items.reduce((t, x) => t + num(x.a), 0);
    $('#xc-list', el).innerHTML = items.length ? [...groups.values()].sort((a, b) => a.c.localeCompare(b.c, 'he')).map(g => `<div class="card xc-g" data-xg="${esc(g.c)}" style="padding:8px 10px;margin:6px 0"><div class="row sp"><b>${esc(g.c)}</b><b class="xc-gt">${fmtN(g.xs.reduce((t, x) => t + num(x.a), 0))} ₪</b></div>
      <div class="list">${g.xs.map(x => `<div class="li noc"><div class="t">${x.t ? `<span class="num">${esc(x.t)}</span> · ` : ''}${esc(String(x.n || '').trim() || 'הוצאה')}${x.only ? ` <span class="pill">רק ב${esc(x.only)}</span>` : ''}</div><div class="a">${fmtN(x.a)} ₪</div><div class="m"><button type="button" class="btn plain sm" data-xdl="${esc(x.key)}">הסר הוצאה</button></div></div>`).join('')}</div></div>`).join('')
      + `<div class="note info xc-tot"><b>סה״כ הוצאות לכל הגובים: ${fmtN(tot)} ₪</b></div>` : '<div class="empty">אין עדיין הוצאות לתאריך הזה</div>';
    $$('[data-xdl]', el).forEach(b => b.onclick = async () => {
      const x = items.find(v => v.key === b.dataset.xdl); if (!x || !confirm(`להסיר את ההוצאה ״${x.n || 'הוצאה'}״ (${fmtN(x.a)} ₪) של ${x.c}?`)) return;
      try { await save('POST', '/api/day-expense/remove', { date, key: x.key, opId: uid() }, { queue: false, label: 'הסרת הוצאה' }); changed = true; await loadList(); if (onChange) onChange(); msg('ok', 'ההוצאה הוסרה'); } catch (e) { msg('err', 'ההסרה נכשלה — נסה שוב'); }
    });
  }
  drawRows(); loadList();
  setTimeout(() => $(preColl && rows[0].chosen ? '[data-xf="a"]' : '[data-xf="c"]', box)?.focus(), 60);
}
