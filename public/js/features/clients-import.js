// לשונית ״לקוחות״: ״ייבוא ועדכון לקוחות מקובץ״ (דוח ״טבלת לקוחות״ מתוכנת המחשב), ״טלפונים לטיפול״, ותזכורת חודשית.
// הייבוא מעדכן את מאגר הלקוחות בלבד — לא נוצר חוב, גבייה או שורה בחשבון יומי. החישוב וההשוואה בשרת: server/features/clients-import.js
import { route, todayPanel, clientsTop } from '../registry.js';
import { get, save, uid } from '../api.js';
import { $, $$, esc, toast } from '../ui.js';
import { loadVendor } from '../registry.js';
import { readTables } from './imports-core.js';
import { checkPhone } from '../phone-check.js';

const ACCEPT = '.xls,.xlsx,.csv,.htm,.html,.xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
const F = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const when = (t) => { const p = Object.fromEntries(F.formatToParts(new Date(t)).map(x => [x.type, x.value])); return `${p.day}.${p.month}.${p.year} בשעה ${p.hour}:${p.minute}`; };
let PENDING_FILE = null;
const pickHTML = (label, cls = 'btn') => `<label class="${cls} cimp-pick">${esc(label)}<input type="file" data-cimp-file accept="${ACCEPT}" hidden></label>`;
// בחירת קובץ מכל מקום (לשונית לקוחות / תזכורת במסך ״היום״) → מסך הייבוא
document.addEventListener('change', (e) => {
  const inp = e.target.closest && e.target.closest('[data-cimp-file]'); if (!inp) return;
  const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
  PENDING_FILE = f; if (location.hash.startsWith('#/clients-import')) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/clients-import';
});

// ---------- זיהוי עמודות ----------
const FIELD_NAMES = { extId: 'מס׳ לקוח', name: 'שם הלקוח', tz: 'ת.ז', phone: 'טלפון', mobile: 'טלפון נייד', address: 'כתובת', city: 'עיר', email: 'מייל', fax: 'פקס', srcNote: 'הערה', extra: 'עמודה נוספת (נשמרת בשם המקורי)', ignore: 'לא לשמור' };
const ALIASES = { extId: ['מס לקוח', 'מספר לקוח', 'קוד לקוח', 'מס לקוח במערכת'], name: ['שם הלקוח', 'שם לקוח', 'שם'], tz: ['תז', 'ת ז', 'תעודת זהות', 'מס זהות', 'מספר זהות'], phone: ['טלפון', 'טל', 'טלפון 1', 'טלפון בית'], mobile: ['טלפון נייד', 'נייד', 'סלולרי', 'פלאפון', 'טלפון סלולרי'], address: ['כתובת', 'רחוב'], city: ['עיר', 'ישוב', 'יישוב'], email: ['מייל', 'דואל', 'דוא ל', 'אימייל', 'email', 'e-mail', 'דואר אלקטרוני'], fax: ['פקס', 'fax'], srcNote: ['הערה', 'הערות'] };
const hk = (h) => String(h || '').replace(/[״"'׳`.:\-_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const autoField = (h) => { const k = hk(h); for (const [f, al] of Object.entries(ALIASES)) if (al.some(a => hk(a) === k)) return f; return ''; };
function findHeaderRow(table) {
  for (let r = 0; r < Math.min(table.length, 40); r++) {
    const fs = (table[r] || []).map(autoField);
    if (fs.includes('name') && (fs.includes('extId') || fs.includes('phone') || fs.includes('mobile') || fs.includes('tz'))) return r;
  }
  return -1;
}
// קריאת הקובץ עם הערכים המלאים: מספרים נשארים מספרים (לא הטקסט המקוצר שמוצג באקסל), CSV נקרא כטקסט (אפסים נשמרים)
async function readClientFile(file) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  const isBin = (u8[0] === 0x50 && u8[1] === 0x4b) || (u8[0] === 0xD0 && u8[1] === 0xCF);
  if (!isBin && !u8.slice(0, 4096).includes(0)) {
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { text = new TextDecoder('windows-1255').decode(u8); }
    if (!/<\?xml|<Workbook|<html|<table|<!DOCTYPE/i.test(text.slice(0, 500))) {
      await loadVendor('xlsx.full.min.js');
      const wb = window.XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
      return wb.SheetNames.map(n => window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
    }
  }
  return readTables(file);
}
const numStr = (v) => typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }) : String(v)) : String(v == null ? '' : v).trim();
function buildRows(table, hr, map) {
  const heads = (table[hr] || []).map(h => String(h || '').trim());
  const rows = [];
  for (let r = hr + 1; r < table.length; r++) {
    const line = table[r] || []; if (!line.some(v => String(v == null ? '' : v).trim())) continue;
    const o = { phonesRaw: [], extra: {}, _src: r + 1 };
    heads.forEach((h, c) => {
      if (!h) return; const v = line[c]; const f = map[h] || 'extra'; const s = numStr(v); if (!s || f === 'ignore') return;
      if (f === 'phone' || f === 'mobile') o.phonesRaw.push({ raw: s, num: typeof v === 'number', src: h });
      else if (f === 'tz') o.tz = typeof v === 'number' ? s.padStart(9, '0') : s; // ת.ז מספרית — אפסים מובילים
      else if (f === 'extra') o.extra[h] = s; else o[f] = s;
    });
    rows.push(o);
  }
  return { heads, rows };
}

