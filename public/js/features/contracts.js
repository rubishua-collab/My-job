// חוזים לחתימה (היתר עסקה, חוזה אחר, טופס הזמנה): רשימה, חיפוש, יצירה ועריכה, שליחה בוואטסאפ, צפייה בחוזה החתום ובקבצים.
// העתק של לשונית ״חוזים לחתימה״ בתוכנה המקורית (app.html 1531-1686, 8575-8808, 9189-9221). הלקוח חותם בדף נפרד: /sign.html
import { route, more } from '../registry.js';
import { get, save } from '../api.js';
import { $, $$, toast } from '../ui.js';
import { App, onLive } from '../app.js';
import { normName } from '../phone.js';
import {
  esc, SG_STAT, SG_STAT_T, sgPer, sgFmtNum, sgFmtG, sgTokenValue, sgNm, sgIsOther, sgNormPhone, sgWaLink, sgWhen, sgReadSigned, sgCanon, sgDLink,
  sgExpandSent, sgDefaultTemplate, sgBuildPdf, sgFileBase, sgSafeName, downloadBlob, blobToDataURL,
} from './contracts-core.js';
import { SG, renderEditor, formCss, sgLinkOf, sgLinkMsg, sgPdfOf, busyOn } from './contracts-form.js';
import { fxOwnIds } from './contracts-fx.js';

const L = { only: null, q: '', openFiles: {}, delFor: null, regenFor: null, settings: null, view: null, pendingRecv: null };
const owner = () => App.me && App.me.role === 'owner';
const fileUrl = id => '/api/files/' + encodeURIComponent(id);
const lastFile = (r, field) => (r.files || []).filter(f => f.field === field).pop();
const linkOf = r => r.link || sgLinkOf(SG.base, r.pt);
const waHref = r => linkOf(r) ? ' href="' + esc(sgWaLink(r.d.q, sgLinkMsg(r.d, linkOf(r), r.vcode))) + '"' : ' aria-disabled="true"';
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (x) { return false; } } }

async function load() {
  const o = await get('/api/sign/list');
  SG.recs = o.items; SG.base = o.base; L.drive = o.drive;
  return SG.recs;
}

