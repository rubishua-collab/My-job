// היתר עסקה וחוזים: קוד משותף לתוכנה ולדף החתימה של הלקוח (public/sign.html).
// הפונקציות הועתקו מהתוכנה המקורית (app.html שורות 7287-7546), עם התאמות קטנות בלבד: esc מקומי וטעינת ספריות מ-/vendor.
// אין כאן שום תלות בכניסה לתוכנה — הקובץ נטען גם בדף הציבורי.
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SG_CUR_WORD = { '₪': 'ש"ח', '$': 'דולר', '€': 'אירו' };
export const SG_STAT = { draft: 'ממתין', sent: 'נשלח', signed: 'נחתם' };
export const SG_STAT_T = { draft: 'נשמר ועוד לא נשלח ללקוח', sent: 'נשלח ללקוח, ממתין לחתימה', signed: 'הלקוח חתם' };
export const sgFmtNum = n => Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const sgDOf = iso => new Date(iso + 'T12:00:00');
export const sgFmtG = iso => sgDOf(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
export function sgFmtH(iso) { try { return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(sgDOf(iso)); } catch (e) { return sgFmtG(iso); } }
export const sgNormPhone = s => String(s || '').replace(/\D/g, '').replace(/^(00)?972/, '').replace(/^0+/, '');
export function sgWaLink(phone, text) { let d = String(phone || '').replace(/\D/g, ''); if (d.charAt(0) === '0') d = '972' + d.slice(1); return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text); }
export async function sgSha(s) {
  try { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(h)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(16).padStart(12, '0'); }
}
export async function sgShaFull(s) { try { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { return await sgSha(s); } }
export async function sgFingerprint(d) {
  if (d && d.kd === 'o') return (await sgSha(JSON.stringify(['o', d.nm || '', d.i || '', d.o || '', d.d || '', d.k || '', d.q || '']))).slice(0, 10).toUpperCase();
  return (await sgSha(JSON.stringify([d.i, d.o, d.d || '', d.a, d.c, d.p, d.t, d.r, d.l || '', d.k || '', d.q || '', JSON.stringify(d.f || {}), d.n || 1, d.mo || 0, d.fq || 'm']))).slice(0, 10).toUpperCase();
}
export const sgIsOther = d => !!d && d.kd === 'o';
export const sgNm = d => String((d && d.nm) || '').trim();
export const sgTitle = d => sgNm(d) || (sgIsOther(d) ? 'חוזה' : 'היתר עסקה');
export const sgFileBase = d => String(sgTitle(d)).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'חוזה';
export const sgSafeName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'לקוח';
export const isFiniteNum = v => v !== null && v !== '' && v !== undefined && isFinite(v);

/* ---------- נוסח החוזה (7340-7418) ---------- */
export const SG_BUILTIN = ['משקיע', 'לקוח', 'ת.ז. לקוח', 'סכום', 'רווח', 'סה"כ', 'תאריך', 'פירעון', 'מקום', 'מספר תשלומים', 'החזר חודשי', 'החזר שבועי', 'סכום תשלום'];
export const sgPer = fq => fq === 'w' ? { adj: 'שבועיים', unit: 'שבוע', tok: 'החזר שבועי', word: 'שבועי', per: 'לשבוע' } : { adj: 'חודשיים', unit: 'חודש', tok: 'החזר חודשי', word: 'חודשי', per: 'לחודש' };
const sgIsoOf = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export function sgAddPeriods(iso, n, fq) {
  const dt = new Date(iso + 'T12:00:00');
  if (fq === 'w') { dt.setDate(dt.getDate() + 7 * n); return sgIsoOf(dt); }
  const day = dt.getDate(); dt.setDate(1); dt.setMonth(dt.getMonth() + n);
  dt.setDate(Math.min(day, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate())); return sgIsoOf(dt);
}
export function sgTokensOf(t) { const out = [], seen = {}; String(t || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, n) => { if (!seen[n]) { seen[n] = 1; out.push(n); } return m; }); return out; }
export const sgMoney = (n, c) => sgFmtNum(n) + ' ' + (SG_CUR_WORD[c] || '');
const fin = isFinite; // כמו במקור (isFinite)
export function sgTokenValue(n, d) {
  const f = d.f || {};
  switch (n) {
    case 'משקיע': return d.i || '';
    case 'לקוח': return d.o || '';
    case 'ת.ז. לקוח': return d.d || '';
    case 'סכום': return fin(d.a) ? sgMoney(d.a, d.c) : '';
    case 'רווח': return fin(d.p) ? sgMoney(d.p, d.c) : '';
    case 'סה"כ': return (fin(d.a) && fin(d.p)) ? sgMoney(Number(d.a) + Number(d.p), d.c) : '';
    case 'תאריך': return d.t ? sgFmtH(d.t) + ' (' + sgFmtG(d.t) + ')' : '';
    case 'פירעון': return d.r ? sgFmtH(d.r) + ' (' + sgFmtG(d.r) + ')' : '';
    case 'מקום': return d.l || '';
    case 'מספר תשלומים': return d.n >= 1 ? String(d.n) : '';
    case 'סכום תשלום': case 'החזר חודשי': case 'החזר שבועי': if (d.mo > 0) return sgMoney(d.mo, d.c); return (fin(d.a) && fin(d.p) && d.n >= 1) ? sgMoney((Number(d.a) + Number(d.p)) / d.n, d.c) : '';
    default: return f[n] || '';
  }
}
export const sgFill = (t, d) => String(t || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, n) => '\u0001' + (sgTokenValue(n, d) || '___') + '\u0002');
export const sgMissing = d => sgTokensOf(d.k).filter(n => !sgTokenValue(n, d));
export function sgPayClause(fq, n, lead) {
  const P = sgPer(fq), who = lead || 'המפעיל מתחייב להחזיר למשקיע את סכום ההשקעה בתוספת הרווח המוסכם, ובסך הכל **{{סה"כ}}**,';
  if (n > 1) return who + ' ב-**{{מספר תשלומים}}** תשלומים ' + P.adj + ' שווים של **{{' + P.tok + '}}** כל ' + P.unit + ', כאשר התשלום האחרון ביום **{{פירעון}}**.';
  return who + ' בתשלום ' + P.word + ' אחד (מספר תשלומים: **{{מספר תשלומים}}**) של **{{' + P.tok + '}}**, ביום **{{פירעון}}**.';
}
export function sgDefaultTemplate(d) {
  const P = [];
  P.push('שטר זה נערך ונחתם ביום {{תאריך}}' + (d.l ? ' ב{{מקום}}' : '') + ', בין **{{משקיע}}** (להלן: "המשקיע") לבין **{{לקוח}}**' + (d.d ? ', ת.ז. {{ת.ז. לקוח}}' : '') + ' (להלן: "המפעיל").');
  P.push('המשקיע מסר למפעיל, והמפעיל קיבל, סך של **{{סכום}}** (להלן: "סכום ההשקעה"), בדרך עסקה (איסקא) ולא בדרך הלוואה גרידא, מחציתו הלוואה ומחציתו פיקדון, לצורך עסקי המפעיל.');
  P.push('המפעיל מקבל על עצמו להשקיע את סכום ההשקעה בעסק או בעסקים שיש בהם סיכוי סביר לריווח, ולנהוג בו כדרך שבני אדם נוהגים בממונם שלהם. הרווח, אם יהיה, יתחלק בין הצדדים בחלקים שווים, מחצה למשקיע ומחצה למפעיל, והכל על פי דין עסקה.');
  P.push('הצדדים מעריכים את הרווח הצפוי בסך **{{רווח}}**. ' + sgPayClause(d.fq, d.n));
  P.push('המפעיל לא יהיה נאמן לטעון שהרווח היה פחות מהסכום האמור, שלא היה רווח כלל, או שנגרם הפסד, אלא אם יביא לכך ראיה ברורה, או אם ישבע על כך בפני בית דין.');
  P.push('כל האמור בשטר זה הוא היתר עסקה לכל דבר. כוונת הצדדים שלא יהיה בעסקה משום איסור ריבית על פי ההלכה, וכל מקום שבו נאמר "הלוואה" או "תשלום נוסף" יפורש כעסקה בלבד.');
  P.push('המפעיל מאשר שקרא והבין את כל האמור בשטר, שהוא חותם עליו מרצונו, ושחתימתו הדיגיטלית בכתב ידו על מסך המכשיר, יחד עם תאריך ושעת החתימה, מחייבת אותו כחתימת ידו על נייר.');
  return P.join('\n\n');
}
const sgRich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\u0001/g, '<b>').replace(/\u0002/g, '</b>').replace(/\n/g, '<br>');
function sgOtherBody(k) {
  let h = '', gap = false;
  String(k || '').replace(/\r\n?/g, '\n').split('\n').forEach(l => { if (!l.trim()) { gap = true; return; } h += '<div class="blk ln' + (gap ? ' gap' : '') + '"><p dir="auto">' + esc(l) + '</p></div>'; gap = false; });
  return h;
}
// s: פרטי החתימה {name,id,phone,when:Date,tz,fp,sig:dataURL,ids:[dataURL]} או null לחוזה לא חתום
export function sgPaperHTML(d, s) {
  const cur = SG_CUR_WORD[d.c] || '', oth = sgIsOther(d);
  let h = '<div class="paper-in">';
  if (oth) h += '<div class="blk"><h3>' + esc(sgTitle(d)) + '</h3></div>' + sgOtherBody(d.k);
  else {
    const paras = sgFill(d.k || sgDefaultTemplate(d), d).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    h += '<div class="blk"><h3>' + (sgNm(d) ? esc(sgNm(d)) : 'שטר היתר עסקה') + '</h3><p class="kicker">' + (fin(d.a) ? 'היתר עסקה לסכום ' + esc(sgFmtNum(d.a)) + ' ' + esc(cur) : 'היתר עסקה') + '</p></div>';
    paras.forEach((p, i) => { if (i === 0) h += '<div class="blk"><p>' + sgRich(p) + '</p></div>'; else h += '<div class="blk cl"><i>' + i + '.</i><span>' + sgRich(p) + '</span></div>'; });
  }
  const opName = s ? s.name : d.o, opId = s ? s.id : d.d;
  h += '<div class="blk"><div class="sig">';
  if (!oth) h += '<div class="sigbox"><div class="blank"></div><b>' + esc(d.i) + '</b><span>המשקיע</span></div>';
  h += '<div class="sigbox">' + (s ? '<img src="' + esc(s.sig) + '" alt="חתימה">' : '<div class="blank">מקום החתימה</div>') + '<b>' + esc(opName || '') + '</b><span>' + (oth ? 'החותם' : 'המפעיל') + (opId ? ' · ת.ז. ' + esc(opId) : '') + '</span></div>';
  h += '</div></div>';
  if (s) {
    const tz = s.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || '', tzo = o => { try { return tz ? Object.assign({ timeZone: tz }, o) : o; } catch (e) { return o; } };
    let dS, tS; try { dS = s.when.toLocaleDateString('he-IL', tzo({})); tS = s.when.toLocaleTimeString('he-IL', tzo({ hour: '2-digit', minute: '2-digit' })); } catch (e) { dS = s.when.toLocaleDateString('he-IL'); tS = s.when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
    h += '<div class="blk"><p class="meta2">נחתם דיגיטלית ביום ' + esc(dS) + ' בשעה ' + esc(tS) + ' (' + esc(tz) + ')' +
      '<br>טלפון החותם: <span dir="ltr">' + esc(s.phone) + '</span> · אומת בקוד אימות שנשלח אליו בוואטסאפ' +
      '<br>טביעת מסמך: <span dir="ltr">' + esc(s.fp) + '</span></p></div>';
    (s.ids || []).forEach((src, i) => { h += '<div class="blk"><p style="font-size:14px;margin-bottom:8px">צילום תעודת זהות של ' + (oth ? 'החותם' : 'המפעיל') + ' (' + (i === 0 ? 'צד קדמי' : 'ספח / צד אחורי') + '), לצורך זיהוי בלבד</p><div class="idimgs"><img src="' + esc(src) + '" alt=""></div></div>'; });
  }
  return h + '</div>';
}

/* ---------- תמונות ו-PDF (7420-7499) ---------- */
export const sgReadAsDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
export const sgLoadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
export async function sgCompress(file, maxLen) {
  const im = await sgLoadImg(await sgReadAsDataURL(file));
  let dim = 1400, q = 0.82, out = '';
  for (let k = 0; k < 8; k++) {
    const s = Math.min(1, dim / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (!maxLen || out.length <= maxLen) return out;
    if (q > 0.6) q -= 0.1; else dim = Math.round(dim * 0.8);
  }
  return out;
}
const vend = {};
export function loadVendor(file) {
  return vend[file] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/' + file; s.onload = () => res(); s.onerror = () => { delete vend[file]; rej(new Error('טעינת רכיב נכשלה: ' + file)); }; document.head.appendChild(s); });
}
async function sgBuildPdfPaged(d, s, meta) {
  const W = 794, H = 1123, scale = 1.4, usable = H - 56 - 40 - 8;
  const host = document.createElement('div'); host.className = 'sg-exporthost';
  host.innerHTML = '<div class="sgp export" dir="rtl" lang="he">' + sgPaperHTML(d, s) + '</div>';
  document.body.appendChild(host);
  const dec = el => Promise.all(Array.from(el.querySelectorAll('img')).map(im => im.decode ? im.decode().catch(() => {}) : Promise.resolve()));
  try {
    const paper = host.firstElementChild, inner = paper.firstElementChild;
    await dec(paper);
    const groups = []; let cur = [], start = 0;
    Array.from(inner.children).forEach(b => { const top = b.offsetTop, h = b.offsetHeight; if (!cur.length) start = top; else if (top + h - start > usable) { groups.push(cur); cur = []; start = top; } cur.push(b); });
    if (cur.length) groups.push(cur);
    const pages = [];
    for (const g of groups) {
      const pg = document.createElement('div'); pg.className = 'sgp export'; pg.setAttribute('dir', 'rtl'); pg.setAttribute('lang', 'he');
      const pin = document.createElement('div'); pin.className = 'paper-in';
      g.forEach((b, i) => { const c = b.cloneNode(true); if (i === 0) c.classList.remove('gap'); pin.appendChild(c); });
      pg.appendChild(pin); host.appendChild(pg); await dec(pg);
      const cv = await window.html2canvas(pg, { scale, backgroundColor: '#ffffff', logging: false }), ph = H * scale;
      for (let y = 0; y < cv.height; y += ph) {
        const pc = document.createElement('canvas'); pc.width = W * scale; pc.height = ph;
        const x = pc.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, pc.width, pc.height);
        const hh = Math.min(ph, cv.height - y); x.drawImage(cv, 0, y, cv.width, hh, 0, 0, pc.width, hh);
        pages.push(pc.toDataURL('image/jpeg', 0.75)); pc.width = pc.height = 0;
      }
      cv.width = cv.height = 0; host.removeChild(pg);
    }
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
    pages.forEach((p, i) => { if (i) pdf.addPage(); pdf.addImage(p, 'JPEG', 0, 0, 210, 297); });
    if (meta && typeof pdf.addMetadata === 'function') pdf.addMetadata(meta, 'https://yoman.local/heter-iska');
    return { blob: pdf.output('blob'), pages };
  } finally { host.remove(); }
}
export async function sgBuildPdf(d, s, meta) {
  injectCss();
  await Promise.all([loadVendor('html2canvas.min.js'), loadVendor('jspdf.umd.min.js')]);
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* */ }
  if (sgIsOther(d)) return await sgBuildPdfPaged(d, s, meta);
  const host = document.createElement('div'); host.className = 'sg-exporthost';
  host.innerHTML = '<div class="sgp export" dir="rtl" lang="he">' + sgPaperHTML(d, s) + '</div>';
  document.body.appendChild(host);
  try {
    const paper = host.firstElementChild;
    await Promise.all(Array.from(paper.querySelectorAll('img')).map(im => im.decode ? im.decode().catch(() => {}) : Promise.resolve()));
    const scale = 2, canvas = await window.html2canvas(paper, { scale, backgroundColor: '#ffffff', logging: false });
    const W = 794, H = 1123, M = 44, usable = H - 2 * M;
    const blks = Array.from(paper.querySelectorAll('.paper-in > .blk')).map(b => { let top = 0, el = b; while (el && el !== paper) { top += el.offsetTop; el = el.offsetParent; } return { top, h: b.offsetHeight }; });
    const starts = [0]; let start = 0;
    blks.forEach(b => { if (b.top > start && b.top + b.h - start > usable) { start = b.top; starts.push(start); } });
    const total = paper.offsetHeight, pages = [];
    starts.forEach((y0, i) => {
      const y1 = i + 1 < starts.length ? starts[i + 1] : total;
      const pc = document.createElement('canvas'); pc.width = W * scale; pc.height = H * scale;
      const x = pc.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, pc.width, pc.height);
      x.drawImage(canvas, 0, y0 * scale, W * scale, (y1 - y0) * scale, 0, (i === 0 ? 0 : M) * scale, W * scale, (y1 - y0) * scale);
      pages.push(pc.toDataURL('image/jpeg', 0.92));
    });
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
    pages.forEach((p, i) => { if (i) pdf.addPage(); pdf.addImage(p, 'JPEG', 0, 0, 210, 297); });
    if (meta && typeof pdf.addMetadata === 'function') pdf.addMetadata(meta, 'https://yoman.local/heter-iska');
    return { blob: pdf.output('blob'), pages };
  } finally { host.remove(); }
}

