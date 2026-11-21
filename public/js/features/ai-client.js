// ai-client.js — עזר משותף לקריאת צילומים ומסמכים דרך Claude (רץ בשרת: POST /api/ai/extract).
//
// שימוש:
//   import { extract, aiStatus, AiError } from './ai-client.js';
//   const { entries, note } = await extract('collectors', fileInput.files, '', { collector: 'רובי' });
//
// extract(task, input, text?, opts?) → Promise<data>
//   task:  'collectors'  צילום חשבון גובים      → { entries:[{k:'d'|'e', n, a, c, u}], note, debts, expenses }
//                         (opts.collector = גובה ברירת מחדל לשורות בלי גובה, כמו ״גובה, אם לא מופיע בשורות״ במקור)
//          'list'        צילום רשימת איסוף/פיצול → { entries:[{n, a, t, s, p, c, u}], note, items }   (שמות נוספים: 'work', 'split')
//          'loans'       צילום הלוואות שניתנו   → { entries:[{n, a, u}], note, items }
//          'id_card'     ת״ז: [צד קדמי, ספח?]   → { firstName, lastName, idNumber, birthDate:'DD.MM.YYYY', address, notes, idValid }  (בעלים/מנהל בלבד)
//          'contract_import'  צילום חוזה → { template, builtin:{...}, custom:{...}, issues:[...] }
//          'contract_review'  text = הנוסח, opts.form = פרטי הטופס → { issues:[{quote, problem, fix}] }
//          'contract_ocr'     עמוד אחד (עד 5 רצועות), opts.page/opts.total → { text, truncated }
//          'contract_detect'  text = החוזה עם ⟦S1⟧… → { parties, slots, extra }
//          'custom'           text = הנחיה מלאה, opts.schema = JSON schema (אופציונלי) → התשובה כ-JSON (או {text} כשאין schema ואין JSON)
//   input: File / Blob / FileList / data URL (string) או מערך שלהם. תמונות מוקטנות בדפדפן ל-JPEG (עד 2400px, ~1.6 מגה-פיקסל).
//          PDF לא נתמך כאן: רנדרו את העמוד ל-canvas (pdfjsLib) ושלחו canvas.toDataURL('image/jpeg', 0.9).
//   text:  טקסט נוסף (במשימות טקסט זה התוכן עצמו)
//   opts:  { collector, form, page, total, schema, signal, timeout(ms, ברירת מחדל 150000) }
//
// שגיאות: נזרק AiError עם .message בעברית (מוכן להצגה), .status, ו-.notConfigured=true כשאין ANTHROPIC_API_KEY בשרת (503).
//   על 503 הציגו: AI_OFF_MSG (״קריאת תמונות דורשת חיבור ל-Claude — הגדרות״) ותנו להקליד ידנית.
// aiStatus() → Promise<{configured, tasks:[...], command}> (נשמר בזיכרון; aiStatus(true) מרענן)
// toDataURL(fileOrBlob, {maxDim, maxPx, quality}) → Promise<string>  הקטנה ל-JPEG
// post(url, body, opts) — בקשת JSON ארוכה (בלי תור ניסיונות חוזרים: קריאה ל-Claude לא נשלחת שוב לבד)

export const AI_OFF_MSG = 'קריאת תמונות דורשת חיבור ל-Claude — הגדרות';
export class AiError extends Error {
  constructor(msg, status, extra) { super(msg); this.status = status; Object.assign(this, extra || {}); }
}

export async function post(url, body, { timeout = 150000, signal } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
  let r;
  try {
    r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw new AiError(signal?.aborted ? 'בוטל.' : (ctl.signal.aborted ? 'Claude לא ענה בזמן. נסה שוב.' : 'אין תשובה מהשרת (בעיית קליטה)'), 0, { network: true, cancelled: !!signal?.aborted });
  } finally { clearTimeout(t); }
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (r.status === 401) { location.hash = '#/login'; throw new AiError('צריך להתחבר', 401); }
  if (!r.ok) throw new AiError((j && j.error) || 'הקריאה נכשלה. נסה שוב.', r.status, { notConfigured: r.status === 503 && /ANTHROPIC_API_KEY/.test((j && j.error) || ''), current: j && j.current });
  return j;
}

let statusP = null;
export function aiStatus(refresh = false) {
  if (!statusP || refresh) statusP = fetch('/api/ai/status', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { configured: false, tasks: [], command: false }).catch(() => { statusP = null; return { configured: false, tasks: [], command: false }; });
  return statusP;
}

const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = url; });
export async function toDataURL(src, { maxDim = 2400, maxPx = 1.6e6, quality = 0.9 } = {}) {
  if (typeof src === 'string') return src;
  const url = URL.createObjectURL(src);
  try {
    const im = await loadImg(url); const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    let k = Math.min(1, maxDim / Math.max(w, h)); if (w * h * k * k > maxPx) k = Math.sqrt(maxPx / (w * h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/jpeg', quality);
    if (out.length > 6.5e6) out = c.toDataURL('image/jpeg', 0.75); // ~5MB אחרי פענוח
    c.width = c.height = 0;
    return out;
  } catch { throw new AiError('לא הצלחתי לפתוח את התמונה. נסה צילום JPG או PNG.', 400); }
  finally { URL.revokeObjectURL(url); }
}

export async function extract(task, input, text = '', opts = {}) {
  const list = input == null ? [] : (typeof input === 'string' || input instanceof Blob) ? [input] : Array.from(input);
  const images = [];
  for (const f of list) {
    if (f instanceof Blob && f.type === 'application/pdf') throw new AiError('PDF: יש להמיר כל עמוד לתמונה לפני השליחה', 400);
    images.push(await toDataURL(f));
  }
  const { signal, timeout, ...rest } = opts;
  const j = await post('/api/ai/extract', { task, images, text, ...rest }, { signal, timeout });
  return j.data;
}