/* ---------- רשומה ברשימה (sgRecHTML, 8652) ---------- */
function recHTML(r) {
  const d = r.d, st = SG_STAT[r.status] ? r.status : 'draft', P = sgPer(d.fq), oth = sgIsOther(d), nm = sgNm(d);
  const pdf = lastFile(r, 'pdf'), sig = lastFile(r, 'sig'), ids = ['id1', 'id2'].map(k => lastFile(r, k)).filter(Boolean), own = fxOwnIds(r);
  let h = '<div class="sg-rec' + (r.id === SG.just ? ' just' : '') + '" data-id="' + esc(r.id) + '"><div class="sg-hd"><div><div class="sg-nm">' + esc(nm || d.o) + '</div>' +
    '<div class="sg-meta">' + (nm ? '<span>' + esc(d.o) + '</span>' : '') + (oth ? (d.kd === 'o' && nm ? '<span>חוזה</span>' : '') : (nm ? '<span>היתר עסקה</span>' : '') + '<span class="num">' + esc(sgFmtNum(d.a)) + ' ' + esc(d.c) + '</span><span>פירעון ' + esc(d.r ? sgFmtG(d.r) : '') + '</span><span>' + esc(d.n || 1) + ' תשלומים ' + (d.fq === 'w' ? 'שבועיים' : 'חודשיים') + ' · ' + esc(sgTokenValue(P.tok, d)) + ' ' + P.per + '</span>') +
    '<span dir="ltr">' + esc(d.q || '') + '</span>' + (r.signedAt ? '<span>נחתם ' + esc(sgFmtG(r.signedAt.slice(0, 10))) + '</span>' : (r.sentAt ? '<span>נשלח ' + esc(sgFmtG(r.sentAt.slice(0, 10))) + '</span>' : '')) + '</div></div>' +
    '<span class="sg-st ' + st + '" title="' + esc(SG_STAT_T[st]) + '">' + SG_STAT[st] + '</span></div>';
  if (r.signer) h += '<div class="sg-signed"><b>נחתם</b> · ' + esc(sgWhen(r.signer.when, r.signer.tz)) + ' · טלפון החותם: <span class="num">' + esc(r.signer.phone) + '</span> · ' + esc(r.signer.name) + (r.signer.id ? ' · ת.ז. <span class="num">' + esc(r.signer.id) + '</span>' : '') + (r.signer.fp ? ' · טביעת מסמך <span class="num">' + esc(r.signer.fp) + '</span>' : '') + '</div>' +
    (r.gsDiff ? '<div class="note warn small">פרטי החוזה שנחתם שונים מהחוזה ששמור כאן (אולי החוזה נערך אחרי השליחה). הנוסח שנחתם נמצא בקובץ ה-PDF החתום.</div>' : '');
  if (r.gsErr) h += '<div class="note warn small">הגיבוי ל-Google Drive לא הושלם: ' + esc(r.gsErr) + '</div>';
  h += '<div class="sg-acts">';
  if (r.signer || pdf || r.status === 'signed') {
    h += pdf ? '<a class="btn sm" target="_blank" rel="noopener" href="' + fileUrl(pdf.id) + '" data-act="vpdf">צפייה בחוזה החתום</a>'
      : (r.signer && sig ? '<button type="button" class="btn sm" data-act="spdf">PDF של החוזה החתום</button>' : '');
    if (sig || ids.length || own.length) h += '<button type="button" class="btn ghost sm" data-act="files" aria-expanded="' + (!!L.openFiles[r.id]) + '">' + (L.openFiles[r.id] ? 'הסתרת החתימה והת.ז.' : 'הצגת החתימה ותעודת הזהות') + (ids.length + own.length > 1 ? ' (' + (ids.length + own.length) + ')' : '') + '</button>';
    if (r.gs && r.gs.pdf) h += '<a class="btn plain sm" target="_blank" rel="noopener" href="' + esc(r.gs.pdf) + '">ב-Google Drive</a>';
  } else if (own.length) h += '<button type="button" class="btn ghost sm" data-act="files" aria-expanded="' + (!!L.openFiles[r.id]) + '">' + (L.openFiles[r.id] ? 'הסתרת הת.ז.' : 'צפייה בתעודת זהות') + '</button>';
  if (linkOf(r)) {
    h += '<a class="btn wa sm" data-act="sent" target="_blank" rel="noopener"' + waHref(r) + '>' + (r.signer ? 'שליחה שוב בוואטסאפ' : 'שליחה בוואטסאפ') + '</a>';
    h += '<button type="button" class="btn ghost sm" data-act="copymsg">העתקת ההודעה</button><button type="button" class="btn ghost sm" data-act="copylink">העתקת הקישור</button>';
    h += '<span class="small muted">קוד אימות: <b class="num">' + esc(r.vcode || '') + '</b></span>';
  } else h += '<button type="button" class="btn wa sm" data-act="mklink" title="החוזה נשלח מהתוכנה הקודמת. ייווצר קישור לדף החתימה החדש">יצירת קישור חתימה</button>';
  h += '<button type="button" class="btn ghost sm" data-act="pdf">קובץ PDF</button>';
  h += '<a class="btn ghost sm" href="#/contracts-manage/edit/' + encodeURIComponent(r.id) + '">עריכה</a>';
  h += '<button type="button" class="btn plain sm" data-act="dup">שכפול</button>';
  if (L.drive && (pdf || sig)) h += '<button type="button" class="btn plain sm" data-act="drive">גיבוי ל-Drive</button>';
  if (linkOf(r)) h += '<button type="button" class="btn plain sm" data-act="regen">קישור חדש</button>';
  h += '<label class="small muted" style="display:inline-flex;gap:6px;align-items:center">סטטוס<select class="in" data-act="status" aria-label="סטטוס החוזה">' + Object.keys(SG_STAT).map(k => '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + SG_STAT[k] + '</option>').join('') + '</select></label>';
  if (owner()) h += '<button type="button" class="btn danger sm" data-act="del">מחיקה לצמיתות</button>';
  h += '</div>';
  if (L.openFiles[r.id]) h += filesHTML(r, sig, ids, own);
  if (L.regenFor === r.id) h += '<div class="note warn"><div>ליצור קישור וקוד אימות חדשים? הקישור הקודם יפסיק לעבוד.</div><div class="row" style="margin-top:6px"><button class="btn sm" type="button" data-act="regenyes">כן, קישור חדש</button><button class="btn plain sm" type="button" data-act="regenno">ביטול</button></div></div>';
  if (owner() && L.delFor === r.id) h += '<div class="note err"><div>למחוק לצמיתות את ' + (nm ? '״' + esc(nm) + '״ של ' : 'החוזה של ') + esc(d.o) + '? אחרי המחיקה הקישור ללקוח מפסיק לעבוד.' + ((r.files || []).length ? ' גם ' + r.files.length + ' הקבצים (חתימה, צילומי ת.ז., PDF) יימחקו.' : '') + '</div><div class="row" style="margin-top:6px"><button class="btn danger sm" type="button" data-act="delyes">כן, מחק</button><button class="btn plain sm" type="button" data-act="delno">ביטול</button></div></div>';
  return h + '</div>';
}
function filesHTML(r, sig, ids, own) {
  const img = (f, label) => '<div><span class="small muted">' + esc(label) + ' · <a href="' + fileUrl(f.id || f.fileId) + '" target="_blank" rel="noopener">פתיחה</a></span><img src="' + fileUrl(f.id || f.fileId) + '" alt="' + esc(label) + '" loading="lazy"></div>';
  let h = '<div class="sg-files">';
  if (sig) h += img(sig, 'החתימה');
  ids.forEach((f, i) => { h += img(f, i === 0 ? 'תעודת זהות, צד קדמי' : 'ספח / צד אחורי'); });
  own.forEach(x => { h += img(x, x.side === 'back' ? 'הסריקה שלך: ספח' : 'הסריקה שלך: צד קדמי'); });
  if (r.gs) h += ['id1', 'id2', 'sig'].filter(k => r.gs[k]).map(k => '<a class="small" target="_blank" rel="noopener" href="' + esc(r.gs[k]) + '">' + ({ id1: 'ת.ז. ב-Drive', id2: 'ספח ב-Drive', sig: 'חתימה ב-Drive' })[k] + '</a>').join(' · ');
  if (r.signer) h += '<div class="small muted" style="flex-basis:100%">נחתם ' + esc(sgWhen(r.signer.when, r.signer.tz)) + ' · טלפון החותם <span class="num">' + esc(r.signer.phone) + '</span> · טביעת מסמך <span class="num">' + esc(r.signer.fp || '') + '</span></div>';
  return h + '</div>';
}
function sendNowHTML(r) {
  const d = r.d, copy = '<button type="button" class="btn ghost sm" data-act="copymsg">העתקת ההודעה</button>';
  if (SG.justSent) return '<div class="card sg-sendnow sg-rec" data-id="' + esc(r.id) + '"><div><h3 style="margin:0">החוזה של ' + esc(d.o) + ' נשמר ונשלח בוואטסאפ</h3>' +
    '<p class="small muted" style="margin:2px 0 0">הוא מופיע ברשימה למטה. אם ההודעה לא נשלחה, אפשר לשלוח שוב.</p></div>' +
    '<div class="row"><a class="btn ghost" data-act="sent" target="_blank" rel="noopener"' + waHref(r) + '>שליחה שוב בוואטסאפ</a><button type="button" class="btn plain sm" data-act="closesend">סגירה</button>' + copy + '</div></div>';
  return '<div class="card sg-sendnow sg-rec" data-id="' + esc(r.id) + '"><div><h3 style="margin:0">החוזה של ' + esc(d.o) + ' נשמר</h3>' +
    '<p class="small muted" style="margin:2px 0 0">הוא מופיע ברשימה למטה. לחיצה אחת פותחת וואטסאפ למספר <span dir="ltr">' + esc(d.q) + '</span> עם ההודעה מוכנה.</p></div>' +
    '<div class="row"><a class="btn wa" data-act="sent" target="_blank" rel="noopener"' + waHref(r) + '>שליחה בוואטסאפ</a><button type="button" class="btn plain sm" data-act="closesend">סגירה</button>' + copy + '</div></div>';
}

/* ---------- חיפוש (sgQMatch, 8686) ---------- */
const SG_FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const sgQNorm = s => normName(String(s == null ? '' : s).replace(/[־\-–—_.,]/g, ' ')).replace(/[֑-ֽֿ-ׇ]/g, '').replace(/[ךםןףץ]/g, c => SG_FIN[c]);
function sgQMatch(r, q) {
  const d = r && r.d; if (!d) return false;
  const toks = sgQNorm(q).split(' ').filter(Boolean);
  if (toks.length) { const nm = sgQNorm(d.o) + ' ' + sgQNorm(d.nm || '') + ' ' + sgQNorm(d.i || ''); if (toks.every(t => nm.indexOf(t) >= 0)) return true; }
  const raw = String(q || ''), qd = raw.replace(/\D/g, '');
  if (qd.length >= 3 && !/[^\d\s\-+().]/.test(raw)) return sgNormPhone(d.q).indexOf(sgNormPhone(qd)) >= 0 || String(d.d || '').replace(/\D/g, '').indexOf(qd) >= 0;
  return false;
}
const sgQDate = r => { const t = String((r.d && r.d.t) || ''); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : String(r.created || '').slice(0, 10); };

function drawList() {
  const view = L.view; if (!view || !$('#sg-recs', view)) return;
  const q = L.q.trim();
  let rows = SG.recs.slice();
  // קישור ישיר לחוזה אחד (#/contracts-manage/view/<id>, למשל מכרטיס הלקוח)
  const only = L.only && SG.recs.find(r => r.id === L.only);
  if (only) rows = [only];
  else if (q) rows = rows.filter(r => sgQMatch(r, q)).sort((a, b) => (sgQDate(b) + b.created).localeCompare(sgQDate(a) + a.created));
  else rows.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const cnt = SG.recs.length, by = k => SG.recs.filter(r => (SG_STAT[r.status] ? r.status : 'draft') === k).length;
  $('#sg-n', view).textContent = cnt ? (by('draft') + ' ממתינים · ' + by('sent') + ' נשלחו · ' + by('signed') + ' נחתמו') : '';
  $('#sg-qinfo', view).textContent = q ? (rows.length === 1 ? 'נמצא חוזה אחד' : 'נמצאו ' + rows.length + ' חוזים') : '';
  const j = SG.just && SG.recs.find(x => x.id === SG.just);
  let body = '';
  if (q && rows.length) {
    const groups = new Map(); rows.forEach(r => { const k = sgQNorm(r.d.o) || '\u0000'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    groups.forEach(list => { if (list.length > 1) body += '<div class="sg-qgrp">' + esc(list[0].d.o || 'ללא שם') + ' · ' + list.length + ' חוזים, מהחדש לישן</div>'; list.forEach(r => { body += recHTML(r); }); });
  } else body = rows.map(recHTML).join('');
  $('#sg-recs', view).innerHTML = (only ? '<div class="note info row sp"><span>מוצג חוזה אחד מתוך ' + cnt + '</span><a class="btn plain sm" href="#/contracts-manage" data-act-all="1">כל החוזים</a></div>' : (L.only ? '<div class="note warn">החוזה לא נמצא (אולי נמחק). מוצגים כל החוזים.</div>' : '')) + (j ? sendNowHTML(j) : '') + (body || '<div class="empty">' + (cnt ? 'לא נמצאו חוזים עבור השם שהוזן' : 'עוד אין חוזים שמורים. לחץ ״+ חוזה חדש״ כדי להתחיל.') + '</div>');
}

async function updateStatus(id, status) { try { await save('POST', '/api/sign/' + encodeURIComponent(id) + '/status', { status }, { label: 'סטטוס חוזה' }); toast('הסטטוס עודכן: ' + SG_STAT[status]); } catch (e) { toast('העדכון נכשל: ' + e.message); } await refresh(); }
async function refresh() { try { await load(); } catch (e) { /* */ } drawList(); }

// PDF של חוזה חתום שאין לו קובץ PDF שמור (sgSignedPdf, 8828): נבנה מחדש מהחתימה ומצילומי הת״ז השמורים
async function signedPdf(r) {
  const done = busyOn('מכין את החוזה החתום…');
  try {
    const g = r.signer, fetchD = async f => f ? blobToDataURL(await (await fetch(fileUrl(f.id), { credentials: 'same-origin' })).blob()) : '';
    const sig = await fetchD(lastFile(r, 'sig')), ids = [];
    for (const k of ['id1', 'id2']) { const f = lastFile(r, k); if (f) ids.push(await fetchD(f)); }
    let d = r.d; try { if (r.sd) { d = await sgExpandSent(JSON.parse(r.sd), r.d); if (!d.k && !sgIsOther(d)) d.k = sgDefaultTemplate(d); } } catch (e) { /* */ }
    const res = await sgBuildPdf(d, { name: g.name, id: g.id, phone: g.phone, when: new Date(g.when), tz: g.tz, fp: g.fp, sig, ids });
    downloadBlob(res.blob, sgFileBase(r.d) + ' חתום - ' + sgSafeName(g.name || r.d.o) + '.pdf');
  } catch (e) { toast('לא הצלחנו להכין את החוזה החתום. נסה שוב.'); }
  finally { done(); }
}

async function onListClick(ev) {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const card = el.closest('[data-id]'), id = card && card.getAttribute('data-id'), r = SG.recs.find(x => x.id === id);
  if (!r) return; const act = el.getAttribute('data-act');
  if (act === 'status' || act === 'vpdf') return;
  if (act === 'sent') { if (el.getAttribute('aria-disabled') === 'true') { ev.preventDefault(); return; } if (r.status === 'draft' || !r.status) save('POST', '/api/sign/' + encodeURIComponent(id) + '/sent', {}, { label: 'סימון נשלח' }).then(refresh).catch(() => {}); return; }
  if (act === 'closesend') { SG.just = null; drawList(); return; }
  if (act === 'copymsg') { const ok = await copyText(sgLinkMsg(r.d, linkOf(r), r.vcode)); toast(ok ? 'ההודעה עם הקישור הועתקה. הדבק אותה בוואטסאפ של ' + r.d.o : 'ההעתקה נחסמה'); return; }
  if (act === 'copylink') { const ok = await copyText(linkOf(r)); toast(ok ? 'הקישור הועתק. קוד האימות: ' + r.vcode : 'ההעתקה נחסמה'); return; }
  if (act === 'mklink' || act === 'regenyes') {
    try { await save('POST', '/api/sign/' + encodeURIComponent(id) + '/link', { regen: act === 'regenyes' }, { label: 'קישור חתימה', queue: false }); L.regenFor = null; toast(act === 'regenyes' ? 'נוצרו קישור וקוד חדשים. הקישור הקודם בוטל.' : 'נוצר קישור לדף החתימה. אפשר לשלוח.'); }
    catch (e) { toast(e.message); }
    return refresh();
  }
  if (act === 'regen') { L.regenFor = id; drawList(); return; }
  if (act === 'regenno') { L.regenFor = null; drawList(); return; }
  if (act === 'pdf') { sgPdfOf(r.d, r.d.o); return; }
  if (act === 'spdf') { signedPdf(r); return; }
  if (act === 'files') { L.openFiles[id] = !L.openFiles[id]; drawList(); return; }
  if (act === 'dup') { const d = JSON.parse(JSON.stringify(r.d)); delete d.vh; L.dup = d; location.hash = '#/contracts-manage/dup'; return; }
  if (act === 'drive') { el.disabled = true; try { const o = await save('POST', '/api/sign/' + encodeURIComponent(id) + '/drive', {}, { label: 'גיבוי ל-Drive', queue: false }); toast(o.ok ? 'הקבצים גובו ל-Google Drive' : 'הגיבוי לא הושלם: ' + (o.errors || []).join(', ')); } catch (e) { toast(e.message); } return refresh(); }
  if (act === 'del') { L.delFor = id; drawList(); return; }
  if (act === 'delno') { L.delFor = null; drawList(); return; }
  if (act === 'delyes') {
    try { await save('DELETE', '/api/sign/' + encodeURIComponent(id), {}, { label: 'מחיקת חוזה', queue: false }); } catch (e) { return toast('המחיקה נכשלה: ' + e.message); }
    L.delFor = null; if (SG.just === id) SG.just = null; toast('החוזה נמחק לצמיתות'); return refresh();
  }
}
function onListChange(ev) {
  const el = ev.target.closest('select[data-act="status"]'); if (!el) return;
  const id = el.closest('[data-id]').getAttribute('data-id'); updateStatus(id, el.value);
}

/* ---------- קבלת חוזה חתום מקובץ PDF של הלקוח (sgReceive, 9190) ---------- */
function recvMsg(cls, html) { const o = $('#sg-recv-out'); o.hidden = !html; o.className = 'note ' + cls; o.innerHTML = html || ''; }
async function receive(file, force) {
  if (!file) return;
  if (!owner()) { recvMsg('err', 'רק בעל התוכנה יכול לקבל חוזים חתומים.'); return; }
  recvMsg('info', 'קורא את הקובץ…');
  try {
    const o = await sgReadSigned(file);
    if (!o) { recvMsg('err', 'הקובץ הזה לא נוצר בדף החתימה, ולכן אין בו פרטי חתימה. בקש מהלקוח לשלוח את הקובץ שנשמר אחרי החתימה.'); return; }
    const sentD = JSON.parse(o.sent || '{}');
    let r = o.c ? SG.recs.find(x => x.id === o.c) : null;
    if (!r && sentD.vh) r = SG.recs.find(x => x.d && x.d.vh === sentD.vh);
    if (!r) { recvMsg('err', 'החוזה של ' + esc(sentD.o || 'הלקוח') + ' לא נמצא ברשימת החוזים בתוכנה.'); return; }
    const sentX = await sgExpandSent(sentD, r.d), same = sgCanon(sgDLink(sentX)) === sgCanon(sgDLink(r.d));
    if (!same && !force) {
      const keys = { nm: 'שם החוזה', kd: 'סוג החוזה', o: 'שם הלקוח', q: 'טלפון', a: 'סכום', p: 'רווח', n: 'מספר תשלומים', mo: 'סכום תשלום', fq: 'סוג ההחזר', t: 'תאריך', r: 'פירעון', k: 'נוסח החוזה', i: 'משקיע', d: 'ת.ז.', l: 'מקום' };
      const a = sgDLink(sentX), b = sgDLink(r.d), diff = Object.keys(keys).filter(k => sgCanon(a[k]) !== sgCanon(b[k])).map(k => keys[k]);
      L.pendingRecv = file;
      recvMsg('warn', '<b>פרטי החוזה החתום לא תואמים לחוזה ששמור בתוכנה</b> (' + esc(diff.join(', ') || 'פרטים') + '). ייתכן שערכת את החוזה אחרי השליחה, או שהקישור שונה. החתימה לא נשמרה.<div class="row" style="margin-top:8px"><button class="btn danger sm" type="button" id="sg-recv-force">שמור את החתימה בכל זאת</button></div>');
      return;
    }
    const s = o.s;
    const signer = { name: String(s.name || ''), id: String(s.id || ''), phone: String(s.phone || ''), when: String(s.when || ''), tz: String(s.tz || ''), fp: String(s.fp || '') };
    await save('POST', '/api/sign/' + encodeURIComponent(r.id) + '/receive', { pdf: await blobToDataURL(file), sig: s.sig || '', ids: (s.ids || []).slice(0, 2), signer, sd: o.sent || '' }, { label: 'קבלת חוזה חתום', queue: false });
    L.openFiles[r.id] = true;
    recvMsg('ok', '✓ החוזה של ' + esc(r.d.o) + ' סומן ״נחתם״. נשמרו הקובץ החתום, התאריך והשעה (' + esc(sgWhen(signer.when, signer.tz)) + ') ומספר הטלפון ' + esc(signer.phone) + '.' + (same ? '' : ' שים לב: פרטי החוזה שנחתם שונים מהחוזה השמור.'));
    toast('החוזה של ' + r.d.o + ' נחתם');
    await refresh();
  } catch (e) { recvMsg('err', 'לא הצלחתי לקרוא את הקובץ. ודא שזה קובץ ה-PDF שהלקוח שלח, בלי שינוי.' + (e && e.message ? ' (' + esc(e.message) + ')' : '')); }
}

/* ---------- הגדרות: כתובת ציבורית וגיבוי ל-Google Drive ---------- */
const GAS_SAMPLE = `function doPost(e) {
  var o = JSON.parse(e.postData.contents);
  if (o.secret !== PropertiesService.getScriptProperties().getProperty('SECRET')) return out({ok:false, error:'secret'});
  var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(o.base64), o.mimeType, o.name));
  return out({ok:true, id:f.getId(), url:f.getUrl()});
}
function out(x) { return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON); }`;
function settingsHTML(s) {
  return `<details class="card"><summary>הגדרות: קישור לדף החתימה וגיבוי ל-Google Drive</summary>
    <p class="small">הקישור שהלקוח מקבל: <b class="num" dir="ltr">${esc(s.base)}/sign.html#…</b>${s.publicUrl ? '' : '<br><span class="neg">PUBLIC_URL לא מוגדר בשרת — הקישור נבנה מהכתובת שממנה פתחת את התוכנה. כדי שהלקוח יוכל לפתוח אותו, הגדר PUBLIC_URL (כתובת https ציבורית).</span>'}</p>
    <p class="small muted">הקבצים החתומים (PDF, חתימה, צילומי ת״ז) נשמרים תמיד באפליקציה. גיבוי נוסף ל-Google Drive: רק אם מגדירים כתובת Apps Script.</p>
    ${s.fromEnv ? '<div class="note info">כתובת הגיבוי מוגדרת בשרת (CONTRACTS_GAS_URL).</div>' : ''}
    <label class="f">כתובת Apps Script (https://script.google.com/macros/s/…/exec)<input class="in n" id="sg-gasUrl" value="${esc(s.gasUrl)}" ${s.owner && !s.fromEnv ? '' : 'disabled'}></label>
    <label class="f" style="margin-top:8px">סיסמה משותפת (SECRET בסקריפט)${s.hasSecret ? ' · מוגדרת' : ''}<input class="in n" id="sg-gasSecret" type="password" autocomplete="new-password" placeholder="${s.hasSecret ? 'השאר ריק כדי לא לשנות' : ''}" ${s.owner && !s.fromEnv ? '' : 'disabled'}></label>
    ${s.owner && !s.fromEnv ? '<div class="row" style="margin-top:8px"><button class="btn sm" type="button" id="sg-gasSave">שמירה</button></div>' : ''}
    <details><summary class="small">קוד לדוגמה ל-Apps Script</summary><pre class="preview" dir="ltr" style="text-align:left;font-size:12px;overflow:auto">${esc(GAS_SAMPLE)}</pre></details>
  </details>`;
}

async function renderList(view) {
  formCss(); L.view = view;
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">מידע רגיש — בעלים ומנהל בלבד</div><h1>חוזים לחתימה</h1></div><a class="btn" href="#/contracts-manage/new" id="sg-new">+ חוזה חדש</a></div>
    <p class="small muted" style="margin-top:0">היתרי עסקה וכל חוזה אחר. הלקוח מקבל בוואטסאפ קישור לדף חתימה נפרד שמציג רק את החוזה שלו: אימות טלפון וקוד, צילום תעודת זהות וחתימה באצבע.</p>
    <div class="search"><input class="in" id="sg-q" type="search" placeholder="חיפוש לפי שם החוזה, שם הלקוח, טלפון או ת.ז.…" autocomplete="off" value=""></div>
    <div class="row sp"><span class="small muted" id="sg-qinfo"></span><span class="small muted" id="sg-n"></span></div>
    <div id="sg-recs" style="margin-top:8px"><div class="empty">טוען חוזים…</div></div>
    ${owner() ? `<div class="sg-recvbox"><div><b>קיבלת חוזה חתום מלקוח בקובץ PDF?</b><p class="small muted" style="margin:2px 0 0">אם הלקוח חתם בדף החתימה הישן ושלח לך את קובץ ה-PDF בוואטסאפ, העלה אותו כאן: החוזה יסומן ״נחתם״ עם התאריך, השעה ומספר הטלפון.</p></div>
      <div class="row"><button class="btn ghost" type="button" id="sg-recv">קבלת חוזה חתום (PDF מהלקוח)</button><input type="file" id="sg-recvIn" accept="application/pdf,.pdf" hidden></div><div id="sg-recv-out" class="note info" hidden></div></div>` : ''}
    <div id="sg-settings"></div>`;
  const qi = $('#sg-q', view); qi.value = L.q;
  qi.addEventListener('input', () => { L.q = qi.value; drawList(); });
  $('#sg-recs', view).addEventListener('click', onListClick);
  $('#sg-recs', view).addEventListener('change', onListChange);
  if (owner()) {
    $('#sg-recv', view).addEventListener('click', () => { $('#sg-recvIn').value = ''; $('#sg-recvIn').click(); });
    $('#sg-recvIn', view).addEventListener('change', function () { const f = this.files && this.files[0]; if (f) receive(f, false); });
    $('#sg-recv-out', view).addEventListener('click', e => { if (e.target.closest('#sg-recv-force') && L.pendingRecv) { const f = L.pendingRecv; L.pendingRecv = null; receive(f, true); } });
  }
  await load(); drawList();
  get('/api/sign/settings').then(s => {
    const box = $('#sg-settings', view); if (!box) return; box.innerHTML = settingsHTML(s);
    const b = $('#sg-gasSave', box); if (b) b.onclick = async () => {
      const body = { gasUrl: $('#sg-gasUrl', box).value.trim() }; const sec = $('#sg-gasSecret', box).value; if (sec) body.gasSecret = sec;
      try { await save('PUT', '/api/sign/settings', body, { label: 'הגדרות חוזים', queue: false }); toast('נשמר'); L.drive = !!body.gasUrl; drawList(); } catch (e) { toast(e.message); }
    };
  }).catch(() => {});
  let t = null;
  const off = onLive(e => { if (e.col !== 'contracts') return; clearTimeout(t); t = setTimeout(() => { if (!L.delFor && !L.regenFor) refresh(); }, 400); });
  return () => { off(); clearTimeout(t); L.view = null; };
}

route('contracts-manage', async (view, args) => {
  if (!App.can.sensitive) { view.innerHTML = '<div class="band"><div class="grow"><h1>חוזים לחתימה</h1></div></div><div class="note err">חוזים ותעודות זהות זמינים רק לבעלים ולמנהל.</div>'; return; }
  const [mode, id] = args;
  L.only = mode === 'view' && id ? id : null;
  if (mode === 'new') { if (!SG.recs.length) await load().catch(() => {}); return renderEditor(view, null); }
  if (mode === 'dup') { if (!SG.recs.length) await load().catch(() => {}); const d = L.dup; L.dup = null; return renderEditor(view, null, d || null); }
  if (mode === 'edit' && id) {
    const r = await get('/api/sign/item/' + encodeURIComponent(id));
    if (!SG.base) await load().catch(() => {});
    return renderEditor(view, r);
  }
  return renderList(view);
});
more({ href: '#/contracts-manage', label: 'חוזים לחתימה (היתר עסקה)', can: A => A.can.sensitive, order: 15 });
