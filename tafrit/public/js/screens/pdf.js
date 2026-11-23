// יומן היום כ-PDF לשליחה בוואטסאפ או לשמירה — אותו מנגנון כמו ביומן הקודם (ציור על canvas ועטיפה ב-PDF מינימלי),
// עם הארוחות, מה תוכנן ומה נאכל, היעד, היתרה והמים.
import { D, today, profile, foodOf, targetOn, slots, entriesOn, dayDoc, dayTotals, waterGoalMl, CUP_ML } from '../data.js';
import { nutrients, qtyText } from '/shared/foods.js';
import { COMPONENTS } from '/shared/catalog.js';

const r1 = x => Math.round(x * 10) / 10;
const BRAND = '#1f7a52', INK = '#15211f', MUTED = '#5d6b68', SOFT = '#e3f1e9', BAND = '#eef2f1', LINE = '#d5dedb';
const COL = { p: '#c2453b', c: '#c48a12', f: '#7a4f9a', water: '#2d73b8' };

export async function buildDayPdf(date) {
  const W = 1240, H = 1754, M = 70, FONT = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif', R = W - M, L = M;
  const pages = []; let cx, y;
  const newPage = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); cx.direction = 'rtl'; cx.textBaseline = 'middle'; pages.push(cv); y = M; };
  const txt = (t, x, yy, o = {}) => {
    cx.font = `${o.weight || 400} ${o.size || 24}px ${FONT}`; cx.fillStyle = o.color || INK; cx.textAlign = o.align || 'right'; let str = String(t);
    if (o.max) { const full = str; while (str.length > 1 && cx.measureText(str).width > o.max) str = str.slice(0, -1); if (str !== full) str = str.slice(0, -1) + '…'; }
    cx.fillText(str, x, yy);
  };
  const rect = (x, yy, w, h, c) => { cx.fillStyle = c; cx.fillRect(x, yy, w, h); };
  const COLX = { s: 660, k: 540, p: 430, c: 330, f: 230 };
  const hdr = () => {
    rect(L, y, W - 2 * M, 46, BAND);
    txt('מוצר', R - 14, y + 24, { size: 21, weight: 700, color: MUTED });
    txt('מצב', COLX.s, y + 24, { size: 21, weight: 700, color: MUTED, align: 'center' }); txt('קק״ל', COLX.k, y + 24, { size: 21, weight: 700, color: MUTED, align: 'center' });
    txt('חלבון', COLX.p, y + 24, { size: 21, weight: 700, color: COL.p, align: 'center' }); txt('פחמ׳', COLX.c, y + 24, { size: 21, weight: 700, color: COL.c, align: 'center' }); txt('שומן', COLX.f, y + 24, { size: 21, weight: 700, color: COL.f, align: 'center' });
    y += 46;
  };
  const p = profile(date) || {}; const day = dayDoc(date); const T = targetOn(date); const tot = dayTotals(date);
  const w = [...D.state.weights].filter(x => x.date === date)[0]?.kg ?? null;
  const who = p.displayName || (D.session?.user?.email || '').split('@')[0];
  const [dy, dm, dd] = date.split('-'); const dateTxt = `${dd}.${dm}.${dy}`;

  newPage();
  txt('יומן תזונה · ' + who, R, y + 30, { size: 50, weight: 700, color: BRAND }); y += 72;
  txt(dateTxt + (w ? ` · משקל בוקר ${r1(w)} ק״ג` : '') + ' · ' + (day.train ? 'יום אימון' : 'יום בלי אימון'), R, y + 14, { size: 24, color: MUTED }); y += 44;
  if (T) { rect(L, y, W - 2 * M, 64, SOFT); txt(`יעד יומי: ${T.kcal.toLocaleString('he-IL')} קק״ל · חלבון ${T.protein} ג׳${T.carbs ? ` · פחמימה ${T.carbs} ג׳ · שומן ${T.fat} ג׳` : ''}`, R - 20, y + 33, { size: 28, weight: 700, color: BRAND }); y += 64; }
  y += 24;
  for (const s of slots(date)) {
    const es = entriesOn(date).filter(e => e.meal === s.id); if (!es.length) continue;
    if (y + 54 + 46 + 66 > H - M - 20) newPage();
    rect(L, y, W - 2 * M, 54, BAND); txt(`${s.label} · ${s.time}`, R - 16, y + 28, { size: 30, weight: 700 }); y += 58;
    hdr();
    for (const e of es) {
      const f = foodOf(e); const n = nutrients(f, e.grams); const rh = 66;
      if (y + rh > H - M - 20) { newPage(); hdr(); }
      txt(COMPONENTS[e.comp]?.name || f.n || '', R - 14, y + 21, { size: 25, max: 456 });
      txt(qtyText(f, e.grams, e.unit, e.qty), R - 14, y + 47, { size: 20, color: MUTED, max: 456 });
      txt(e.status === 'eaten' ? 'אכלתי' : 'תכננתי', COLX.s, y + rh / 2, { size: 21, color: e.status === 'eaten' ? BRAND : MUTED, align: 'center' });
      txt(Math.round(n.kcal), COLX.k, y + rh / 2, { size: 25, weight: 700, align: 'center' });
      txt(r1(n.protein), COLX.p, y + rh / 2, { size: 25, align: 'center', color: COL.p }); txt(r1(n.carbs), COLX.c, y + rh / 2, { size: 25, align: 'center', color: COL.c }); txt(r1(n.fat), COLX.f, y + rh / 2, { size: 25, align: 'center', color: COL.f });
      rect(L, y + rh - 1, W - 2 * M, 1, LINE); y += rh;
    }
    y += 18;
  }
  y += 10; if (y + 280 > H - M - 20) newPage();
  const e = tot.eaten;
  rect(L, y, W - 2 * M, 70, BRAND);
  txt(`נאכל: ${Math.round(e.kcal).toLocaleString('he-IL')} קק״ל · ח ${Math.round(e.protein)} · פ ${Math.round(e.carbs)} · ש ${Math.round(e.fat)}`, R - 20, y + 36, { size: 30, weight: 700, color: '#ffffff' }); y += 96;
  if (tot.planned.kcal > 0.5) { txt(`מתוכנן ועוד לא סומן כנאכל: ${Math.round(tot.planned.kcal).toLocaleString('he-IL')} קק״ל · ${Math.round(tot.planned.protein)} ג׳ חלבון`, R, y + 14, { size: 24, color: MUTED }); y += 44; }
  if (T) {
    const left = T.kcal - e.kcal, pl = T.protein - e.protein;
    txt(`${left >= 0 ? 'נשאר לאכול: ' : 'חריגה מהיעד: '}${Math.abs(Math.round(left)).toLocaleString('he-IL')} קק״ל · ${pl > 0 ? `חסרים ${Math.round(pl)} ג׳ חלבון` : 'יעד החלבון הושג'}`, R, y + 14, { size: 26, weight: 700, color: left >= 0 ? BRAND : '#b3261e' }); y += 44;
  }
  const cups = day.cups || 0;
  if (cups) { const cup = +p.cupMl || CUP_ML; txt(`מים: ${(cups * cup / 1000).toFixed(2)} מתוך ${(waterGoalMl(p, w) / 1000).toFixed(1)} ליטר`, R, y + 14, { size: 24, color: COL.water }); y += 44; }
  txt('הערכים משוערים ואינם ייעוץ רפואי. נוצר באפליקציה "תפריט יומי רובי".', R, y + 14, { size: 21, color: MUTED });
  return { blob: await pagesToPdf(pages), name: `יומן תזונה - ${who} - ${dateTxt}.pdf`, ascii: `tafrit-yomi-${date}.pdf` };
}

