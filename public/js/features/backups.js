// גיבוי מלא ושחזור (app.html 5372-5568): גיבוי אוטומטי יומי בשרת, ״גיבוי מלא עכשיו״, רשימה עם הורדה ומחיקה,
// שחזור מגיבוי שמור או מקובץ עם בחירה לפי סוג. שחזור לא מוחק כלום, ולפניו נשמר גיבוי של המצב הנוכחי. בעל התוכנה בלבד.
import { route, more } from '../registry.js';
import { get, save } from '../api.js';
import { $, $$, esc, toast } from '../ui.js';
import { App } from '../app.js';

const bkWhen = iso => { try { const d = new Date(iso); return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); } catch { return String(iso || ''); } };
const bkSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const NAMES = { accounts: 'חשבונות', loans: 'הלוואות', loan_requests: 'בקשות להלוואה', clients: 'לקוחות במאגר', contracts: 'חוזים', settings: 'הגדרות', files: 'קבצים' };
const countTxt = c => c ? Object.entries(c).filter(([k, v]) => v || k === 'accounts').map(([k, v]) => v + ' ' + (NAMES[k] || k)).join(' · ') : '';

let RS = null; // שחזור פתוח: {label, id|uploadId, pv, sel, arm}
let delFor = null;

async function renderBackups(view) {
  if (!App.can.restore) { view.innerHTML = '<div class="band"><div class="grow"><h1>גיבוי מלא</h1></div></div><div class="note err">רק בעל התוכנה יכול לגבות ולשחזר.</div>'; return; }
  RS = null; delFor = null;
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">בעל התוכנה בלבד</div><h1>גיבוי מלא ושחזור</h1></div></div>
  <div class="card"><div class="row sp"><b>גיבוי מלא של כל התוכנה</b><span class="small muted" id="bk-state"></span></div>
    <p class="small muted" style="margin:4px 0 8px">חשבונות, הלוואות, בקשות, מאגר לקוחות, חוזים (כולל חתימות וצילומי ת.ז. ששמורים בתוכנה) והגדרות. הגיבוי נשמר בשרת של התוכנה, ואפשר גם להוריד אותו לקובץ. גיבוי אוטומטי נשמר פעם ביום, ונשמרים 60 הגיבויים האחרונים. שחזור לא מוחק כלום: מה שנוסף אחרי הגיבוי נשאר, ולפני השחזור נשמר אוטומטית גיבוי של המצב הנוכחי.</p>
    <div class="row"><button class="btn" type="button" id="bk-now">גיבוי מלא עכשיו</button><label class="btn ghost" id="bk-file-l">שחזור מקובץ גיבוי<input type="file" id="bk-in" accept=".json,application/json" hidden></label><a class="btn plain sm" href="/api/backup">הורדת גיבוי עדכני לקובץ</a></div>
    <div class="note" id="bk-msg" role="status" aria-live="polite" hidden></div>
    <div class="card" id="bk-restore" hidden style="margin-top:10px;border:2px solid var(--gold,#b8913f)"></div>
  </div>
  <div class="card"><h2>גיבויים שמורים</h2><div class="list" id="bk-list"><div class="empty">טוען…</div></div></div>`;
  let L = [];
  const msg = (cls, html) => { const m = $('#bk-msg', view); m.hidden = !html; m.className = 'note ' + (cls || 'info'); m.innerHTML = html || ''; };
  const load = async () => { const o = await get('/api/backups'); L = o.list; draw(); };
  const draw = () => {
    $('#bk-state', view).textContent = L.length ? 'גיבוי אחרון: ' + bkWhen(L[0].at) + ' · ' + L.length + ' גיבויים שמורים' : 'עוד אין גיבוי מלא. הגיבוי האוטומטי נשמר פעם ביום.';
    $('#bk-list', view).innerHTML = L.length ? L.map(b => `<div class="li noc" data-bid="${esc(b.id)}"><div class="t"><b>${esc(bkWhen(b.at))}</b> <span class="pill ${b.auto ? '' : 'acc'}">${esc(b.reason || (b.auto ? 'אוטומטי' : 'ידני'))}</span></div>
      <div class="a small muted">${bkSize(b.size)}</div><div class="m"><span>${esc(countTxt(b.counts))}</span>${b.by ? `<span>${esc(b.by)}</span>` : ''}</div>
      <div class="row" style="grid-column:1/-1;margin-top:6px"><button class="btn ghost sm" type="button" data-bk="restore">שחזור</button><a class="btn plain sm" href="/api/backups/${encodeURIComponent(b.id)}/download" data-bk="dl">הורדה לקובץ</a>
      ${delFor === b.id ? '<span class="row"><span>למחוק את הגיבוי?</span><button class="btn danger sm" type="button" data-bk="delyes">כן, מחק</button><button class="btn plain sm" type="button" data-bk="delno">ביטול</button></span>' : '<button class="btn plain sm" type="button" data-bk="del" aria-label="מחיקת הגיבוי">מחיקה</button>'}</div></div>`).join('') : '<div class="empty">אין גיבויים שמורים</div>';
    drawRs();
  };
  const drawRs = () => {
    const box = $('#bk-restore', view); box.hidden = !RS; if (!RS) { box.innerHTML = ''; return; }
    box.innerHTML = `<b>שחזור מגיבוי ${esc(RS.label)}</b><p class="small muted" style="margin:4px 0">השחזור מחזיר כל פריט שבגיבוי לגרסה שבגיבוי. שום דבר לא נמחק: מה שנוסף אחרי הגיבוי נשאר. לפני השחזור נשמר אוטומטית גיבוי של המצב הנוכחי.</p>
      <div class="list">${RS.pv.map(p => `<label class="li noc" style="cursor:pointer"><div class="t">${p.info ? '' : `<input type="checkbox" class="ck" data-bk-col="${esc(p.k)}" ${RS.sel[p.k] ? 'checked' : ''} ${p.n ? '' : 'disabled'}> `}<b>${esc(p.l)}</b></div><div class="a small">${p.n} בגיבוי</div>
        <div class="m small muted">${p.info ? (p.add ? p.add + ' חסרים — יתווספו עם שחזור החוזים' : 'כולם כבר קיימים') : (p.n ? [p.chg && p.chg + ' יחזרו לגרסה מהגיבוי', p.add && p.add + ' יתווספו מחדש', p.same && p.same + ' זהים'].filter(Boolean).join(' · ') || '—' : 'אין בגיבוי')}</div></label>`).join('')}</div>
      ${RS.arm ? '<div class="row" style="margin-top:8px"><span>לשחזר את הפריטים שסימנת?</span><button class="btn danger" type="button" data-bk="yes">כן, שחזר</button><button class="btn plain" type="button" data-bk="cancel">ביטול</button></div>'
        : `<div class="row" style="margin-top:8px"><button class="btn" type="button" data-bk="arm" ${Object.values(RS.sel).some(Boolean) ? '' : 'disabled'}>שחזור</button><button class="btn plain" type="button" data-bk="cancel">ביטול</button></div>`}`;
  };
  const openRs = (label, src, pv) => {
    const sel = {}; pv.forEach(p => { if (!p.info) sel[p.k] = p.n > 0 && (p.chg > 0 || p.add > 0); });
    RS = { label, ...src, pv, sel, arm: false }; drawRs(); $('#bk-restore', view).scrollIntoView({ block: 'center' });
  };
  view.addEventListener('change', e => { const c = e.target.closest('[data-bk-col]'); if (c && RS) { RS.sel[c.dataset.bkCol] = c.checked; RS.arm = false; drawRs(); } });
  $('#bk-in', view).onchange = async function () {
    const f = this.files && this.files[0]; this.value = ''; if (!f) return;
    msg('info', 'קורא את הקובץ…');
    try {
      const r = await fetch('/api/backups/upload', { method: 'POST', body: await f.text(), credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error === 'בקשה לא תקינה' ? 'הקובץ הזה הוא לא קובץ גיבוי מלא של התוכנה.' : (j.error || 'שגיאה'));
      msg('', ''); openRs('מקובץ ' + f.name + (j.at ? ' (' + bkWhen(j.at) + ')' : '') + ' · ' + j.source, { uploadId: j.uploadId }, j.preview);
    } catch (e) { msg('err', esc(e.message)); }
  };
  $('#bk-now', view).onclick = async (ev) => {
    const b = ev.target; b.disabled = true; msg('info', 'שומר גיבוי מלא…');
    try { const m = await save('POST', '/api/backups', {}, { label: 'גיבוי מלא', queue: false }); msg('ok', '✓ הגיבוי נשמר (' + esc(countTxt(m.counts)) + `). <a href="/api/backups/${encodeURIComponent(m.id)}/download">הורדה לקובץ</a>`); await load(); }
    catch (e) { msg('err', 'הגיבוי לא נשמר: ' + esc(e.message) + '. שום נתון לא השתנה.'); }
    finally { b.disabled = false; }
  };
  view.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-bk]'); if (!b || b.disabled) return;
    const a = b.dataset.bk, row = b.closest('[data-bid]'), bid = row && row.dataset.bid;
    if (a === 'dl') return;
    if (a === 'restore') {
      msg('info', 'טוען את הגיבוי…');
      try { const o = await save('POST', '/api/backups/preview', { id: bid }, { queue: false, label: 'טעינת גיבוי' }); msg('', ''); openRs(bkWhen(L.find(x => x.id === bid)?.at), { id: bid }, o.preview); }
      catch (e) { msg('err', 'לא הצלחתי לטעון את הגיבוי הזה: ' + esc(e.message)); }
    } else if (a === 'cancel') { RS = null; drawRs(); }
    else if (a === 'arm') { if (RS) { RS.arm = true; drawRs(); } }
    else if (a === 'yes') {
      const rs = RS; if (!rs) return; const cols = Object.keys(rs.sel).filter(k => rs.sel[k]); if (!cols.length) return;
      b.disabled = true; msg('info', 'שומר קודם גיבוי של המצב הנוכחי, ואז משחזר…');
      try {
        const r = await save('POST', '/api/backups/restore', { id: rs.id, uploadId: rs.uploadId, cols }, { queue: false, label: 'שחזור מגיבוי' });
        RS = null;
        msg(r.fail ? 'warn' : 'ok', (r.fail ? 'השחזור הסתיים חלקית: ' + r.done + ' פריטים שוחזרו, ' + r.fail + ' נכשלו.' : '✓ השחזור הושלם: ' + r.done + ' פריטים הוחזרו לגרסה שבגיבוי') + (r.same ? ' · ' + r.same + ' כבר היו זהים' : '') + (r.files ? ' · ' + r.files + ' קבצים נוספו' : '') + '. הגיבוי של המצב שלפני השחזור שמור ברשימה.');
        await load();
      } catch (e) { b.disabled = false; msg('err', 'השחזור לא בוצע: ' + esc(e.message) + '. שום נתון לא השתנה.'); }
    } else if (a === 'del') { delFor = bid; draw(); }
    else if (a === 'delno') { delFor = null; draw(); }
    else if (a === 'delyes') { delFor = null; try { await save('DELETE', '/api/backups/' + encodeURIComponent(bid), {}, { queue: false, label: 'מחיקת גיבוי' }); toast('הגיבוי נמחק'); } catch (e) { toast('המחיקה נכשלה: ' + e.message); } await load(); }
  });
  await load();
}

route('backups', renderBackups);
more({ href: '#/backups', label: 'גיבוי מלא ושחזור', can: A => A.can.restore, order: 4 });
