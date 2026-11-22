// קליטה מקובץ אקסל / טקסט / צילום מסך / Google Sheets, וייצוא לאקסל.
// הלוגיקה עצמה הועתקה מהתוכנה המקורית (ראו imports-core.js ו-imports-xl.js); כאן רק החיבור לממשק החדש.
import { editorAction, accountAction, more, route } from '../registry.js';
import { get, save } from '../api.js';
import { $, $$, esc, fmt, money, toast, openSheet } from '../ui.js';
import { App } from '../app.js';
import { calcSplit, sum, num, r2 } from '../calc.js';
import { mergeSplit, findGroups } from '../split-merge.js';
import {
  readTables, readCsvText, cell, morningFromTables, morningStatus, extractRows, mCheckMsg, mRowsOf,
  findSplitHeader, extractSplit, mergeRecords, mergeDebts, compactRec, carrySpNotes, splitStatus, DEF_COLL,
  phbBuild, phLookup, parseText, cEntryOf,
} from './imports-core.js';
import { xlBuildReport, xlBuildAccount, xlDownload } from './imports-xl.js';
import { extract, AI_OFF_MSG as AI_OFF } from './ai-client.js';

const ACCEPT = '.xls,.xlsx,.xml,.csv,.htm,.html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/xml,text/csv';
const IMG_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `.imp-drop{border:2px dashed var(--line,#ccc);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  .imp-drop.over{border-color:var(--gold,#b8860b);background:var(--surface2,#f6f6f6)}
  .imp-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0}
  .imp-pv{max-height:40vh;overflow:auto} .imp-pv table{width:100%} .imp-pv td.n{text-align:left;font-variant-numeric:tabular-nums}
  .imp-img{display:flex;gap:8px;align-items:center;margin:6px 0} .imp-img img{width:56px;height:56px;object-fit:cover;border-radius:8px}
  .imp-img .grow{flex:1;min-width:0}`;
  document.head.appendChild(s);
}