/** עמודי canvas → PDF (תמונת JPEG לכל עמוד, A4) */
export async function pagesToPdf(pages) {
  const jp = []; for (const c of pages) jp.push(await new Promise(res => c.toBlob(b => b.arrayBuffer().then(buf => res(new Uint8Array(buf))), 'image/jpeg', 0.9)));
  const enc = new TextEncoder(), chunks = [], offs = {}; let off = 0;
  const add = u => { if (typeof u === 'string') u = enc.encode(u); chunks.push(u); off += u.length; };
  const n = pages.length;
  add('%PDF-1.4\n');
  offs[1] = off; add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offs[2] = off; add('2 0 obj\n<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + n + ' >>\nendobj\n');
  pages.forEach((c, i) => {
    const po = 3 + i * 3, io = po + 1, co = po + 2, data = jp[i], cs = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    offs[po] = off; add(po + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>\nendobj\n');
    offs[io] = off; add(io + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + c.width + ' /Height ' + c.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + data.length + ' >>\nstream\n'); add(data); add('\nendstream\nendobj\n');
    offs[co] = off; add(co + ' 0 obj\n<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream\nendobj\n');
  });
  const total = 3 + n * 3, xo = off;
  let xr = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (let k = 1; k < total; k++) xr += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
  add(xr + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xo + '\n%%EOF');
  return new Blob(chunks, { type: 'application/pdf' });
}

/** שיתוף (וואטסאפ דרך חלון השיתוף של המכשיר) או שמירה */
export async function sendDayPdf(date, mode, msgEl) {
  const msg = t => { if (msgEl) msgEl.textContent = t; };
  if (!entriesOn(date).length) return msg('עוד לא נרשם אוכל ליום הזה.');
  msg('מכין PDF…');
  try {
    const { blob, name, ascii } = await buildDayPdf(date);
    const file = new File([blob], name, { type: 'application/pdf' });
    if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); msg(''); return; } catch (e) { if (e?.name === 'AbortError') { msg(''); return; } }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = ascii; /* שם לטיני: דפדפנים מסוימים מוחקים שם עברי בהורדה */ a.rel = 'noopener'; a.style.display = 'none'; document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
    msg(mode === 'share' ? 'הקובץ ירד למכשיר. בוואטסאפ: צירוף ← מסמך ← בחר את הקובץ.' : 'הקובץ נשמר ✓');
  } catch { msg('יצירת ה-PDF נכשלה. נסה שוב.'); }
}