/* ---------- פרטי החתימה בתוך קובץ ה-PDF (7532-7545) ---------- */
export const SG_META_A = 'YHSIGN1:', SG_META_B = ':YHEND';
export function sgB64Text(t) { const b = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function sgTextB64(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
export const sgMeta = o => SG_META_A + sgB64Text(JSON.stringify(o)) + SG_META_B;
export async function sgReadSigned(file) {
  const buf = new Uint8Array(await file.arrayBuffer()); let txt = '';
  for (let i = 0; i < buf.length; i += 0x8000) txt += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const a = txt.indexOf(SG_META_A); if (a < 0) return null;
  const b = txt.indexOf(SG_META_B, a); if (b < 0) return null;
  const o = JSON.parse(sgTextB64(txt.slice(a + SG_META_A.length, b).replace(/[^A-Za-z0-9+/=]/g, '')));
  return o && o.v === 1 && o.s ? o : null;
}
export function sgCanon(v) { if (Array.isArray(v)) return '[' + v.map(sgCanon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + sgCanon(v[k])).join(',') + '}'; return JSON.stringify(v === undefined ? null : v); }
export function sgDLink(d) {
  const o = JSON.parse(JSON.stringify(d || {}));
  delete o.m; delete o.vh;
  if (o.kd !== 'o' && o.k && o.k === sgDefaultTemplate(o)) delete o.k;
  return JSON.parse(JSON.stringify(o));
}
export async function sgExpandSent(sd, d) {
  if (!sd || typeof sd !== 'object' || !sd.kh || sd.k) return sd;
  const k = d && d.k; if (!k) return sd;
  try { if ((await sgShaFull(k)) !== sd.kh) return sd; } catch (e) { return sd; }
  const o = Object.assign({}, sd, { k }); delete o.kh; delete o.kl; return o;
}
export function sgWhen(iso, tz) { try { const w = new Date(iso), o = tz ? { timeZone: tz } : {}; return w.toLocaleDateString('he-IL', o) + ' ' + w.toLocaleTimeString('he-IL', Object.assign({ hour: '2-digit', minute: '2-digit' }, o)); } catch (e) { return String(iso || ''); } }
export function sgSniff(u) {
  if (!u || u.length < 12) return '';
  if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return 'application/pdf';
  if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'image/jpeg';
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) return 'image/png';
  return '';
}
export const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
export function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
}