// ---------- רכיבים משותפים ----------
function dropHTML(btn, hint) {
  return `<div class="imp-drop" id="imp-drop"><input type="file" id="imp-file" accept="${ACCEPT}" hidden>
    <button class="btn" id="imp-pick" type="button">${esc(btn)}</button><span class="small muted">${esc(hint)}</span></div>
    <details style="margin-top:8px"><summary class="small">או קישור לגיליון Google</summary>
      <p class="small muted">בגיליון: קובץ ← שיתוף ← פרסום באינטרנט, או שיתוף ״כל מי שיש לו את הקישור״. הדבק כאן את הקישור:</p>
      <div class="row"><input class="in" id="imp-gs" type="url" dir="ltr" placeholder="https://docs.google.com/spreadsheets/…" style="flex:1"><button class="btn ghost sm" id="imp-gs-go" type="button">קרא מהקישור</button></div></details>
    <div id="imp-st" class="note info" hidden></div>`;
}
function bindDrop(el, onTables) {
  const st = (cls, html) => { const n = $('#imp-st', el); n.hidden = !html; n.className = 'note ' + (cls || 'info'); n.innerHTML = html || ''; };
  const run = async (fn, name) => {
    st('info', 'קורא את הקובץ…');
    try { const tables = await fn(); await onTables(tables, name, st); }
    catch (e) { st('err', 'לא הצלחתי לקרוא את הקובץ: ' + esc(e && e.message || 'שגיאה לא ידועה') + '. נסה לשמור אותו מחדש כאקסל (xlsx) ולהעלות שוב.'); }
  };
  const onFile = (f) => { if (f) run(() => readTables(f), f.name); };
  $('#imp-pick', el).onclick = () => $('#imp-file', el).click();
  $('#imp-file', el).onchange = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; onFile(f); };
  const drop = $('#imp-drop', el);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; onFile(f); });
  $('#imp-gs-go', el).onclick = () => {
    const url = $('#imp-gs', el).value.trim(); if (!url) return;
    run(async () => { const r = await save('POST', '/api/imports/gsheet', { url }, { queue: false, label: 'קריאת גיליון' }); return readCsvText(r.csv); }, 'Google Sheets');
  };
  return st;
}
function mapHTML(raw, hdrRow, fields, map, scan) {
  const hdr = Array.from(raw[hdrRow] || [], cell);
  let width = Math.max(hdr.length, 1); for (let r = hdrRow + 1; r < raw.length && r < hdrRow + scan; r++) width = Math.max(width, (raw[r] || []).length);
  for (const r of raw.slice(0, 40)) width = Math.max(width, (r || []).length);
  const opts = (none) => (none ? '<option value="-1">—</option>' : '') + Array.from({ length: width }, (_, i) => '<option value="' + i + '">' + (i + 1) + ' · ' + esc(hdr[i] || 'עמודה') + '</option>').join('');
  return `<div class="imp-map">${fields.map(([k, label, none]) => `<label class="f">${esc(label)}<select class="in" data-map="${k}">${opts(none)}</select></label>`).join('')}</div>`;
}
function bindMap(el, map, onChange) {
  $$('[data-map]', el).forEach(s => { s.value = String(map[s.dataset.map] == null ? -1 : map[s.dataset.map]); s.onchange = () => { map[s.dataset.map] = +s.value; onChange(s.dataset.map); }; });
}
// קריאת צילום דרך Claude (יכולת ai, ai-client.js). 503 = לא הוגדר
async function aiExtract(task, file, opts) {
  try { return await extract(task, file, '', opts || {}); }
  catch (e) { if (e.status === 503 || e.notConfigured || e.status === 404) e.code = 'not_configured'; throw e; }
}
// מקור sampleErr 2342 (קודי השגיאה של היכולת המקורית הוחלפו בקודי HTTP)
function sampleErr(e) {
  const c = e && e.code;
  if (c === 'not_configured') return AI_OFF;
  if (e && e.status === 429) return 'יותר מדי בקשות כרגע. נסה שוב בעוד כמה דקות.';
  if (e && e.status === 413) return 'הצילום לא התקבל. נסה קובץ PNG או JPG אחר.';
  if (e && e.status === 401) return 'צריך להתחבר מחדש.';
  if (e && e.cancelled) return 'בוטל.';
  return (e && e.message) || 'הקריאה נכשלה. נסה שוב.';
}

