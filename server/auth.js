// משתמשים, סיסמאות והרשאות לפי תפקיד
import crypto from 'node:crypto';
import { db, now, newId, sha256 } from './db.js';

export const ROLES = {
  owner: 'בעלים',       // הכול, כולל משתמשים, גיבוי ושחזור
  manager: 'מנהל',      // הכול חוץ מניהול משתמשים ושחזור גיבוי
  collector: 'גובה',    // רק האיסופים שלו: שם, טלפון, סכום, שעה וסטטוס
};

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('base64') + '$' + h.toString('base64');
}
export function checkPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(h, 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export function createUser({ username, name, role, collector_name, password }) {
  if (!ROLES[role]) throw Object.assign(new Error('תפקיד לא תקין'), { status: 400 });
  if (!username || !password || String(password).length < 8) throw Object.assign(new Error('שם משתמש וסיסמה של 8 תווים לפחות'), { status: 400 });
  if (role === 'collector' && !collector_name) throw Object.assign(new Error('לגובה צריך לבחור את שם הגובה כפי שמופיע בחשבונות'), { status: 400 });
  const id = newId('u_');
  db.prepare('INSERT INTO users(id,username,name,role,collector_name,pass_hash,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, String(username).trim().toLowerCase(), name || username, role, collector_name || null, hashPassword(password), now());
  return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
}
export const publicUser = (u) => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, roleName: ROLES[u.role], collector_name: u.collector_name, disabled: !!u.disabled });

const SESSION_DAYS = 60;
export function login(username, password, ua) {
  const u = db.prepare('SELECT * FROM users WHERE username=? AND disabled=0').get(String(username || '').trim().toLowerCase());
  if (!u || !checkPassword(password, u.pass_hash)) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,ua) VALUES(?,?,?,?,?)')
    .run(sha256(token), u.id, now(), now() + SESSION_DAYS * 864e5, String(ua || '').slice(0, 200));
  return { token, user: publicUser(u), maxAge: SESSION_DAYS * 86400 };
}
export function sessionUser(token) {
  if (!token) return null;
  const r = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0').get(sha256(token), now());
  return r ? publicUser(r) : null;
}
export function logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token)); }

// בדיקות הרשאה
export const can = {
  finance: u => u && (u.role === 'owner' || u.role === 'manager'),   // קרן, נטו, הלוואות, דוחות
  sensitive: u => u && (u.role === 'owner' || u.role === 'manager'), // חוזים, תעודות זהות, קבצים
  users: u => u && u.role === 'owner',
  restore: u => u && u.role === 'owner',
  send: u => u && (u.role === 'owner' || u.role === 'manager'),
  waConfig: u => u && u.role === 'owner',
};