/* ---------- לוח החתימה (9384-9398) ---------- */
export function sgInitPad(canvas, onInk) {
  const ctx = canvas.getContext('2d'); let drawing = false, last = null; const st = { ink: 0 };
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  const pt = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); drawing = true; last = pt(e); try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* */ } ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, 6.3); ctx.fillStyle = '#111'; ctx.fill(); });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return; e.preventDefault(); const p = pt(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    st.ink += Math.hypot(p.x - last.x, p.y - last.y); last = p; onInk && onInk(st.ink, false);
  });
  const end = () => { if (drawing) { drawing = false; onInk && onInk(st.ink, true); } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', end);
  return { clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); st.ink = 0; onInk && onInk(0, true); }, get ink() { return st.ink; }, data: () => canvas.toDataURL('image/png') };
}

/* ---------- עיצוב: הנייר לבן ודיו כהה בשני המצבים, כי זה מה שנחתם ומיוצא (798-841) ---------- */
let cssDone = false;
export function injectCss() {
  if (cssDone || typeof document === 'undefined') return; cssDone = true;
  const s = document.createElement('style'); s.id = 'sg-core-css';
  s.textContent = `
.sgp{position:relative;background:#fff;color:#141414;font-family:"Frank Ruhl Libre","David","Times New Roman",serif;font-size:16.5px;line-height:1.8;border:1px solid var(--line);border-radius:4px;padding:28px 24px;box-sizing:border-box;text-align:start}
.sgp .blk{padding-bottom:12px}.sgp p{margin:0}
.sgp h3{font-size:30px;line-height:1.2;margin:0 0 4px;text-align:center;font-weight:700;color:#141414}
.sgp .kicker{text-align:center;font-size:14px;letter-spacing:.04em;color:#4a4f57;border-bottom:1px solid #c3c9d2;padding-bottom:14px}
.sgp .cl{display:grid;grid-template-columns:2.1em 1fr;gap:0 4px}.sgp .cl i{font-style:normal;font-weight:700}
.sgp .blk.ln{padding-bottom:0}.sgp .blk.ln p{white-space:pre-wrap;overflow-wrap:anywhere}.sgp .blk.ln.gap{padding-top:.8em}
.sgp .sig{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px}
.sgp .sigbox{border-top:1px solid #141414;padding-top:6px;font-size:15px;line-height:1.5;min-height:120px;display:flex;flex-direction:column;gap:2px}
.sgp .sigbox img{max-height:90px;max-width:100%;object-fit:contain;align-self:flex-start}
.sgp .sigbox .blank{height:90px;display:flex;align-items:center;color:#7a808a;font-size:13px}
.sgp .meta2{font-size:12.5px;color:#4a4f57;border-top:1px solid #c3c9d2;padding-top:8px;line-height:1.6}
.sgp .idimgs{display:flex;flex-direction:column;gap:12px;align-items:center}
.sgp .idimgs img{max-width:100%;max-height:380px;object-fit:contain;border:1px solid #c3c9d2}
.sgp.export{width:794px;padding:56px 56px 40px;font-size:17px;border:0;border-radius:0}
.sg-exporthost{position:fixed;top:0;left:0;width:794px;z-index:-1;pointer-events:none}
.sg-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sg-summary div{display:flex;flex-direction:column;gap:2px;min-width:0}
.sg-summary b{font-size:19px;font-variant-numeric:tabular-nums}
.sg-summary span{font-size:12.5px;color:var(--muted);font-weight:600}
.sg-pad{position:relative;background:#fff;border:1.5px dashed var(--line);border-radius:8px;overflow:hidden}
.sg-pad canvas{display:block;width:100%;height:auto;aspect-ratio:720/260;touch-action:none;cursor:crosshair}
.sg-pad .guide{position:absolute;inset-inline:6%;bottom:26%;border-bottom:1px solid #b9bfc9;pointer-events:none}
.sg-pad .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7a808a;pointer-events:none}
.sg-idslot{display:flex;flex-direction:column;gap:8px;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--field)}
.sg-idslot img{max-width:100%;max-height:180px;object-fit:contain;border-radius:4px;align-self:flex-start}
.sg-idslot .lbl{font-weight:600;font-size:14px}
.sg-check{display:flex;gap:10px;align-items:flex-start;font-size:14.5px}
.sg-check input{width:22px;height:22px;margin-top:3px;flex:0 0 auto}
.sg-previews{display:flex;flex-direction:column;gap:10px}
.sg-previews img{width:100%;height:auto;border:1px solid var(--line);border-radius:4px;display:block}
.sg-busy{position:fixed;inset:0;z-index:60;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;padding:24px;text-align:center}
.sg-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all}
@media (max-width:440px){.sg-summary{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}