// ================= חשבון בוקר: דו״ח ההכנסות המפורט =================
editorAction('morning', {
  label: 'קליטה מקובץ אקסל',
  run(state, redraw) {
    style();
    const s = openSheet(`<div class="hd"><h2>קליטת דו״ח ההכנסות</h2><button class="x" data-close>×</button></div>
      ${dropHTML('בחר את דו״ח ההכנסות המפורט', 'אפשר גם לגרור את הקובץ לכאן. קובץ אקסל או XML עם העמודות ״תשלום קרן״ ו״תשלום ריבית״.')}
      <div id="m-imp-body"></div>`);
    const el = s.el; let M = null;
    const body = $('#m-imp-body', el);
    const draw = () => {
      if (!M) { body.innerHTML = ''; return; }
      const ready = M.map.p >= 0 || M.map.i >= 0;
      const st = ready ? morningStatus(M) : null; const ex = st ? st.ex : { rows: [] };
      if (st) setSt(st.cls, st.html);
      const pS = sum(ex.rows.map(r => r.p)), iS = sum(ex.rows.map(r => r.i));
      body.innerHTML = `<details ${M.found ? '' : 'open'}><summary>שורות הקובץ (${ex.rows.length}) ובחירת עמודות</summary>
        ${mapHTML(M.raw, M.hdrRow, [['n', 'עמודת שם משפחה (או שם הלקוח)', false], ['n2', 'עמודת שם פרטי', true], ['p', 'עמודת תשלום קרן', true], ['i', 'עמודת תשלום ריבית', true]], M.map, 40)}
        <div class="tbl-wrap imp-pv"><table><thead><tr><th>#</th><th>לקוח</th><th>תשלום קרן</th><th>תשלום ריבית</th></tr></thead><tbody>${ex.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.n)}</td><td class="n">${fmt(r.p)}</td><td class="n">${fmt(r.i)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td></td><td><b>סה״כ</b></td><td class="n"><b>${fmt(pS)}</b></td><td class="n"><b>${fmt(iS)}</b></td></tr></tfoot></table></div></details>
        <button class="btn xl" id="m-imp-ok" style="margin-top:10px" ${ex.rows.length ? '' : 'disabled'}>החלף את שורות החשבון (${ex.rows.length} לקוחות)</button>`;
      bindMap(body, M.map, () => draw());
      const ok = $('#m-imp-ok', body); if (ok) ok.onclick = () => {
        const cur = (state.rows || []).filter(r => r.n || r.p || r.i).length;
        if (cur && !confirm(`בחשבון כבר יש ${cur} שורות. להחליף אותן בשורות מהקובץ?`)) return;
        const fresh = extractRows(M.raw, M.hdrRow, M.map);
        state.rows = mRowsOf(fresh.rows);
        const msg = mCheckMsg({ rows: state.rows }, fresh.fileTotals);
        s.close(); redraw();
        toast(msg || `נקראו ${state.rows.length} לקוחות מהקובץ. לחץ ״שמור״ כדי לשמור את החשבון.`, msg ? 10000 : 4000);
      };
    };
    const setSt = bindDrop(el, async (tables, name, st) => {
      M = morningFromTables(tables); M.fileName = name;
      if (!M.found) st('warn', 'לא מצאתי עמודות בשם ״תשלום קרן״ ו״תשלום ריבית״. בחר ידנית את העמודות בחלון ״שורות הקובץ״ שנפתח למטה.');
      draw();
    });
  },
});

// הלוואות שניתנו: קריאת צילום מסך (מקור 6163-6203)
editorAction('morning', {
  label: 'הלוואות מצילום מסך',
  run(state, redraw) {
    style();
    const s = openSheet(`<div class="hd"><h2>הלוואות שניתנו — צילום מסך</h2><button class="x" data-close>×</button></div>
      <input type="file" id="ml-img" accept="${IMG_ACCEPT}" multiple hidden><button class="btn xl" id="ml-pick" type="button">העלאת צילום מסך</button>
      <div id="ml-note" class="note info" hidden></div>`, { onClose: () => { if (changed) redraw(); } });
    const el = s.el; let busy = false, changed = false;
    const say = (cls, t) => { const n = $('#ml-note', el); n.hidden = false; n.className = 'note ' + cls; n.textContent = t; };
    $('#ml-pick', el).onclick = () => { if (!busy) $('#ml-img', el).click(); };
    $('#ml-img', el).onchange = async (e) => {
      const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return;
      busy = true; $('#ml-pick', el).disabled = true; let added = 0, total = 0, fail = 0, unc = 0, off = false;
      for (let k = 0; k < files.length; k++) {
        say('info', 'קורא צילום ' + (k + 1) + ' מתוך ' + files.length + '…');
        try {
          const res = await aiExtract('loans', files[k]);
          const x = { rows: (res.entries || []).map(e => ({ n: e.n, a: num(e.a) })), unc: (res.entries || []).filter(e => e.u).length }; unc += x.unc;
          if (x.rows.length) {
            state.loans = (state.loans || []).filter(l => String(l.n || '').trim() || num(l.a));
            state.loans.push(...x.rows); added += x.rows.length; total += sum(x.rows.map(r => num(r.a))); changed = true;
          }
        } catch (err) { fail++; if (err.code === 'not_configured') { off = true; break; } }
      }
      busy = false; $('#ml-pick', el).disabled = false;
      if (off) say('warn', AI_OFF + '. אפשר להוסיף הלוואות ידנית.');
      else if (added) say(unc || fail ? 'warn' : 'ok', 'נוספו ' + added + ' הלוואות מהצילום · סה״כ ' + fmt(total) + ' ₪' + (unc ? ' · ' + unc + ' שורות לא ברורות, כדאי לבדוק מול הצילום' : '') + (fail ? ' · ' + fail + ' צילומים לא נקראו' : '') + '. אפשר לערוך כל שורה.');
      else say('err', fail ? 'לא הצלחתי לקרוא את הצילום. נסה צילום ברור יותר או הוסף ידנית.' : 'לא זיהיתי הלוואות בצילום.');
    };
  },
});

