// הצפנה, סיסמאות, אסימונים ואימות דו-שלבי (TOTP). הכל ב-node:crypto, בלי תלויות.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let KEY = null;
/** מפתח ההצפנה של המידע באחסון: DATA_ENCRYPTION_KEY (64 תווי hex). בלעדיו נוצר מפתח בקובץ (מתאים לפיתוח בלבד). */
export function initKey(dataDir) {
  const env = process.env.DATA_ENCRYPTION_KEY;
  if (env) {
    // 64 תווי hex = המפתח עצמו. כל מחרוזת אקראית אחרת באורך 32+ (למשל מכפתור Generate של Render) → נגזר ממנה מפתח ב-SHA-256
    if (/^[0-9a-f]{64}$/i.test(env)) KEY = Buffer.from(env, 'hex');
    else if (env.length >= 32) KEY = crypto.createHash('sha256').update('tafrit-data-key:' + env).digest();
    else throw new Error('DATA_ENCRYPTION_KEY קצר מדי — לפחות 32 תווים');
    return 'env';
  }
  const f = path.join(dataDir, '.data-key');
  if (fs.existsSync(f)) KEY = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
  else { KEY = crypto.randomBytes(32); fs.writeFileSync(f, KEY.toString('hex'), { mode: 0o600 }); }
  if (process.env.NODE_ENV === 'production') console.warn('[security] DATA_ENCRYPTION_KEY לא הוגדר — משתמש במפתח מקובץ בדיסק. מומלץ להגדיר אותו כמשתנה סביבה.');
  return 'file';
}

/** AES-256-GCM. פורמט: e1:<iv>:<tag>:<ciphertext> (base64) */
export function encrypt(text, key = KEY) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `e1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
export function decrypt(s, key = KEY) {
  if (typeof s !== 'string' || !s.startsWith('e1:')) return s; // נתון ישן שלא הוצפן
  const [, iv, tag, data] = s.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
/** הצפנת קובץ שלם (לגיבויים) */
export function encryptBuffer(buf, key = KEY) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('TFRB1'), iv, c.getAuthTag(), enc]);
}
export function decryptBuffer(buf, key = KEY) {
  if (buf.subarray(0, 5).toString() !== 'TFRB1') throw new Error('קובץ גיבוי לא מוכר');
  const iv = buf.subarray(5, 17), tag = buf.subarray(17, 33);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(33)), d.final()]);
}

// ---- סיסמאות (scrypt) ----
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, SCRYPT);
  return `s1:${salt.toString('base64')}:${h.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  if (!stored?.startsWith('s1:')) return false;
  const [, salt, h] = stored.split(':');
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), 32, SCRYPT);
  return crypto.timingSafeEqual(got, Buffer.from(h, 'base64'));
}
export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
export const code6 = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
export const id = (p = '') => p + crypto.randomBytes(10).toString('hex');
export function safeEqual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// ---- TOTP (RFC 6238): 6 ספרות, 30 שניות, SHA-1 — תואם Google Authenticator / סיסמאות של iOS ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
export function unbase32(s) { const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, v = 0; const out = []; for (const ch of clean) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
export const newTotpSecret = () => base32(crypto.randomBytes(20));
export function totp(secret, t = Date.now(), step = 30) {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / step)));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
/** בודק קוד עם סובלנות של ±1 חלון. מחזיר את מספר החלון כדי למנוע שימוש חוזר באותו קוד */
export function verifyTotp(secret, code, t = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  for (const d of [0, -1, 1]) { const tt = t + d * 30000; if (safeEqual(totp(secret, tt), c)) return Math.floor(tt / 30000); }
  return null;
}
