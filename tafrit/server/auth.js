// חשבונות: הרשמה בדוא״ל, אימות כתובת, כניסה, שחזור סיסמה, התנתקות, מחיקת חשבון ואימות דו-שלבי למנהל.
import { db, now, kvGet, kvSet, audit, deleteUserData } from './db.js';
import { hashPassword, verifyPassword, sha256, token, code6, id as rid, newTotpSecret, verifyTotp, encrypt, decrypt } from './crypto.js';
import { sendCode } from './mail.js';
import { migrateLegacyTo, createBackup } from './backup.js';

export const PRIVACY_VERSION = '2026-11-23';
const SESSION_DAYS = 180;
const MFA_HOURS = 12;
const CODE_MIN = 15;
const err = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });
export const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
function checkPassword(pw) {
  pw = String(pw || '');
  if (pw.length < 8) throw err(400, 'הסיסמה צריכה להיות באורך 8 תווים לפחות');
  if (pw.length > 200) throw err(400, 'הסיסמה ארוכה מדי');
  if (!/[A-Za-z֐-׿]/.test(pw) || !/\d/.test(pw)) throw err(400, 'הסיסמה צריכה לכלול גם אותיות וגם ספרות');
}
const ADMIN_EMAIL = () => normEmail(process.env.ADMIN_EMAIL || '');

// ---- הגבלת קצב (בזיכרון) ----
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = now(); const b = buckets.get(key) || { n: 0, t };
  if (t - b.t > windowMs) { b.n = 0; b.t = t; }
  b.n++; buckets.set(key, b);
  if (b.n > max) throw err(429, 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות');
}

const userBy = { email: db.prepare('SELECT * FROM users WHERE email = ?'), id: db.prepare('SELECT * FROM users WHERE id = ?') };
export const getUser = id => userBy.id.get(id) || null;
export function publicUser(u) {
  return u && { id: u.id, email: u.email, verified: !!u.email_verified_at, admin: isAdmin(u), totpEnabled: !!u.totp_enabled, aiConsent: !!u.ai_consent_at, privacyVersion: u.privacy_version, createdAt: u.created_at };
}
/** מנהל = רק החשבון שהמזהה שלו ננעל בשרת, ושגם מסומן כמנהל. הרשמה ציבורית תמיד "user" */
export function isAdmin(u) { const pinned = kvGet('admin_user_id'); return !!u && !!pinned && u.id === pinned && u.role === 'admin'; }

// ---- קודים חד-פעמיים בדוא״ל ----
async function issueCode(email, purpose, userId) {
  db.prepare('UPDATE codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL').run(now(), email, purpose);
  const c = code6();
  db.prepare('INSERT INTO codes (id, user_id, email, purpose, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(rid('k'), userId || null, email, purpose, sha256(`${purpose}:${email}:${c}`), now(), now() + CODE_MIN * 60e3);
  await sendCode(email, purpose, c);
}
function consumeCode(email, purpose, code) {
  const row = db.prepare('SELECT * FROM codes WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').get(email, purpose);
  if (!row || row.expires_at < now()) throw err(400, 'הקוד פג תוקף. בקש קוד חדש');
  if (row.attempts >= 5) throw err(429, 'יותר מדי ניסיונות. בקש קוד חדש');
  if (row.code_hash !== sha256(`${purpose}:${email}:${String(code || '').replace(/\D/g, '')}`)) {
    db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw err(400, 'הקוד שגוי');
  }
  db.prepare('UPDATE codes SET used_at = ? WHERE id = ?').run(now(), row.id);
  return row;
}

// ---- סשנים ----
export function createSession(userId, kind, device) {
  const t = token();
  db.prepare('INSERT INTO sessions (token_hash, user_id, kind, created_at, last_seen_at, expires_at, device) VALUES (?, ?, ?, ?, ?, ?, ?)').run(sha256(t), userId, kind === 'bearer' ? 'bearer' : 'cookie', now(), now(), now() + SESSION_DAYS * 864e5, String(device || '').slice(0, 80));
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), userId);
  return { token: t, maxAge: SESSION_DAYS * 86400 };
}
export function sessionFrom(tok) {
  if (!tok) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(tok));
  if (!s || s.expires_at < now()) return null;
  const u = getUser(s.user_id);
  if (!u || !u.email_verified_at) return null;
  if (now() - s.last_seen_at > 3600e3) db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now(), now() + SESSION_DAYS * 864e5, s.token_hash);
  return { session: s, user: u };
}
export function logout(tok) { if (tok) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(tok)); }
export function logoutAll(userId) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); }