// ================= פיצול: קובץ החייבים (״מסך דו''ח ראשי.xls״) =================
const stripTmp = (r) => { delete r.byPhone; delete r.carried; delete r.id; return r; };
async function knownColl() {
  let list = []; try { list = await get('/api/collectors'); } catch { /* */ }
  return [...new Set(DEF_COLL.concat(list || []))];
}
async function savedSplits() { try { return await get('/api/imports/accounts?kind=split'); } catch { return []; } }

editorAction('split', {
  label: 'קליטה מקובץ אקסל',
  run(state, redraw) {
    style();
    const s = openSheet(`<div class="hd"><h2>קליטת קובץ החייבים</h2><button class="x" data-close>×</button></div>
      ${dropHTML('בחר את קובץ החייבים', 'אפשר גם לגרור את הקובץ לכאן. השורות מתפצלות לפי עמודת הסוכן, כפי שנכתב בקובץ, ושורות של אותו שם ואותו גובה מתאחדות.')}
      <div id="sp-imp-body"></div>`);
    const el = s.el, body = $('#sp-imp-body', el); let P = null, list = null;
    const compute = () => {
      const ex = extractSplit(P.raw, P.hdrRow, P.map); const m = mergeRecords(ex.recs);
      const cy = carrySpNotes(list, m.recs, state.date, state.id);
      return { ex, m, cy };
    };
    const draw = () => {
      const { ex, m, cy } = compute(); const st = splitStatus(ex, m, cy, P.map, P.agByContent); setSt(st.cls, st.html);
      const c = calcSplit(m.recs);
      body.innerHTML = `<details><summary>עריכת שורות (${m.recs.length}) והעמודות שנקראו</summary>
        ${mapHTML(P.raw, P.hdrRow, [['fn', 'שם פרטי', true], ['ln', 'שם משפחה (או הערה)', true], ['bal', 'יתרה', true], ['ag', 'סוכן (גובה)', true], ['ph', 'טלפון', true], ['hd', 'קשה / לא קשה', true]], P.map, 400)}
        <div class="tbl-wrap imp-pv"><table><thead><tr><th>#</th><th>שם</th><th>יתרה</th><th>גובה</th><th>טלפון</th><th>הערה</th></tr></thead><tbody>${m.recs.map((r, i) => `<tr${r.byPhone ? ' style="background:var(--warn-bg)"' : ''}><td>${i + 1}</td><td>${esc(r.n)}</td><td class="n">${fmt(r.a)}</td><td>${esc(r.c)}</td><td dir="ltr">${esc(r.ph)}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table></div></details>
        <div class="list" style="margin-top:8px">${c.blocks.map(b => `<div class="li noc"><div class="t">${esc(b.c)}</div><div class="a">${money(b.total)}</div><div class="m"><span>${b.count} שורות</span></div></div>`).join('')}
        <div class="li noc"><div class="t"><b>סה״כ כללי (גובים)</b></div><div class="a">${money(c.grand)}</div></div></div>
        <button class="btn xl" id="sp-imp-ok" style="margin-top:10px" ${m.recs.length ? '' : 'disabled'}>החלף את שורות הפיצול (${m.recs.length})</button>`;
      bindMap(body, P.map, (k) => { if (k === 'ag') P.agByContent = false; draw(); });
      $('#sp-imp-ok', body).onclick = () => {
        const cur = (state.records || []).filter(r => r.n || r.a).length;
        if (cur && !confirm(`בפיצול כבר יש ${cur} שורות. להחליף אותן בשורות מהקובץ?`)) return;
        const { m: mm } = compute();
        state.records = mm.recs.map(compactRec).filter(r => r.n || r.a);
        s.close(); redraw(); toast(`נקראו ${state.records.length} שורות. לחץ ״שמור״ כדי לשמור את הפיצול.`);
      };
    };
    const setSt = bindDrop(el, async (tables, name) => {
      const [known, prev] = await Promise.all([knownColl(), list ? list : savedSplits()]); list = prev;
      let found = null, ti = 0;
      for (let t = 0; t < tables.length && !found; t++) { const h = findSplitHeader(tables[t], known); if (h) { found = h; ti = t; } }
      if (!found) throw new Error('לא נמצאו בקובץ עמודות ״יתרה״ ו״שם פרטי״ או ״שם משפחה״');
      P = { raw: tables[ti], hdrRow: found.r, map: found.map, agByContent: !!found.byContent, fileName: name };
      draw();
    });
  },
});

// ״איחוד שורות״: שורה אחת לכל לקוח עם פירוט החובות לפי גובה — public/js/split-merge.js (מחליף את האיחוד המקורי לפי שם+גובה)
editorAction('split', {
  label: 'איחוד שורות',
  async run(state, redraw) {
    const res = await mergeSplit(state, askSame);
    if (res.cancelled) return;
    const skippedTxt = res.skipped.length ? ' · לא אוחדו (אנשים שונים): ' + res.skipped.map(g => g.name).join(', ') : '';
    if (!res.done.length) { toast((findGroups(state.records).length ? 'כל השורות כבר מאוחדות — לא נוסף שום חוב' : 'אין שורות לאיחוד — כל לקוח מופיע פעם אחת') + skippedTxt); return; }
    const msg = res.done.length === 1
      ? `אוחדו ${res.done[0].n} שורות של ${res.done[0].name} לשורה אחת בסך ${fmt(res.done[0].total)} ₪`
      : `אוחדו ${sum(res.done.map(d => d.n))} שורות של ${res.done.length} לקוחות: ` + res.done.slice(0, 4).map(d => `${d.name} (${d.n} שורות, ${fmt(d.total)} ₪)`).join(' · ') + (res.done.length > 4 ? ` ועוד ${res.done.length - 4}` : '');
    redraw();
    const card = document.querySelector('[data-paste="records"]')?.closest('.card');
    if (card) card.insertAdjacentHTML('beforebegin', `<div class="note ok" id="mgmsg">${esc(msg + skippedTxt)}. הסכום של כל גובה וסך הפיצול לא השתנו. לחץ ״שמור״ כדי לשמור את האיחוד.</div>`);
    toast(msg);
  },
});
// שם זהה אבל מזהים שונים / שני טלפונים תקינים ושונים — מציגים את השורות זו לצד זו ושואלים
function askSame(groups) {
  return new Promise((resolve) => {
    const ok = new Set(); let done = false;
    const s = openSheet(`<div class="hd"><h2>אותו אדם?</h2><button class="x" data-close>×</button></div>
      <p>לשמות האלה יש ${groups.some(g => g.ids.length > 1) ? 'מזהי לקוח שונים או ' : ''}מספרי טלפון שונים. סמן מי מהם הוא אותו אדם ויאוחד:</p>
      ${groups.map((g, i) => `<div class="card" style="padding:10px"><b>${esc(g.name)}</b><div class="tbl-wrap"><table><thead><tr><th>גובה</th><th>טלפון</th><th>סכום</th><th>שעה</th><th>הערה</th></tr></thead><tbody>${g.rows.map(r => `<tr><td>${esc(r.c || '')}</td><td>${esc(r.ph || '')}</td><td>${money(num(r.a))}</td><td>${esc(r.t || '')}</td><td>${esc(r.note || '')}</td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:6px"><label class="row"><input type="radio" name="mgq${i}" value="1"> כן, אותו אדם — לאחד</label><label class="row"><input type="radio" name="mgq${i}" value="0" checked> לא, אנשים שונים</label></div></div>`).join('')}
      <button class="btn xl" id="mgok" style="width:100%">המשך</button>`, { onClose: () => { if (!done) resolve(null); } });
    $('#mgok', s.el).onclick = () => { groups.forEach((g, i) => { if ($(`input[name="mgq${i}"]:checked`, s.el)?.value === '1') ok.add(g.key); }); done = true; s.close(); resolve(ok); };
  });
}
// איחוד חובות כפולים של אותו לווה (מקור 4627)
editorAction('split', {
  label: 'איחוד חובות כפולים',
  run(state, redraw) {
    const m = mergeDebts(state.records || []);
    if (!m.removed) return toast('אין חובות כפולים לאיחוד');
    state.records = m.recs.map(r => { if (!r.done) delete r.done; return r; }); redraw();
    toast('אוחדו ' + m.removed + ' שורות ל' + (m.people > 1 ? m.people + ' לווים' : 'שורה אחת') + ', ההערות נשמרו' + (m.split.length ? ' · ' + m.split.join(' · ') + ' (אפשר לשנות בשדה גובה)' : ''), 6000);
  },
});
// השלמת טלפונים מהפיצולים השמורים ומכרטיסי הלקוחות (מקור phbGet/phLookup 2551-2581, כמו המילוי האוטומטי בשורה 4596)
editorAction('split', {
  label: 'השלמת טלפונים מפיצולים קודמים',
  async run(state, redraw) {
    const [list, clients] = await Promise.all([savedSplits(), get('/api/docs/clients').catch(() => [])]);
    const book = phbBuild(list, { id: state.id, date: state.date, records: state.records || [] }, clients);
    let x = 0, part = [], amb = [];
    for (const r of state.records || []) {
      if (!r || String(r.ph || '').trim() || !String(r.n || '').trim()) continue;
      const lk = phLookup(r.n, book);
      if (lk.p) { r.ph = lk.p; if (lk.pm === 'a') part.push(r.n); else x++; }
      else if (lk.pm === 'amb') amb.push(r.n);
    }
    redraw();
    if (!x && !part.length) return toast(amb.length ? 'יש כמה מספרים שונים לשם הזה. כתוב ידנית: ' + amb.join(' · ') : 'לא נמצאו טלפונים להשלמה', 6000);
    toast('הטלפון מולא אוטומטית ב-' + (x + part.length) + ' שורות' + (part.length ? ' · הטלפון נמצא בהתאמה חלקית של השם. בדוק אותו: ' + part.join(' · ') : '') + (amb.length ? ' · כמה מספרים שונים (לא מולא): ' + amb.join(' · ') : ''), 9000);
  },
});

// ================= חשבון גובים: טקסט וצילומי מסך =================
editorAction('collectors', {
  label: 'הוספה מטקסט / צילום מסך',
  run(state, redraw) {
    style();
    const s = openSheet(`<div class="hd"><h2>הזנת רשימות</h2><button class="x" data-close>×</button></div>
      <h3>צילומי מסך</h3>
      <p class="small muted">העלה צילומי מסך של רשימת החייבים (ושל ההוצאות). כל צילום נקרא בנפרד והשורות נכנסות לטבלת הבדיקה. אם הצילום ארוך מאוד והכתב קטן, פצל אותו לכמה צילומים.</p>
      <input type="file" id="c-img" accept="${IMG_ACCEPT}" multiple hidden>
      <div class="row"><button class="btn" id="c-img-pick" type="button">העלאת צילומי מסך</button><button class="btn ghost" id="c-analyze" type="button" disabled>קרא את הצילומים</button></div>
      <div id="c-images"></div><div id="c-img-note" class="note info" hidden></div>
      <h3>או טקסט</h3>
      <label class="f">שורה לכל חייב: שם – סכום – גובה. כותרת ״הוצאות״ מעבירה את השורות שאחריה להוצאות.
        <textarea class="in" id="c-text" rows="6" style="min-height:150px" placeholder="דוגמה:&#10;שם הלקוח – 1,500 ₪ – שם הגובה&#10;הוצאות&#10;שם ההוצאה 300 שם הגובה"></textarea></label>
      <button class="btn xl" id="c-parse" type="button" style="margin-top:8px">הוסף מהטקסט</button>`, { onClose: () => { images.forEach(i => URL.revokeObjectURL(i.url)); if (changed) redraw(); } });
    const el = s.el; const images = []; let no = 0, busy = false, changed = false;
    const add = (rows) => { (state.entries ||= []).push(...rows.map(cEntryOf)); changed = true; };
    $('#c-parse', el).onclick = () => {
      const rows = parseText($('#c-text', el).value);
      if (!rows.length) return toast('לא זיהיתי שורות בטקסט');
      add(rows); s.close(); toast('נוספו ' + rows.length + ' שורות לטבלת הבדיקה');
    };
    // מקור imgStatusText 2352
    const stText = (im) => im.status === 'busy' ? 'קורא את הצילום…' : im.status === 'done' ? 'נקרא: ' + im.count + ' שורות · סך חובות ' + fmt(im.sumD) + ' ₪' + (im.sumE ? ' · הוצאות ' + fmt(im.sumE) + ' ₪' : '') + (im.note ? ' · ' + im.note : '') : im.status === 'error' ? (im.msg || 'שגיאה') : 'ממתין לקריאה';
    const drawImgs = () => {
      $('#c-images', el).innerHTML = images.map(im => `<div class="imp-img"><img src="${im.url}" alt="צילום ${im.no}"><div class="grow"><label class="f">גובה, אם לא מופיע בשורות<input class="in" data-cin="${im.no}" value="${esc(im.collector)}" ${busy ? 'disabled' : ''}></label><div class="small">${esc(stText(im))}</div></div><button class="x" data-rm="${im.no}" aria-label="הסר צילום">×</button></div>`).join('');
      $$('[data-cin]', el).forEach(i => i.oninput = () => { const im = images.find(x => x.no === +i.dataset.cin); if (im) im.collector = i.value; });
      $$('[data-rm]', el).forEach(b => b.onclick = () => { const k = images.findIndex(x => x.no === +b.dataset.rm); if (k >= 0) { URL.revokeObjectURL(images[k].url); images.splice(k, 1); drawImgs(); } });
      const pending = images.some(i => i.status !== 'done' && i.status !== 'busy');
      const an = $('#c-analyze', el); an.disabled = busy || !pending; an.textContent = busy ? 'קורא…' : 'קרא את הצילומים';
    };
    $('#c-img-pick', el).onclick = () => $('#c-img', el).click();
    $('#c-img', el).onchange = (e) => { for (const f of Array.from(e.target.files || [])) images.push({ no: ++no, file: f, url: URL.createObjectURL(f), collector: '', status: 'ready' }); e.target.value = ''; drawImgs(); };
    // מקור analyze 2387
    $('#c-analyze', el).onclick = async () => {
      if (busy) return; const todo = images.filter(i => i.status !== 'done' && i.status !== 'busy'); if (!todo.length) return;
      busy = true; drawImgs(); let stop = false;
      for (const im of todo) {
        if (stop) { im.status = 'ready'; continue; }
        im.status = 'busy'; drawImgs();
        try {
          const res = await aiExtract('collectors', im.file, { collector: im.collector });
          const rows = (res.entries || []).map(e => ({ ...e, c: String(e.c || '').trim() || String(im.collector || '').trim() })); add(rows);
          im.status = 'done'; im.count = rows.length; im.sumD = sum(rows.filter(r => r.k === 'd').map(r => r.a)); im.sumE = sum(rows.filter(r => r.k === 'e').map(r => r.a));
          im.note = res && res.note ? String(res.note).slice(0, 120) : '';
        } catch (e) { im.status = 'error'; im.msg = sampleErr(e); if (e.code === 'not_configured' || e.status === 429 || e.status === 401) stop = true; }
        drawImgs();
      }
      busy = false; drawImgs();
      const done = todo.filter(i => i.status === 'done').length;
      if (done) toast('נקראו ' + done + ' צילומים. בדוק את השורות מול הצילום לפני שמירה.');
      if (stop && todo.some(i => i.msg === AI_OFF)) { const n = $('#c-img-note', el); n.hidden = false; n.className = 'note warn'; n.textContent = AI_OFF + '. אפשר להדביק את הרשימה כטקסט למטה.'; }
    };
  },
});

// ================= ייצוא לאקסל =================
accountAction('*', {
  label: 'ייצוא לאקסל',
  can: (A) => A.can.finance,
  async run(ctx) {
    try { const { wb, name } = await xlBuildAccount(ctx.a); xlDownload(wb, name); toast('קובץ ה-Excel נשמר'); }
    catch (e) { toast(/טעינת רכיב/.test(e && e.message) ? 'רכיב ה-Excel לא נטען. בדוק את החיבור ונסה שוב.' : 'יצירת קובץ ה-Excel נכשלה. נסה שוב.'); }
  },
});

// הדוח הזה זמין גם במסך הניתוחים; הנתיב #/xlsx נשאר זמין
// more({ href: '#/xlsx', label: 'ייצוא דוחות ל-Excel', can: (A) => A.can.finance, order: 60 });
const RANGES = [['7', '7 ימים'], ['30', '30 ימים'], ['mon', 'החודש'], ['pmon', 'חודש קודם'], ['90', '90 ימים'], ['all', 'הכל'], ['custom', 'טווח']];
route('xlsx', async (view) => {
  const AN = { range: '30', from: '', to: '', stale: 14 };
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">דוחות</div><h1>ייצוא דוחות ל-Excel</h1></div></div>
    <div class="card"><p class="small muted">קובץ Excel בעברית, מימין לשמאל, מהנתונים השמורים בתוכנה ובאותן נוסחאות של הניתוחים ושל לוחות הסילוקין. נתוני ההלוואות הם המצב הנוכחי של כל ההלוואות.</p>
    <div class="chips" id="xr">${RANGES.map(([k, t]) => `<button class="chip" data-r="${k}" aria-pressed="${k === AN.range}">${t}</button>`).join('')}</div>
    <div class="grid" id="xc" hidden><label class="f">מתאריך<input class="in" type="date" id="xf"></label><label class="f">עד תאריך<input class="in" type="date" id="xt"></label></div>
    <label class="f" style="max-width:260px;margin-top:8px">״לא שילמו״: ימים בלי תשלום<input class="in n" id="xs" inputmode="numeric" value="14"></label>
    <button class="btn xl" id="xgo" style="margin-top:12px">ייצוא ל-Excel</button><div id="xinfo"></div></div>`;
  $$('[data-r]', view).forEach(b => b.onclick = () => { AN.range = b.dataset.r; $$('[data-r]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#xc', view).hidden = AN.range !== 'custom'; });
  $('#xgo', view).onclick = async (ev) => {
    const btn = ev.target, prev = btn.textContent; btn.disabled = true; btn.textContent = 'מכין קובץ Excel…';
    AN.from = $('#xf', view).value; AN.to = $('#xt', view).value; AN.stale = Math.max(0, Math.round(num($('#xs', view).value))) || 14;
    try {
      const [list, loans] = await Promise.all([get('/api/imports/accounts'), get('/api/docs/loans').catch(() => [])]);
      const R = await xlBuildReport(list, loans || [], AN);
      btn.textContent = 'שומר…'; xlDownload(R.wb, R.name); toast('קובץ ה-Excel נשמר');
      $('#xinfo', view).innerHTML = `<div class="note ok">${esc(R.name)} · ${R.M.ms.length} חשבונות בוקר · ${R.M.days.length} ימי גבייה · ריבית ${money(R.M.tot.interest)} · קרן ${money(R.M.tot.principal)}</div>`;
    } catch (e) { toast(/טעינת רכיב/.test(e && e.message) ? 'רכיב ה-Excel לא נטען. בדוק את החיבור ונסה שוב.' : 'יצירת קובץ ה-Excel נכשלה. נסה שוב.'); }
    finally { btn.disabled = false; btn.textContent = prev; }
  };
});
