// אחסון: SQLite מובנה. כל מסמך אישי שייך למשתמש (user_id) ומוצפן באחסון (AES-256-GCM).
// כל פונקציה שקוראת או כותבת נתון אישי מקבלת uid — אין גישה לנתונים בלי מזהה המשתמש המחובר.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { encrypt, decrypt, initKey, id as rid } from './crypto.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data-local');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, 'tafrit.sqlite');
export const KEY_SOURCE = initKey(DATA_DIR);
export const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;`);

// ---- סכמה + מיגרציה מהגרסה של משתמש יחיד ----
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
const hasTable = t => !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
if (hasTable('docs') && !cols('docs').includes('user_id')) {
  // גרסה ישנה: מסמכים בלי בעלים. מעבירים לטבלה חדשה עם user_id ריק (= "ממתין לשיוך"), בלי לשנות תוכן
  db.exec(`ALTER TABLE docs RENAME TO docs_legacy;`);
}
if (hasTable('chat') && !cols('chat').includes('user_id')) db.exec(`ALTER TABLE chat RENAME TO chat_legacy;`);
if (hasTable('history') && !cols('history').includes('user_id')) db.exec(`ALTER TABLE history RENAME TO history_legacy;`);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
    email_verified_at INTEGER, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, totp_last_step INTEGER,
    privacy_version TEXT, privacy_accepted_at INTEGER, ai_consent_at INTEGER, created_at INTEGER NOT NULL, last_login_at INTEGER);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL,
    created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, mfa_at INTEGER, device TEXT);
  CREATE TABLE IF NOT EXISTS codes (id TEXT PRIMARY KEY, user_id TEXT, email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_at INTEGER);
  CREATE TABLE IF NOT EXISTS docs (user_id TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, col, id));
  CREATE TABLE IF NOT EXISTS history (seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, col TEXT, id TEXT, action TEXT, before TEXT, after TEXT, at INTEGER);
  CREATE TABLE IF NOT EXISTS chat (seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, role TEXT, content TEXT, at INTEGER);
  CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor_id TEXT, action TEXT NOT NULL, target_user_id TEXT, ip TEXT, meta TEXT);
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS ops (user_id TEXT NOT NULL, op TEXT NOT NULL, result TEXT, at INTEGER, PRIMARY KEY (user_id, op));
  CREATE INDEX IF NOT EXISTS docs_user_col ON docs(user_id, col);
  CREATE INDEX IF NOT EXISTS history_user ON history(user_id, col, id);
  CREATE INDEX IF NOT EXISTS chat_user ON chat(user_id, seq);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`);
// טבלת ops הישנה (בלי user_id) — לא נחוצה יותר
if (cols('ops').length && !cols('ops').includes('user_id')) { db.exec('DROP TABLE ops'); db.exec('CREATE TABLE ops (user_id TEXT NOT NULL, op TEXT NOT NULL, result TEXT, at INTEGER, PRIMARY KEY (user_id, op))'); }

export const now = () => Date.now();
export const newId = (p = '') => rid(p).slice(0, p.length + 16);
export function tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }
const need = uid => { if (!uid || typeof uid !== 'string') throw Object.assign(new Error('נדרשת כניסה'), { status: 401 }); return uid; };