// ---- הרשמה / אימות / כניסה ----
export async function register({ email, password, acceptPrivacy }) {
  email = normEmail(email);
  if (!validEmail(email)) throw err(400, 'כתובת דוא״ל לא תקינה');
  if (!acceptPrivacy) throw err(400, 'כדי להירשם צריך לאשר את מדיניות הפרטיות');
  checkPassword(password);
  const ex = userBy.email.get(email);
  if (ex?.email_verified_at) {
    // לא חושפים אם הכתובת רשומה: שולחים לבעלים קוד שחזור במקום הודעת שגיאה
    await issueCode(email, 'reset', ex.id).catch(() => {});
    return { ok: true, next: 'verify' };
  }
  const uid = ex?.id || rid('u');
  if (ex) db.prepare('UPDATE users SET pass_hash = ?, privacy_version = ?, privacy_accepted_at = ? WHERE id = ?').run(hashPassword(password), PRIVACY_VERSION, now(), uid);
  else db.prepare('INSERT INTO users (id, email, pass_hash, role, privacy_version, privacy_accepted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid, email, hashPassword(password), 'user', PRIVACY_VERSION, now(), now());
  await issueCode(email, 'verify', uid);
  return { ok: true, next: 'verify' };
}
export async function resendVerify(email) {
  email = normEmail(email); const u = userBy.email.get(email);
  if (u && !u.email_verified_at) await issueCode(email, 'verify', u.id);
  return { ok: true };
}
export function verifyEmail({ email, code, kind, device }) {
  email = normEmail(email);
  const u = userBy.email.get(email); if (!u) throw err(400, 'הקוד שגוי');
  consumeCode(email, 'verify', code);
  db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now(), u.id);
  // חשבון המנהל: רק הכתובת שהוגדרה בשרת (ADMIN_EMAIL), ורק בפעם הראשונה — המזהה ננעל
  let migration = null;
  if (ADMIN_EMAIL() && email === ADMIN_EMAIL() && !kvGet('admin_user_id')) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
    kvSet('admin_user_id', u.id);
    audit(u.id, 'admin_pinned', u.id);
    migration = migrateLegacyTo(u.id);
  }
  audit(u.id, 'email_verified', u.id);
  return { ...createSession(u.id, kind, device), user: publicUser(getUser(u.id)), migration };
}
export async function login({ email, password, kind, device }) {
  email = normEmail(email);
  const u = userBy.email.get(email);
  if (!u || !verifyPassword(password, u.pass_hash)) throw err(401, 'דוא״ל או סיסמה שגויים');
  if (!u.email_verified_at) { await issueCode(email, 'verify', u.id); return { needsVerify: true }; }
  audit(u.id, 'login', u.id);
  return { ...createSession(u.id, kind, device), user: publicUser(u) };
}
export async function requestReset(email) {
  email = normEmail(email); const u = userBy.email.get(email);
  if (u) await issueCode(email, 'reset', u.id);
  return { ok: true }; // תמיד אותה תשובה — לא חושפים אם יש חשבון
}
export function resetPassword({ email, code, password }) {
  email = normEmail(email); const u = userBy.email.get(email);
  if (!u) throw err(400, 'הקוד שגוי');
  checkPassword(password);
  consumeCode(email, 'reset', code);
  db.prepare('UPDATE users SET pass_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(hashPassword(password), now(), u.id);
  logoutAll(u.id); // כל המכשירים מתנתקים
  audit(u.id, 'password_reset', u.id);
  return { ok: true };
}
export function changePassword(user, { current, password }) {
  if (!verifyPassword(current, user.pass_hash)) throw err(400, 'הסיסמה הנוכחית שגויה');
  checkPassword(password);
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  audit(user.id, 'password_changed', user.id);
  return { ok: true };
}
export function setAiConsent(user, on) { db.prepare('UPDATE users SET ai_consent_at = ? WHERE id = ?').run(on ? now() : null, user.id); audit(user.id, on ? 'ai_consent_given' : 'ai_consent_withdrawn', user.id); return { ok: true }; }

// ---- מחיקת חשבון ----
function removeAccount(u, how) {
  if (isAdmin(u)) throw err(400, 'אי אפשר למחוק את חשבון המנהל מתוך האפליקציה');
  createBackup('before-delete'); // הגיבויים המוצפנים נמחקים אוטומטית במחזור (21 גיבויים)
  const n = deleteUserData(u.id);
  audit(null, 'account_deleted', u.id, null, { how, records: n });
  return { ok: true, deleted: n };
}
export function deleteAccount(user, password) {
  if (!verifyPassword(password, user.pass_hash)) throw err(400, 'הסיסמה שגויה');
  return removeAccount(user, 'in_app');
}
export async function requestDeletion(email) { email = normEmail(email); const u = userBy.email.get(email); if (u && !isAdmin(u)) await issueCode(email, 'delete', u.id); return { ok: true }; }
export function confirmDeletion({ email, code }) {
  email = normEmail(email); const u = userBy.email.get(email); if (!u) throw err(400, 'הקוד שגוי');
  consumeCode(email, 'delete', code);
  return removeAccount(u, 'web_request');
}

// ---- אימות דו-שלבי (TOTP) למנהל ----
/** מפתח ממתין נשמר עד ההפעלה (חזרה מאפליקציית הסיסמאות / רענון לא מחליפים אותו). fresh=true יוצר מפתח חדש */
export function totpSetup(user, fresh = false) {
  if (!isAdmin(user)) throw err(403, 'אין הרשאה');
  if (user.totp_enabled) throw err(400, 'אימות דו-שלבי כבר מופעל');
  const cur = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id)?.totp_secret;
  let secret = !fresh && cur ? decrypt(cur) : null;
  if (!secret) { secret = newTotpSecret(); db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?').run(encrypt(secret), user.id); }
  const label = encodeURIComponent(`תפריטי פרו:${user.email}`);
  return { secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('תפריטי פרו')}&digits=6&period=30` };
}
function checkTotp(user, code) {
  const fresh = getUser(user.id);
  if (!fresh.totp_secret) throw err(400, 'אימות דו-שלבי לא הוגדר');
  const step = verifyTotp(decrypt(fresh.totp_secret), code);
  if (step == null || (fresh.totp_last_step && step <= fresh.totp_last_step)) throw err(400, 'הקוד שגוי או שכבר נוצל');
  db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id);
}
export function totpEnable(user, session, code) {
  if (!isAdmin(user)) throw err(403, 'אין הרשאה');
  rateLimit('totp:' + user.id, 8, 10 * 60e3);
  try { checkTotp(user, code); } catch (e) { audit(user.id, 'mfa_failed', user.id); throw e; }
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  db.prepare('UPDATE sessions SET mfa_at = ? WHERE token_hash = ?').run(now(), session.token_hash);
  audit(user.id, 'mfa_enabled', user.id);
  return { ok: true };
}
export function totpVerify(user, session, code, ip) {
  if (!isAdmin(user)) throw err(403, 'אין הרשאה');
  rateLimit('totp:' + user.id, 8, 10 * 60e3);
  try { checkTotp(user, code); } catch (e) { audit(user.id, 'mfa_failed', user.id, ip); throw e; }
  db.prepare('UPDATE sessions SET mfa_at = ? WHERE token_hash = ?').run(now(), session.token_hash);
  audit(user.id, 'mfa_verified', user.id, ip);
  return { ok: true };
}
/** האם הסשן הנוכחי של המנהל עבר אימות דו-שלבי לאחרונה */
export function adminReady(ctx) {
  return isAdmin(ctx.user) && !!ctx.user.totp_enabled && !!ctx.session.mfa_at && now() - ctx.session.mfa_at < MFA_HOURS * 3600e3;
}
