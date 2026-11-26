// PDF של רשימת איסוף (כל הרשימה או גובה אחד) — buildPdf ו-sharePdf מהתוכנה המקורית (app.html 5180-5228),
// עם html2canvas + jsPDF שנשמרו מקומית. העיצוב (app.html 241-293, 365, 413-418) מוגבל ל-.wt-rep כדי לא להתנגש בשאר המסכים.
import { lgvStyle } from './loans-box.js';
import { loadVendor } from '../registry.js';
import { esc, dmy as isoLabel } from '../ui.js';

const CSS = `
.wt-rep{--paper:#fff;--ink:#16223a;--ink-muted:#5a6678;--rline:#cfd6df;--zebra:#f4f6fa;--r-blue:#1d3f6e;--r-brown:#7a4a1c;--r-hl:#fbf1d6;--r-neg:#b3261e;--r-hit:#ffd978;--r-band:#0f2444;--r-band2:#183560;--r-band-fg:#fff;--r-band-muted:#c3cfe2;--r-gold:#b8913f;--r-tint:#e9eff7;--r-tint-brown:#f5ece2;
 background:var(--paper);color:var(--ink);border:1px solid var(--rline);border-radius:10px;padding:20px 20px 16px;font-size:14px;line-height:1.45;direction:rtl;min-width:0;display:flow-root}
.wt-rep *{box-sizing:border-box}
.wt-rep .rhead{display:flex;align-items:center;gap:14px;background:linear-gradient(160deg,var(--r-band2),var(--r-band) 65%);color:var(--r-band-fg);border-radius:8px;padding:16px 18px;border-bottom:3px solid var(--r-blue)}
.wt-rep .rseal{flex:none;width:46px;height:46px;border-radius:50%;border:1.5px solid var(--r-gold);display:flex;align-items:center;justify-content:center}
.wt-rep .rseal span{width:36px;height:36px;border-radius:50%;border:1px dashed var(--r-gold);display:flex;align-items:center;justify-content:center;color:var(--r-gold);font-weight:600;font-size:18px;line-height:1}
.wt-rep .rht{display:flex;flex-direction:column}
.wt-rep .rbrand{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--r-gold)}
.wt-rep .rtitle{font-weight:700;font-size:26px;margin:0;line-height:1.15;color:var(--r-band-fg)}
.wt-rep .rsub{color:var(--r-band-muted);font-size:13.5px}
.wt-rep::after{content:"יומן חשבון בוקר · מסמך פנימי";display:block;margin-top:20px;padding-top:8px;border-top:1px solid var(--rline);font-size:11px;letter-spacing:.04em;color:var(--ink-muted);text-align:center}
.wt-rep .rs{margin-top:22px}
.wt-rep .rh{font-size:17px;font-weight:700;margin:0 0 8px;color:var(--r-blue)}
.wt-rep table.rt{width:100%;border-collapse:collapse;font-size:14px;color:var(--ink)}
.wt-rep .rt th{background:var(--r-tint);color:var(--r-blue);font-weight:700;font-size:12.5px;padding:8px 10px;text-align:right;border-bottom:2px solid var(--r-blue)}
.wt-rep .rt.brown th{background:var(--r-tint-brown);color:var(--r-brown);border-bottom-color:var(--r-brown)}
.wt-rep .rt td{padding:7px 10px;border-bottom:1px solid var(--rline);background:var(--paper)}
.wt-rep .rt tbody tr:nth-child(even):not(.hl):not(.tot):not(.hit) td{background:var(--zebra)}
.wt-rep .rt .ix{width:38px;text-align:center;color:var(--ink-muted);font-size:12.5px}
.wt-rep .rt th.a,.wt-rep .rt td.a{text-align:left;white-space:nowrap}
.wt-rep .rt tr.tot td{font-weight:700;border-top:2px solid var(--r-blue);border-bottom:0;background:var(--r-tint)}
.wt-rep .rt.brown tr.tot td{border-top-color:var(--r-brown);background:var(--r-tint-brown)}
.wt-rep .rt tr.tot2 td{font-weight:700;border-top:1px solid var(--rline);background:var(--zebra)}
.wt-rep .rt tbody tr.hl td{background:var(--r-hl);color:var(--ink);font-weight:700;border-top:1px solid var(--r-gold);border-bottom:1px solid var(--r-gold)}
.wt-rep .rt tr.hit td{background:var(--r-hit)!important;font-weight:700}
.wt-rep .rt tbody tr.done td{color:var(--ink-muted)}
.wt-rep .rt .phl{font-size:12px;color:var(--ink-muted);line-height:1.25;max-width:22ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-rep .rt .stl{display:inline-block;font-weight:700;font-size:12px;border-radius:10px;padding:1px 10px;white-space:nowrap}
.wt-rep .rt .stl.pass{background:#fff1bd;color:#4d3a08}
.wt-rep .rt .stl.got{background:#dcefe6;color:#14573f}
.wt-rep .rt .stl.hard{background:#fbe0dd;color:#8c1d16}
.wt-rep .rt .stl.easy{background:#dcefe6;color:#14573f}
.wt-rep .rt .stl.na{background:#dde7f5;color:#1f3f6e}
.wt-rep .rt .stl.part{background:#e1e9f6;color:#163e73}
.wt-rep .num{direction:ltr;unicode-bidi:isolate;display:inline-block;font-variant-numeric:tabular-nums}
.wt-rep .num.neg{color:var(--r-neg)}
.wt-rep .cblock{margin-top:26px}
.wt-rep .cband{display:flex;align-items:center;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;color:var(--r-blue);font-weight:700;font-size:20px;line-height:1.2;padding:0 2px 7px;border-bottom:2px solid var(--r-blue)}
.wt-rep .cband>span:first-child{display:flex;align-items:center;gap:9px}
.wt-rep .cband>span:first-child::before{content:"";flex:none;width:10px;height:10px;border-radius:50%;background:var(--r-gold)}
.wt-rep .cband .cbs{font-size:13px;font-weight:600;color:var(--ink-muted)}
.wt-rep .cblock table.rt{margin-top:10px}
#wt-pdf-stage{position:absolute;left:-10000px;top:0;width:794px;background:#fff;direction:rtl}
#wt-pdf-stage .wt-rep{border:0;border-radius:0;box-shadow:none;padding:26px 28px;width:794px}
#wt-pdf-stage .num{font-variant-numeric:normal}
.wt-per{display:flex;flex-wrap:wrap;gap:8px}
.wt-perg{display:inline-flex;gap:4px;flex-wrap:wrap}
.wt-nc-grp{border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;font-size:13.5px;line-height:1.5;margin-top:8px}
.wt-nc-grp.warn{background:var(--warn-bg,#fbefd0);color:var(--warn-fg,#6d4600)}
.wt-nc-grp.info{background:var(--surface2,#eef2f7)}
.wt-nc-c{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;background:var(--surface,#fff);color:inherit;border:1px solid var(--line,#cfd6df);border-radius:6px;padding:8px 10px}
.wt-nc-c .nm{font-weight:700}.wt-nc-c .src{opacity:.75;font-size:12.5px}
.wt-ack{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px;cursor:pointer;background:var(--warn-bg,#fbefd0);color:var(--warn-fg,#6d4600);border-radius:8px;padding:10px 12px;margin-top:8px}
.wt-ack input{width:22px;height:22px;flex:none;margin:0}
.wt-phm{color:var(--neg,#b3261e);font-weight:600}
.wt-dup ol{margin:6px 0 0;padding-inline-start:22px}
.wt-dup .dupname{appearance:none;border:0;background:none;color:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:0;font:inherit}
@media (max-width:520px){.wt-rep .rtitle{font-size:21px}.wt-rep .rhead{padding:14px;gap:10px}.wt-rep .rt td,.wt-rep .rt th{padding:6px 7px}}
`;
let styled = false;
export function ensureStyle() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

