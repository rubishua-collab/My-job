// קריאה ל-Claude דרך ה-API של Anthropic (Messages API), בלי תלויות: fetch רגיל.
// משתני סביבה: ANTHROPIC_API_KEY (חובה), ANTHROPIC_BASE_URL (ברירת מחדל https://api.anthropic.com — בבדיקות: שרת מדומה),
// ANTHROPIC_MODEL (ברירת מחדל claude-opus-5-5), ANTHROPIC_TIMEOUT_MS (ברירת מחדל 120000).
// לא נרשם ללוג שום תוכן: לא הנחיה, לא תמונה, לא תשובה (יש בהן שמות, טלפונים ומספרי ת״ז). רק משימה, סטטוס, זמן וטוקנים.

export const MODEL_DEFAULT = 'claude-opus-5-5';
export const configured = () => !!process.env.ANTHROPIC_API_KEY;
const base = () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');

const herr = (status, message, code) => Object.assign(new Error(message), { status, code });

// הודעות השגיאה בעברית — לפי sampleErr המקורי (app.html 2352-2361)
export const MSG = {
  rate_limited: 'יותר מדי בקשות כרגע. נסה שוב בעוד כמה דקות.',
  invalid_json: 'לא הצלחתי לקרוא את התוצאה. נסה שוב או פצל את הצילום.',
  image_rejected: 'הצילום לא התקבל. נסה קובץ PNG או JPG אחר.',
  refused: 'הצילום לא נקרא. נסה צילום אחר.',
  refused_text: 'Claude סירב לבצע את הבקשה. נסח אותה אחרת.',
  failed: 'הקריאה נכשלה. נסה שוב.',
  timeout: 'Claude לא ענה בזמן. נסה שוב.',
  too_long: 'התשובה ארוכה מדי ונקטעה. פצל את הצילום או את הבקשה ונסה שוב.',
  bad_key: 'מפתח ה-API של Claude לא תקין. בדוק את ANTHROPIC_API_KEY.',
  overloaded: 'Claude עמוס כרגע. נסה שוב בעוד דקה.',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * שולח בקשה אחת ל-Claude.
 * @param {object} o
 * @param {Array<{media_type:string,data:string}>} [o.images] תמונות base64 (נשלחות לפני הטקסט)
 * @param {string} o.prompt
 * @param {object} [o.schema] JSON schema לתשובה (structured outputs). בלי schema: format='json' מחלץ JSON מהטקסט, format='text' מחזיר טקסט
 * @param {'low'|'medium'|'high'} [o.effort]
 * @param {'json'|'text'} [o.format]
 * @param {string} [o.task] לשם הלוג בלבד
 * @returns {Promise<{data?:any, text?:string, truncated?:boolean}>}
 */
export async function ask({ images = [], prompt, schema, effort = 'low', format = 'json', maxTokens = 16000, task = '' }) {
  if (!configured()) throw herr(503, 'קריאת תמונות דורשת חיבור ל-Claude: הגדר ANTHROPIC_API_KEY', 'not_configured');
  const content = [
    ...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
    { type: 'text', text: prompt },
  ];
  // בלי thinking (במודל הזה הוא אדפטיבי כברירת מחדל ואי אפשר לכבות), בלי temperature/top_p
  const body = { model: process.env.ANTHROPIC_MODEL || MODEL_DEFAULT, max_tokens: maxTokens, messages: [{ role: 'user', content }], output_config: { effort } };
  if (schema) body.output_config.format = { type: 'json_schema', schema };
  const json = JSON.stringify(body);
  const timeout = +process.env.ANTHROPIC_TIMEOUT_MS || 120000;
  const t0 = Date.now();
  let res, out;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(base() + '/v1/messages', {
        method: 'POST', body: json, signal: AbortSignal.timeout(timeout),
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      });
    } catch (e) {
      console.log(`ai ${task}: ${e.name === 'TimeoutError' ? 'timeout' : 'network error'} after ${Date.now() - t0}ms`);
      throw herr(504, e.name === 'TimeoutError' ? MSG.timeout : MSG.failed, e.name === 'TimeoutError' ? 'timeout' : 'network');
    }
    out = await res.json().catch(() => null);
    // ניסיון חוזר אחד על עומס / שגיאת שרת / הגבלת קצב
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 1) {
      const ra = Math.min(10, +res.headers.get('retry-after') || 1.5);
      await sleep(ra * 1000); continue;
    }
    break;
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    const type = out?.error?.type || '';
    console.log(`ai ${task}: api ${res.status} ${type} ${ms}ms`);
    if (res.status === 401 || res.status === 403) throw herr(502, MSG.bad_key, 'bad_key');
    if (res.status === 429) throw herr(429, MSG.rate_limited, 'rate_limited');
    if (res.status === 529) throw herr(503, MSG.overloaded, 'overloaded');
    if (res.status === 400 && images.length && /image/i.test(out?.error?.message || '')) throw herr(400, MSG.image_rejected, 'image_rejected');
    if (res.status === 413) throw herr(413, MSG.image_rejected, 'image_rejected');
    throw herr(502, MSG.failed, 'api_error');
  }
  const u = out?.usage || {};
  console.log(`ai ${task}: ${out?.stop_reason} ${ms}ms in=${u.input_tokens ?? '?'} out=${u.output_tokens ?? '?'}`);
  if (out?.stop_reason === 'refusal') throw herr(422, images.length ? MSG.refused : MSG.refused_text, 'refused');
  // קוראים לפי סוג הבלוק, לא לפי מיקום (יכולים להופיע בלוקי thinking לפני הטקסט)
  const text = (out?.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
  const truncated = out?.stop_reason === 'max_tokens';
  if (format === 'text') return { text, truncated };
  if (truncated) throw herr(502, MSG.too_long, 'max_tokens');
  return { data: parseJson(text) };
}

export function parseJson(t) {
  t = String(t || '');
  try { return JSON.parse(t); } catch { /* */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* */ } }
  throw herr(502, MSG.invalid_json, 'invalid_json');
}

// תמונות מהדפדפן: data URL בלבד, סוגים שה-API מקבל, גודל מוגבל
export const IMG_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const IMG_MAX_BYTES = 5 * 1024 * 1024;   // לכל תמונה (מגבלת ה-API)
export const IMG_MAX_TOTAL = 20 * 1024 * 1024;  // לכל הבקשה
export function parseImages(list, max) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw herr(400, 'תמונות לא תקינות');
  if (list.length > max) throw herr(400, `אפשר לשלוח עד ${max} תמונות בפעם אחת`);
  let total = 0;
  return list.map((u) => {
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(u || ''));
    if (!m) throw herr(400, MSG.image_rejected, 'image_rejected');
    const media_type = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
    if (!IMG_TYPES.includes(media_type)) throw herr(400, 'סוג הקובץ לא נתמך. שלח צילום JPG, PNG או WEBP', 'image_rejected');
    const data = m[2].replace(/\s+/g, '');
    const bytes = Math.floor(data.length * 3 / 4);
    if (bytes > IMG_MAX_BYTES) throw herr(413, 'הצילום גדול מדי (עד 5MB). הקטן אותו ונסה שוב', 'image_rejected');
    total += bytes; if (total > IMG_MAX_TOTAL) throw herr(413, 'הצילומים גדולים מדי יחד. שלח פחות צילומים בכל פעם', 'image_rejected');
    return { media_type, data };
  });
}
