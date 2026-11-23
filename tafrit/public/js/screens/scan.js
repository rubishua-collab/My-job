// מצלמה: קריאת ברקוד (במכשיר, בלי שליחה לשרת) וקריאת טבלה תזונתית מתמונה (דרך ספק ה-AI, באישור המשתמש).
// הועבר מ״יומן התזונה של רובי״: אותו סדר פעולות, אותן הודעות ואותה בחירה בין גרמים ליחידות.
import { D } from '../data.js';
import { save } from '../api.js';

let zxingP = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingP) zxingP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/vendor/zxing-0.21.3.min.js';
    s.onload = () => res(window.ZXing); s.onerror = () => { zxingP = null; rej(new Error('zxing')); };
    document.head.append(s);
  });
  return zxingP;
}
function drawScaled(img, max, rot) {
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
  const c = document.createElement('canvas'); const x = c.getContext('2d', { willReadFrequently: true });
  if (rot) { c.width = h; c.height = w; x.translate(h, 0); x.rotate(Math.PI / 2); } else { c.width = w; c.height = h; }
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); return c;
}
/** ברקוד מתמונה: BarcodeDetector של הדפדפן, ואם אין — ZXing (מקומי, בכמה גדלים וסיבוב) */
export async function decodeBarcode(file) {
  const img = await createImageBitmap(file);
  if ('BarcodeDetector' in window) {
    try { const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'] }); const r = await det.detect(img); if (r.length) return r[0].rawValue; } catch {}
  }
  const Z = await loadZXing();
  const hints = new Map();
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.ITF]);
  const reader = new Z.MultiFormatReader(); reader.setHints(hints);
  for (const [max, rot] of [[1400, false], [900, false], [1400, true], [2000, false]]) {
    try { const c = drawScaled(img, max, rot); const bb = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c))); return reader.decode(bb).getText(); } catch { reader.reset(); }
  }
  return null;
}
export const normBc = s => String(s || '').replace(/\D/g, '');
const bcKey = s => normBc(s).replace(/^0+/, '');
/** מוצר אישי לפי ברקוד, מתוך המוצרים שכבר נטענו */
export function findByBarcode(bc) { const k = bcKey(bc); return k ? D.state.custom.find(c => c.barcode && bcKey(c.barcode) === k) || null : null; }

/** הקטנת תמונה ל-JPEG (גם מסיר נתוני מיקום/EXIF) לפני שליחה */
async function toJpegBase64(file, max = 1600) {
  const img = await createImageBitmap(file);
  const c = drawScaled(img, max, false);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}
/** קריאת טבלה תזונתית: מחזיר ערכים ל-100 ג׳/מ״ל, ואם יש — משקל יחידה */
export async function readLabelPhoto(file) {
  if (!D.session?.ai) { const e = new Error('קריאת תמונות לא זמינה כרגע. אפשר להזין את הערכים ידנית.'); e.code = 'ai_off'; throw e; }
  if (!D.session.user.aiConsent) { const e = new Error('כדי לקרוא תמונה צריך לאשר שליחה לספק ה-AI.'); e.code = 'consent'; throw e; }
  const image = await toJpegBase64(file);
  return save('POST', '/api/ai/label', { image, mediaType: 'image/jpeg' }, { quiet: true });
}