// מקור: buildPdf (app.html 5180-5211)
export async function buildPdf(html, acc) {
  ensureStyle(); lgvStyle();
  await Promise.all([loadVendor('html2canvas.min.js'), loadVendor('jspdf.umd.min.js')]);
  let stage = document.getElementById('wt-pdf-stage');
  if (!stage) { stage = document.createElement('div'); stage.id = 'wt-pdf-stage'; stage.setAttribute('aria-hidden', 'true'); document.body.appendChild(stage); }
  stage.innerHTML = '<article class="report wt-rep">' + html + '</article>';
  try {
    try { await document.fonts.ready; } catch (e) { /* */ }
    const W = 794;
    // נקודות החיתוך בין עמודים נמדדות בעותק שמצויר בפועל (onclone) — שם הגובה יכול להיות שונה מהמסך,
    // וכך שום שורה או פירוט לא נחתכים ושום חלק בסוף העמוד האחרון לא הולך לאיבוד
    const measure = (st) => { const r = st.getBoundingClientRect(), c = [];
      st.querySelectorAll('tbody tr, tfoot tr, .rl').forEach(tr => c.push(tr.getBoundingClientRect().bottom - r.top));
      st.querySelectorAll('.rs, .cblock').forEach(s => c.push(s.getBoundingClientRect().top - r.top));
      return { cand: c.sort((a, b) => a - b), h: Math.ceil(st.scrollHeight) }; };
    let M = measure(stage);
    const scale = Math.max(1, Math.min(2, Math.sqrt(14e6 / (W * M.h))));
    const canvas = await window.html2canvas(stage, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, onclone: (doc) => { const st = doc.getElementById('wt-pdf-stage'); if (st) M = measure(st); } });
    const k = canvas.width / W, pageH = W * (277 / 190);
    const cand = M.cand, totalH = Math.max(M.h, Math.ceil(canvas.height / k));
    const slices = []; let y = 0;
    while (y < totalH - 1) {
      const limit = y + pageH;
      if (limit >= totalH) { slices.push([y, totalH]); break; }
      let b = 0; for (const c of cand) { if (c > y + pageH * 0.35 && c <= limit) b = c; }
      if (!b) b = limit; slices.push([y, b]); y = b;
    }
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
    slices.forEach((s, i) => {
      const sy = Math.round(s[0] * k), sh = Math.max(1, Math.round((s[1] - s[0]) * k));
      const pc = document.createElement('canvas'); pc.width = canvas.width; pc.height = sh;
      const ctx = pc.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pc.width, sh); ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      if (i) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, 190, (s[1] - s[0]) * (190 / W));
    });
    const name = 'איסוף-יומי-' + (acc.coll ? String(acc.coll).replace(/[\\\/:*?"<>|\s]+/g, '-') + '-' : '') + isoLabel(acc.date) + '.pdf';
    return { blob: pdf.output('blob'), name };
  } finally { stage.innerHTML = ''; }
}
// מקור: shareHelp (app.html 5212)
export function shareHelp(name, text, saved, msg) {
  return '<div class="note ' + (saved ? 'ok' : 'info') + '">' + esc(msg || (saved ? 'הקובץ ' + name + ' נשמר.' : 'הקובץ מוכן.')) + ' כדי לשלוח בוואטסאפ: פתח את השיחה וצרף את הקובץ.</div>' +
    '<div class="row"><a class="btn wa" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">פתח וואטסאפ עם ההודעה</a>' +
    '<button class="btn ghost" type="button" data-wt-resave="1">שמור את ה-PDF שוב</button></div>';
}
let last = null;
const download = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); };
export const resave = () => { if (last) download(last.blob, last.name); };
// מקור: sharePdf (app.html 5217) — שיתוף מערכת (אייפון: וואטסאפ עם הקובץ), אחרת הורדה + קישור וואטסאפ עם הטקסט
export async function sharePdf(html, acc, text, box, btn) {
  const prev = btn.textContent; btn.disabled = true; btn.textContent = 'מכין PDF…'; box.innerHTML = '';
  try {
    const { blob, name } = await buildPdf(html, acc);
    last = { blob, name, text };
    const file = new File([blob], name, { type: 'application/pdf' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); box.innerHTML = '<div class="note ok">נפתח חלון השיתוף.</div>'; return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    download(blob, name); box.innerHTML = shareHelp(name, text, true);
  } catch (e) {
    box.innerHTML = '<div class="note err">לא הצלחתי ליצור PDF. ' + esc(e && e.message || '') + '</div>';
  } finally { btn.disabled = false; btn.textContent = prev; }
}