// ---------- מסך הייבוא ----------
route('clients-import', async (view) => {
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">לקוחות</div><h1>ייבוא ועדכון לקוחות מקובץ</h1></div><a class="btn sm" href="#/clients">חזרה ללקוחות</a></div><div id="ci-body"></div>`;
  const body = $('#ci-body', view);
  const file = PENDING_FILE; PENDING_FILE = null;
  if (!file) { body.innerHTML = `<div class="card"><p>בחר את קובץ ״טבלת לקוחות״ שייצאת מתוכנת המחשב (Excel או CSV).</p>${pickHTML('בחר קובץ')}</div>`; return; }
  body.innerHTML = '<div class="note info">קורא את הקובץ…</div>';
  let tables; try { tables = await readClientFile(file); } catch (e) { body.innerHTML = `<div class="note err">לא הצלחתי לקרוא את הקובץ: ${esc(e.message || '')}</div>${pickHTML('בחר קובץ אחר')}`; return; }
  let ti = -1, hr = -1; for (let i = 0; i < tables.length && ti < 0; i++) { const h = findHeaderRow(tables[i]); if (h >= 0) { ti = i; hr = h; } }
  if (ti < 0) { body.innerHTML = `<div class="note err">לא מצאתי בקובץ כותרות של טבלת לקוחות (למשל ״שם הלקוח״ ו״מס׳ לקוח״ או ״טלפון״).</div>${pickHTML('בחר קובץ אחר')}`; return; }
  const st = await get('/api/clients-import/state').catch(() => ({ map: {} }));
  const saved = st.map || {}; const table = tables[ti];
  const map = {}; (table[hr] || []).forEach(h => { h = String(h || '').trim(); if (h) map[h] = saved[h] || autoField(h) || 'extra'; });
  let data = buildRows(table, hr, map), P = null; const dec = {}, choice = {}; const fixes = {};
  const applyFixes = () => data.rows.forEach((r, i) => { const fx = fixes[i]; if (!fx) return; r.phonesRaw = r.phonesRaw.map(p => ({ ...p, raw: fx[p.raw] != null ? fx[p.raw] : p.raw, num: fx[p.raw] != null ? false : p.num })); if (fx.__add) r.phonesRaw.push({ raw: fx.__add, src: 'הוספה ידנית', num: false }); });
  const payload = () => data.rows.map(r => ({ ...r }));
  const preview = async () => { applyFixes(); P = await save('POST', '/api/clients-import/preview', { rows: payload() }, { queue: false, label: 'השוואה' }); draw(); };
  const unknown = Object.keys(map).filter(h => !autoField(h) && !saved[h]);
  const grp = (k, title, n, inner, open) => `<details class="card ci-g" data-g="${k}" ${open ? 'open' : ''}><summary><b>${title}</b> <span class="pill ${k === 'pending' || k === 'phones' ? 'warn' : k === 'news' ? 'ok' : 'acc'}">${n}</span></summary>${n ? inner : '<div class="empty">אין</div>'}</details>`;
  const draw = () => {
    const c = P.counts;
    body.innerHTML = `<div class="note info">קובץ: <b>${esc(file.name)}</b> · ${c.rows} לקוחות בדוח</div>
      <details class="card" ${unknown.length ? 'open' : ''}><summary><b>שיוך עמודות</b>${unknown.length ? ` <span class="pill warn">${unknown.length} כותרות לא מזוהות</span>` : ''}</summary>
        <p class="small muted">כותרת שלא זוהתה נשמרת בכרטיס הלקוח בשמה המקורי. אפשר לשייך אותה לשדה — הבחירה נזכרת לייבוא הבא.</p>
        <div class="grid">${Object.keys(map).map(h => `<label class="f">${esc(h)}<select class="in" data-map="${esc(h)}">${Object.entries(FIELD_NAMES).map(([f, n]) => `<option value="${f}" ${map[h] === f ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`).join('')}</div></details>
      ${grp('news', 'חדשים — יתווספו', c.news, `<div class="list">${P.news.map(x => `<div class="li noc"><div class="t">${esc(x.name)}</div><div class="m">${x.extId ? `<span>מס׳ לקוח ${esc(x.extId)}</span>` : ''}<span>${esc(x.phones || 'חסר טלפון')}</span></div></div>`).join('')}</div>`, c.news > 0)}
      ${grp('changed', 'קיימים עם שינויים — יעודכנו', c.changed, P.changed.map(x => `<div class="li noc ci-ch"><div class="t">${esc(x.name)} <span class="small muted">(זוהה לפי ${esc(x.how)})</span></div><div class="m" style="flex-direction:column;align-items:stretch">${x.diffs.map(d => `<div class="ci-diff"><b>${esc(d.label)}:</b> <span class="old">${esc(d.old || '—')}</span> ← <span class="neu">${esc(d.neu)}</span>${d.conflict ? `<div class="note warn small">הערך הנוכחי תוקן ידנית. איזה ערך לשמור?<label class="row"><input type="radio" name="cf-${x.i}-${esc(d.f)}" data-cf="${x.i}|${esc(d.f)}" value="keep" ${(choice[x.i] || {})[d.f] !== 'file' ? 'checked' : ''}> הערך שתיקנתי (${esc(d.old)})</label><label class="row"><input type="radio" name="cf-${x.i}-${esc(d.f)}" data-cf="${x.i}|${esc(d.f)}" value="file" ${(choice[x.i] || {})[d.f] === 'file' ? 'checked' : ''}> הערך מהדוח (${esc(d.neu)})</label></div>` : ''}</div>`).join('')}</div></div>`).join(''), c.changed > 0)}
      ${grp('same', 'ללא שינוי', c.same, `<div class="small">${P.same.map(x => esc(x.name)).join(' · ')}</div>`)}
      ${grp('pending', 'ממתינים להכרעה', c.pending, P.pending.map(x => { const d = dec[x.i] || {}; return `<div class="card ci-p" data-pi="${x.i}" style="padding:10px"><div class="small warn-t">${esc(x.why)}</div>
          <div class="ci-side"><div class="ci-box"><div class="small muted">בדוח</div><b>${esc(x.row.name)}</b><div class="small">${x.row.extId ? 'מס׳ ' + esc(x.row.extId) + ' · ' : ''}${esc(x.row.phones || 'חסר טלפון')}${x.row.tz ? ' · ת.ז ' + esc(x.row.tz) : ''}${x.row.city ? ' · ' + esc(x.row.city) : ''}</div></div>
          ${x.cands.map(k => `<div class="ci-box ${d.a === 'link' && d.id === k.id ? 'sel' : ''}"><div class="small muted">במאגר</div><b>${esc(k.name)}</b><div class="small">${k.extId ? 'מס׳ ' + esc(k.extId) + ' · ' : ''}${esc(k.phones || 'אין טלפון')}${k.tz ? ' · ת.ז ' + esc(k.tz) : ''}${k.city ? ' · ' + esc(k.city) : ''}</div><button class="btn sm" data-dec="${x.i}|link|${esc(k.id)}">קשר ללקוח קיים</button></div>`).join('')}</div>
          <div class="row" style="margin-top:6px"><button class="btn ghost sm ${d.a === 'new' ? 'on' : ''}" data-dec="${x.i}|new">הוסף כלקוח חדש</button><button class="btn plain sm ${!d.a || d.a === 'skip' ? 'on' : ''}" data-dec="${x.i}|skip">דלג כרגע</button>
          <span class="small"><b>${d.a === 'link' ? 'יקושר ללקוח הקיים' : d.a === 'new' ? 'יתווסף כלקוח חדש' : 'ידולג (יופיע שוב בייבוא הבא)'}</b></span></div></div>`; }).join(''), c.pending > 0)}
      ${grp('phones', 'טלפונים לטיפול (אפשר להמשיך ולתקן אחר כך)', c.phoneIssues, P.phoneIssues.map(x => `<div class="li noc ci-ph" data-ri="${x.i}"><div class="t">${esc(x.name)}${x.extId ? ` <span class="small muted">מס׳ ${esc(x.extId)}</span>` : ''}</div><div class="m" style="flex-direction:column;align-items:stretch">
          ${x.missing ? `<div><span class="pill warn">חסר טלפון</span> <button class="btn ghost sm" data-fix="${x.i}|">הוסף מספר</button></div>` : ''}
          ${x.issues.map(q => `<div><span class="pill err">${esc(q.why)}</span> <span dir="ltr">${esc(q.raw)}</span> <span class="small muted">(${esc(q.src)})</span> <button class="btn ghost sm" data-fix="${x.i}|${esc(q.raw)}">תקן מספר</button></div>`).join('')}</div></div>`).join(''), c.phoneIssues > 0)}
      <div class="actionbar"><div id="ci-err"></div><button class="btn xl" id="ci-go">המשך בייבוא</button><div class="small muted">נוספים: ${c.news} · יעודכנו: ${c.changed} · להכרעה: ${c.pending} · טלפונים לטיפול: ${c.phoneIssues}. לא נוצרים חוב, גבייה או שורה בחשבון יומי.</div></div>`;
    $$('[data-map]', body).forEach(s => s.onchange = async () => { map[s.dataset.map] = s.value; saved[s.dataset.map] = s.value; await save('POST', '/api/clients-import/map', { map: saved }, { queue: false, label: 'שיוך עמודות' }).catch(() => {}); data = buildRows(table, hr, map); preview(); });
    $$('[data-cf]', body).forEach(r => r.onchange = () => { const [i, f] = r.dataset.cf.split('|'); (choice[i] ||= {})[f] = r.value; });
    $$('[data-dec]', body).forEach(b => b.onclick = () => { const [i, a, id] = b.dataset.dec.split('|'); dec[i] = { a, id }; const y = window.scrollY; draw(); window.scrollTo(0, y); });
    $$('[data-fix]', body).forEach(b => b.onclick = () => {
      const [i, raw] = b.dataset.fix.split('|'); const host = b.parentNode;
      host.insertAdjacentHTML('beforeend', `<div class="row ci-fix" style="margin-top:4px"><input class="in" dir="ltr" inputmode="tel" value="${esc(raw)}" placeholder="050-1234567" style="flex:1"><button class="btn sm">שמור</button><span class="small"></span></div>`);
      const box = host.lastElementChild, inp = $('input', box); inp.focus();
      inp.oninput = () => { const c = checkPhone(inp.value); $('span', box).textContent = inp.value.trim() ? (c.ok ? '✓ ' + c.type : c.why) : ''; };
      $('button', box).onclick = () => { const v = inp.value.trim(); if (!v) return; (fixes[i] ||= {}); if (raw) fixes[i][raw] = v; else fixes[i].__add = v; const y = window.scrollY; preview().then(() => window.scrollTo(0, y)); };
    });
    $('#ci-go', body).onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'שומר…';
      try {
        const r = await save('POST', '/api/clients-import/apply', { rows: payload(), decisions: dec, choices: choice, fileName: file.name, opId: OP }, { queue: false, label: 'ייבוא לקוחות' });
        const k = r.counts;
        body.innerHTML = `<div class="note ok"><b>הקליטה הושלמה</b> — ${when(r.at)} · ${esc(r.file)}<br>נוספו <b>${k.added}</b> · עודכנו <b>${k.updated}</b> · קושרו <b>${k.linked}</b> · ללא שינוי <b>${k.unchanged}</b> · דולגו <b>${k.skipped}</b>${k.phoneIssues ? ` · <b>${k.phoneIssues}</b> לקוחות עם טלפון לטיפול` : ''}</div>
          <a class="btn xl" href="#/clients" style="width:100%">חזרה ללקוחות</a>${k.phoneIssues ? ` <a class="btn ghost" href="#/clients?phones=1" style="width:100%;margin-top:8px">טלפונים לטיפול</a>` : ''}`;
      } catch (e) { ev.target.disabled = false; ev.target.textContent = 'המשך בייבוא'; $('#ci-err', body).innerHTML = `<div class="note err">הקליטה נכשלה — נסה שוב. ${esc(e.message || '')}</div>`; }
    };
  };
  const OP = uid();
  try { await preview(); } catch (e) { body.innerHTML = `<div class="note err">${esc(e.message || 'שגיאה')}</div>`; }
});

// ---------- לשונית ״לקוחות״: כפתור, קליטה אחרונה, תזכורת, ״טלפונים לטיפול״ ----------
const REMIND = 'הגיע הזמן לעדכן את טבלת הלקוחות. ייצא דוח לקוחות מתוכנת המחשב ובחר את הקובץ כאן';
const dismissed = (m) => { try { return sessionStorage.getItem('cimp-dismiss') === m; } catch { return false; } };
function remindHTML(st) {
  if (!st || st.done || dismissed(st.month)) return '';
  return `<div class="note warn cimp-remind" data-month="${esc(st.month)}"><b>תזכורת חודשית:</b> ${REMIND}.<div class="row" style="margin-top:6px">${pickHTML('בחר קובץ לעדכון', 'btn sm')}<button class="btn plain sm" data-cimp-later>לא עכשיו</button></div></div>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-cimp-later]'); if (!b) return; const box = b.closest('.cimp-remind'); try { sessionStorage.setItem('cimp-dismiss', box.dataset.month); } catch { /* */ } box.remove(); });

clientsTop(async (host, view, q) => {
  let st = null; try { st = await get('/api/clients-import/state'); } catch { return; }
  const last = st.last ? `קליטה אחרונה: <b>${when(st.last.at)}</b> · קובץ: <b>${esc(st.last.file || '')}</b>` : 'עוד לא נקלט דוח לקוחות';
  host.innerHTML = `${remindHTML(st)}<div class="card cimp-bar"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">${pickHTML('ייבוא ועדכון לקוחות מקובץ')}<button class="btn ghost" id="cimp-ph" aria-pressed="false">טלפונים לטיפול <span class="pill" id="cimp-n">…</span></button></div><div class="small muted" style="margin-top:6px" id="cimp-last">${last}</div></div><div id="cimp-issues"></div>`;
  let on = q && q.get('phones') === '1';
  const res = $('#cres', view), srch = $('.search', view), adv = $('#adv', view);
  const load = async () => {
    const L = await get('/api/clients-import/issues').catch(() => []);
    $('#cimp-n', host).textContent = L.length;
    $('#cimp-ph', host).setAttribute('aria-pressed', on);
    [res, srch, adv].forEach(el => { if (el) el.hidden = on; });
    const box = $('#cimp-issues', host);
    if (!on) { box.innerHTML = ''; return; }
    box.innerHTML = L.length ? `<div class="muted small" style="margin:4px 2px">${L.length} לקוחות עם טלפון לטיפול</div><div class="list">${L.map(c => `<div class="li noc" data-cid="${esc(c.id)}"><div class="t">${esc(c.name)}${c.extId ? ` <span class="small muted">מס׳ ${esc(c.extId)}</span>` : ''}</div><div class="m" style="flex-direction:column;align-items:stretch">
      ${c.missing ? `<div><span class="pill warn">חסר טלפון</span> <button class="btn ghost sm" data-pfix="${esc(c.id)}|-1|">הוסף מספר</button></div>` : ''}
      ${c.phones.map(p => p.ok ? `<div class="small">✓ ${esc(p.type)} <span dir="ltr">${esc(p.local)}</span></div>` : `<div><span class="pill err">${esc(p.why)}</span> <span dir="ltr">${esc(p.raw)}</span> <span class="small muted">(${esc(p.src || '')})</span> <button class="btn ghost sm" data-pfix="${esc(c.id)}|${p.idx}|${esc(p.raw)}">תקן מספר</button></div>`).join('')}</div></div>`).join('')}</div>` : '<div class="empty">אין טלפונים לטיפול ✓</div>';
    $$('[data-pfix]', box).forEach(b => b.onclick = () => {
      const [id, idx, raw] = b.dataset.pfix.split('|'); const host2 = b.parentNode; if (host2.querySelector('.ci-fix')) return;
      host2.insertAdjacentHTML('beforeend', `<div class="row ci-fix" style="margin-top:4px"><input class="in" dir="ltr" inputmode="tel" value="${esc(raw)}" placeholder="050-1234567" style="flex:1"><button class="btn sm">שמור</button><span class="small"></span></div>`);
      const fx = host2.lastElementChild, inp = $('input', fx); inp.focus(); const opId = uid();
      inp.oninput = () => { const c = checkPhone(inp.value); $('span', fx).textContent = inp.value.trim() ? (c.ok ? '✓ ' + c.type : c.why) : ''; };
      $('button', fx).onclick = async () => {
        try { const r = await save('POST', '/api/clients-import/phone', { id, idx: +idx, value: inp.value, opId }, { queue: false, label: 'תיקון טלפון' }); toast(r.ok ? 'המספר נשמר ונבדק ✓' : 'נשמר, אבל המספר עדיין לא תקין: ' + r.why); load(); }
        catch (e) { $('span', fx).textContent = 'השמירה נכשלה — נסה שוב'; }
      };
    });
  };
  $('#cimp-ph', host).onclick = () => { on = !on; load(); };
  load();
});

// מסך ״היום״: התזכורת החודשית (אם עוד לא עודכן החודש)
todayPanel((d, App) => {
  if (!App.can || !App.can.finance) return '';
  setTimeout(async () => { const el = document.getElementById('cimp-today'); if (!el) return; try { const st = await get('/api/clients-import/state'); el.innerHTML = remindHTML(st); } catch { /* */ } }, 0);
  return '<div id="cimp-today"></div>';
});
