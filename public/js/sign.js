// דף החתימה של הלקוח: נפתח מהקישור בוואטסאפ (sign.html#אסימון) ומציג רק את המסמך של הלקוח הזה.
// אימות בטלפון ובקוד, פרטי החותם, צילום ת״ז, חתימה באצבע, PDF חתום שנשמר אצל בעל התוכנה.
// מבוסס על דף הלקוח בתוכנה המקורית (app.html שורות 1751-1797, 9350-9445). אין כאן שום נתון אחר מהתוכנה.
import {
  esc, sgTitle, sgNm, sgIsOther, sgPer, sgFmtNum, sgFmtG, sgTokenValue, sgPaperHTML, sgCompress, sgBuildPdf, sgNormPhone,
  sgWaLink, sgFileBase, sgSafeName, sgInitPad, injectCss, blobToDataURL, downloadBlob, sgMeta,
} from './features/contracts-core.js';

const $ = id => document.getElementById(id);
const token = (location.hash.replace(/^#/, '').match(/^[A-Za-z0-9_-]{24,64}/) || [''])[0];
const API = '/api/public/sign/' + encodeURIComponent(token);
const S = { info: null, d: null, c: '', fp: '', phone: '', code: '', front: null, back: null, pdf: null, pad: null };

injectCss();
const st = document.createElement('style');
st.textContent = `.sgc-wrap{max-width:600px;margin:0 auto;padding:18px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:16px}
.sgc-wrap>section{display:flex;flex-direction:column;gap:16px}.sgc-wrap>section[hidden]{display:none}
.sgc-wrap h1{font-size:23px;margin:0}.sgc-wrap .card{margin:0}.sgc-wrap .card h3{margin:0 0 4px}
.sg-busy[hidden]{display:none}`;
document.head.appendChild(st);

function show(v) { ['load', 'err', 'verify', 'sign', 'done'].forEach(x => { $('v-' + x).hidden = x !== v; }); window.scrollTo(0, 0); }
function fail(msg) { $('err-t').textContent = msg; show('err'); }
async function call(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' }); }
  catch (e) { throw Object.assign(new Error('אין חיבור לאינטרנט. בדקו את הקליטה ונסו שוב.'), { net: true }); }
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (!r.ok) throw Object.assign(new Error((j && j.error) || ('שגיאה ' + r.status)), { status: r.status });
  return j;
}

async function boot() {
  if (!token) return fail('הקישור לא שלם. פתחו את הקישור המלא מהודעת הוואטסאפ.');
  try { S.info = await call('GET', API); } catch (e) { return fail(e.message); }
  const i = S.info;
  document.title = i.title;
  $('c-title').textContent = i.title;
  $('c-lead').textContent = (i.sender ? i.sender + ' שלח לך ' : 'נשלח לך ') + '״' + i.title + '״ לחתימה.' + (i.signed ? ' המסמך כבר נחתם.' : '');
  show('verify');
}

async function onVerify() {
  const e = $('ver-err'); e.hidden = true;
  S.phone = $('s-phone').value.trim(); S.code = $('s-code').value.replace(/\D/g, '');
  if (sgNormPhone(S.phone).length < 8) { e.textContent = 'הקלידו את מספר הטלפון שאליו נשלח המסמך.'; e.hidden = false; return; }
  if (S.code.length !== 6) { e.textContent = 'קוד האימות הוא 6 ספרות, מתוך הודעת הוואטסאפ.'; e.hidden = false; return; }
  $('b-verify').disabled = true;
  try {
    const o = await call('POST', API + '/open', { phone: S.phone, code: S.code });
    S.d = o.d; S.c = o.c; S.fp = o.fp;
    if (o.signed) return fail('המסמך הזה כבר נחתם' + (o.signedAt ? ' ב-' + new Date(o.signedAt).toLocaleString('he-IL') : '') + '. אם צריך לחתום שוב, בקשו קישור חדש ממי ששלח לכם את המסמך.');
    showSign();
  } catch (er) { e.textContent = er.message; e.hidden = false; }
  finally { $('b-verify').disabled = false; }
}

// sgShowClient (9354)
function showSign() {
  const d = S.d, oth = sgIsOther(d), nm = sgNm(d), P = sgPer(d.fq);
  $('c-title2').textContent = sgTitle(d);
  $('c-lead2').textContent = (d.i ? d.i + ' שלח לך ' : 'נשלח לך ') + (nm ? 'את ״' + nm + '״' : (oth ? 'חוזה' : 'היתר עסקה')) + ' לחתימה.';
  $('c-agree').textContent = oth ? 'קראתי והבנתי את כל האמור בחוזה' + (nm ? ' ״' + nm + '״' : '') + ', ואני חותם עליו מרצוני. חתימה זו מחייבת אותי כחתימת יד.' : 'קראתי והבנתי את כל האמור בהיתר העסקה, ואני חותם עליו מרצוני. חתימה זו מחייבת אותי כחתימת יד.';
  if (oth) $('c-summary').innerHTML = '<div><span>החוזה</span><b>' + esc(nm || 'חוזה') + '</b></div><div><span>שם הלקוח</span><b>' + esc(d.o || '') + '</b></div>';
  else $('c-summary').innerHTML = '<div><span>סכום ההשקעה</span><b>' + esc(sgFmtNum(d.a)) + ' ' + esc(d.c) + '</b></div><div><span>מועד הפירעון</span><b>' + esc(d.r ? sgFmtG(d.r) : '') + '</b></div>' +
    '<div><span>סוג ההחזר</span><b>' + (d.fq === 'w' ? 'שבועי' : 'חודשי') + '</b></div><div><span>מספר תשלומים</span><b>' + esc(d.n || 1) + '</b></div><div><span>החזר ' + P.word + '</span><b>' + esc(sgTokenValue(P.tok, d)) + '</b></div>';
  $('c-paper').innerHTML = sgPaperHTML(d, null);
  $('s-name').value = d.o || ''; $('s-id').value = d.d || '';
  clearId('front'); clearId('back'); S.pad.clear(); $('s-agree').checked = false;
  show('sign'); ready();
}
function clearId(w) { S[w] = null; const im = $('img-' + w); im.hidden = true; im.removeAttribute('src'); $('in-' + w).value = ''; $('clr-' + w).hidden = true; }
async function onIdFile(w) {
  const f = $('in-' + w).files && $('in-' + w).files[0]; if (!f) return;
  try {
    S[w] = await sgCompress(f, 3500000);
    const im = $('img-' + w); im.src = S[w]; im.hidden = false; $('clr-' + w).hidden = false;
  } catch (e) { clearId(w); $('sign-hint').textContent = 'לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת.'; }
  ready();
}
// sgUpdateReady (9409)
function ready() {
  if (!S.d) return;
  const miss = [], name = $('s-name').value.trim(), id = $('s-id').value.replace(/\D/g, '');
  if (name.length < 2) miss.push('שם מלא');
  if (id.length < 5 || id.length > 9) miss.push('מספר ת.ז.');
  if (!S.front) miss.push('צילום ת.ז.');
  if (S.pad.ink < 80) miss.push('חתימה');
  if (!$('s-agree').checked) miss.push('אישור הקריאה');
  $('b-sign').disabled = miss.length > 0;
  $('sign-hint').textContent = miss.length ? 'חסר: ' + miss.join(', ') : 'הכל מוכן.';
}
// sgOnSign (9424): בונים את ה-PDF החתום במכשיר, ושולחים אותו יחד עם החתימה והצילומים
async function onSign() {
  const er = $('sign-err'); er.hidden = true; $('busy').hidden = false; $('b-sign').disabled = true;
  try {
    const when = new Date(), tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
    const s = { name: $('s-name').value.trim(), id: $('s-id').value.replace(/\D/g, ''), phone: S.phone, sig: S.pad.data(), ids: [S.front, S.back].filter(Boolean), when, tz, fp: S.fp };
    const meta = sgMeta({ v: 1, c: S.c, sent: JSON.stringify(S.d), s: { name: s.name, id: s.id, phone: s.phone, when: when.toISOString(), tz, fp: s.fp } });
    const res = await sgBuildPdf(S.d, s, meta);
    const pdf = await blobToDataURL(res.blob);
    const out = await call('POST', API + '/submit', { phone: S.phone, code: S.code, name: s.name, id: s.id, agree: true, sig: s.sig, ids: s.ids, pdf, when: when.toISOString(), tz });
    S.pdf = { blob: res.blob, name: sgFileBase(S.d) + ' חתום - ' + sgSafeName(s.name) + '.pdf' };
    $('done-lead').textContent = 'תודה ' + s.name + '. המסמך החתום התקבל.';
    $('done-prev').innerHTML = res.pages.map(p => '<img src="' + p + '" alt="עמוד במסמך החתום">').join('');
    $('done-fp').textContent = 'טביעת מסמך: ' + (out.fp || s.fp);
    const wa = $('b-wa');
    if (S.d.w) { wa.href = sgWaLink(S.d.w, 'שלום, חתמתי על ' + (sgNm(S.d) ? '״' + sgNm(S.d) + '״' : (sgIsOther(S.d) ? 'החוזה' : 'היתר העסקה')) + '.'); wa.hidden = false; } else wa.hidden = true;
    show('done');
  } catch (e) { er.textContent = e.status ? e.message : (e.net ? e.message : 'היתה בעיה בהכנת המסמך. נסו שוב.'); er.hidden = false; ready(); }
  finally { $('busy').hidden = true; }
}

S.pad = sgInitPad($('pad'), (ink, end) => { $('pad-ph').hidden = ink > 0; if (end) ready(); });
$('b-verify').addEventListener('click', onVerify);
$('s-code').addEventListener('keydown', e => { if (e.key === 'Enter') onVerify(); });
['s-name', 's-id'].forEach(i => $(i).addEventListener('input', ready));
$('s-agree').addEventListener('change', ready);
['front', 'back'].forEach(w => { $('in-' + w).addEventListener('change', () => onIdFile(w)); $('clr-' + w).addEventListener('click', () => { clearId(w); ready(); }); });
$('pad-clr').addEventListener('click', () => { S.pad.clear(); ready(); });
$('b-sign').addEventListener('click', onSign);
$('b-save').addEventListener('click', () => { if (S.pdf) downloadBlob(S.pdf.blob, S.pdf.name); });
window.addEventListener('hashchange', () => location.reload());
boot();
