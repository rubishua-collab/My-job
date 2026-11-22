// ״שליחת PDF״ ממסך ״חשבונות״: מפיק PDF מהנתונים השמורים של הרישום שנבחר (גם ישן), ומאפשר
// וואטסאפ / מייל / שיתוף נוסף / תצוגה מקדימה / הורדה — בלי לצאת מהרשימה ובלי לאבד חיפוש וסינון.
// כשהמכשיר תומך בשיתוף קבצים — עובר הקובץ עצמו. אחרת: ״הורד קובץ לצירוף״ + הנחיה קצרה.
// ״נשלח״ לא מוצג לעולם: הדפדפן לא מקבל אישור שליחה מוואטסאפ או מהמייל, רק שהקובץ הועבר לאפליקציה.
import { get } from './api.js';
import { $, esc, dmy, weekday, openSheet } from './ui.js';
import { reportHTML, buildPdf, shareText, KL } from './features/reports-print.js';

export const pdfName = (a) => `${KL[a.kind] || 'חשבון'} ${String(a.date || '').split('-').reverse().join('-')}.pdf`;
const canShareFile = (f) => { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch { return false; } };
function download(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }

export async function openPdfSheet(id) {
  const s = openSheet(`<div class="hd"><h2>שליחת PDF</h2><button class="x" data-close>×</button></div><div id="pdfhead" class="muted">טוען את החשבון…</div><div id="pdfbody"></div>`);
  let a;
  try { a = await get('/api/accounts/' + encodeURIComponent(id)); }
  catch (e) { $('#pdfhead', s.el).innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  const kind = KL[a.kind] || '';
  const name = pdfName(a); const dname = name.replace(/\.pdf$/, '');
  const disp = `<b>״${esc(dname)}״</b> (PDF)`;
  $('#pdfhead', s.el).innerHTML = `<div class="note info" style="margin:0"><b style="font-size:17px">${esc(a.title || kind)}</b><br>${esc(kind)} · ${esc(weekday(a.date))} ${dmy(a.date)}</div>`;
  const body = $('#pdfbody', s.el);
  body.innerHTML = `<p class="small muted" id="pdfst" role="status">מכין את הקובץ ${disp}…</p>
    <div class="grid" style="grid-template-columns:1fr;gap:8px">
      <button class="btn wa xl" id="pwa" disabled>שליחה בוואטסאפ</button>
      <button class="btn xl" id="pmail" disabled>שליחה במייל</button>
      <button class="btn ghost" id="pshare" disabled>שיתוף נוסף</button>
      <div class="row"><button class="btn ghost" id="pprev" style="flex:1" disabled>תצוגה מקדימה</button><button class="btn ghost" id="pdl" style="flex:1" disabled>הורדת PDF</button></div>
    </div>
    <div id="pout" style="margin-top:10px"></div><div id="pview"></div>`;
  const html = reportHTML(a); const text = shareText(a);
  let file, blob;
  try { ({ blob } = await buildPdf(html, a)); file = new File([blob], name, { type: 'application/pdf' }); }
  catch (e) { $('#pdfst', s.el).innerHTML = `<span class="neg">לא הצלחתי ליצור PDF: ${esc(e && e.message || '')}</span>`; return; }
  if (!document.body.contains(body)) return; // החלון נסגר בינתיים
  const kb = Math.max(1, Math.round(blob.size / 1024));
  $('#pdfst', s.el).textContent = `הקובץ מוכן: ״${dname}״ (PDF, ${kb} KB)`;
  ['pwa', 'pmail', 'pshare', 'pprev', 'pdl'].forEach(k => { $('#' + k, s.el).disabled = false; });
  const out = $('#pout', s.el);
  const manual = (where) => {
    const link = where === 'mail'
      ? `mailto:?subject=${encodeURIComponent(name.replace(/\.pdf$/, ''))}&body=${encodeURIComponent(text + '\n\n(הקובץ מצורף)')}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    out.innerHTML = `<div class="note warn"><b>צריך לצרף את הקובץ ידנית.</b> ${where === 'mail'
      ? 'לחץ ״הורד קובץ לצירוף״, אחר כך ״פתח מייל חדש״, ובמייל לחץ על סמל האטב (📎) ובחר את הקובץ ' + disp + ' מתיקיית ההורדות.'
      : 'לחץ ״הורד קובץ לצירוף״, אחר כך ״פתח וואטסאפ״, בחר את איש הקשר, לחץ על סמל האטב / ״+״ ← ״מסמך״ ובחר את הקובץ ' + disp + ' מתיקיית ההורדות.'}</div>
      <div class="row"><button class="btn" id="pman">הורד קובץ לצירוף</button><a class="btn ${where === 'mail' ? 'ghost' : 'wa'}" href="${link}" target="_blank" rel="noopener" id="pgo">${where === 'mail' ? 'פתח מייל חדש' : 'פתח וואטסאפ'}</a></div>`;
    $('#pman', out).onclick = () => { download(blob, name); $('#pman', out).textContent = 'הקובץ הורד ✓ (להוריד שוב)'; };
  };
  const share = async (where) => {
    out.innerHTML = '';
    if (!canShareFile(file)) return manual(where);
    try {
      await navigator.share({ files: [file], title: name.replace(/\.pdf$/, '') });
      out.innerHTML = `<div class="note ok">הקובץ הועבר לאפליקציה שבחרת. ההודעה נשלחת רק כשלוחצים ״שלח״ באפליקציה עצמה.</div>`;
    } catch (e) {
      manual(where);
      if (e && e.name === 'AbortError') out.insertAdjacentHTML('afterbegin', '<div class="note info">חלון השיתוף נסגר — שום דבר לא נשלח. אם האפליקציה הרצויה לא הופיעה שם, אפשר לצרף ידנית:</div>');
    }
  };
  $('#pwa', s.el).onclick = () => share('wa');
  $('#pmail', s.el).onclick = () => share('mail');
  $('#pshare', s.el).onclick = () => share('other');
  $('#pdl', s.el).onclick = () => { download(blob, name); out.innerHTML = `<div class="note ok">הקובץ ${disp} נשמר בתיקיית ההורדות.</div>`; };
  $('#pprev', s.el).onclick = () => {
    const v = $('#pview', s.el);
    if (v.innerHTML) { v.innerHTML = ''; $('#pprev', s.el).textContent = 'תצוגה מקדימה'; return; }
    const u = URL.createObjectURL(blob);
    v.innerHTML = `<div class="row" style="margin:8px 0"><a class="btn ghost sm" href="${u}" target="_blank" rel="noopener">פתח את ה־PDF בחלון נפרד</a></div><div style="overflow:auto;max-height:60vh;border:1px solid var(--line);border-radius:10px"><article class="report" id="pdfpreview">${html}</article></div>`;
    $('#pprev', s.el).textContent = 'סגור תצוגה מקדימה';
  };
}