const q = {
  get: db.prepare('SELECT data, created_at, updated_at FROM docs WHERE user_id = ? AND col = ? AND id = ?'),
  list: db.prepare('SELECT id, data, created_at, updated_at FROM docs WHERE user_id = ? AND col = ? ORDER BY id'),
  put: db.prepare('INSERT INTO docs (user_id, col, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
  del: db.prepare('DELETE FROM docs WHERE user_id = ? AND col = ? AND id = ?'),
  hist: db.prepare('INSERT INTO history (user_id, col, id, action, before, after, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  histOf: db.prepare('SELECT action, before, after, at FROM history WHERE user_id = ? AND col = ? AND id = ? ORDER BY seq'),
};
const dec = s => JSON.parse(decrypt(s));
const wrap = (id, row) => row ? { ...dec(row.data), id, createdAt: row.created_at, updatedAt: row.updated_at } : null;

export function getDoc(uid, col, id) { return wrap(id, q.get.get(need(uid), col, id)); }
export function listDocs(uid, col) { return q.list.all(need(uid), col).map(r => wrap(r.id, r)); }
export function putDoc(uid, col, id, data, action = 'save') {
  need(uid); const t = now();
  const before = q.get.get(uid, col, id);
  const clean = { ...data }; delete clean.id; delete clean.createdAt; delete clean.updatedAt;
  const enc = encrypt(JSON.stringify(clean));
  q.put.run(uid, col, id, enc, before ? before.created_at : t, t);
  q.hist.run(uid, col, id, before ? action : 'create', before ? before.data : null, enc, t);
  return getDoc(uid, col, id);
}
export function deleteDoc(uid, col, id) {
  need(uid); const before = q.get.get(uid, col, id); if (!before) return false;
  q.del.run(uid, col, id); q.hist.run(uid, col, id, 'delete', before.data, null, now());
  return true;
}
export function docHistory(uid, col, id) { return q.histOf.all(need(uid), col, id).map(h => ({ action: h.action, before: h.before && dec(h.before), after: h.after && dec(h.after), at: h.at })); }
export function countDocs(uid) { return Object.fromEntries(db.prepare('SELECT col, COUNT(*) n FROM docs WHERE user_id = ? GROUP BY col').all(need(uid)).map(r => [r.col, r.n])); }

export function kvGet(k) { const r = db.prepare('SELECT v FROM kv WHERE k = ?').get(k); return r ? JSON.parse(r.v) : null; }
export function kvSet(k, v) { db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v)); }

/** פעולה חד-פעמית לכל משתמש: ניסיון חוזר עם אותו opId לא נרשם פעמיים */
export function once(uid, opId, fn) {
  if (!opId) return fn();
  const hit = db.prepare('SELECT result FROM ops WHERE user_id = ? AND op = ?').get(need(uid), String(opId));
  if (hit) return JSON.parse(hit.result);
  const r = fn();
  db.prepare('INSERT OR IGNORE INTO ops (user_id, op, result, at) VALUES (?, ?, ?, ?)').run(uid, String(opId), JSON.stringify(r ?? null), now());
  return r;
}

export function chatAppend(uid, role, content) { db.prepare('INSERT INTO chat (user_id, role, content, at) VALUES (?, ?, ?, ?)').run(need(uid), role, encrypt(JSON.stringify(content)), now()); }
export function chatList(uid, limit = 200) { return db.prepare('SELECT seq, role, content, at FROM (SELECT * FROM chat WHERE user_id = ? ORDER BY seq DESC LIMIT ?) ORDER BY seq').all(need(uid), limit).map(r => ({ seq: r.seq, role: r.role, content: dec(r.content), at: r.at })); }
export function chatClear(uid) { db.prepare('DELETE FROM chat WHERE user_id = ?').run(need(uid)); }

/** יומן ביקורת: מי עשה מה ומתי — בלי תוכן הפרופיל */
export function audit(actorId, action, targetUserId = null, ip = null, meta = null) {
  db.prepare('INSERT INTO audit (at, actor_id, action, target_user_id, ip, meta) VALUES (?, ?, ?, ?, ?, ?)').run(now(), actorId, action, targetUserId, ip, meta ? JSON.stringify(meta) : null);
}
export function auditList({ limit = 200, actor, target } = {}) {
  let sql = 'SELECT * FROM audit'; const w = []; const a = [];
  if (actor) { w.push('actor_id = ?'); a.push(actor); } if (target) { w.push('target_user_id = ?'); a.push(target); }
  if (w.length) sql += ' WHERE ' + w.join(' AND ');
  return db.prepare(sql + ' ORDER BY seq DESC LIMIT ?').all(...a, limit).map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}

/** מחיקת כל המידע של משתמש */
export function deleteUserData(uid) {
  need(uid);
  return tx(() => {
    const n = db.prepare('SELECT COUNT(*) n FROM docs WHERE user_id = ?').get(uid).n;
    for (const t of ['docs', 'history', 'chat', 'ops']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
    db.prepare('DELETE FROM codes WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    return n;
  });
}
