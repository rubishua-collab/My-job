// אחסון: SQLite מובנה ב-Node. כל אוסף נשמר כמסמכי JSON עם זמן יצירה ועדכון, וכל שינוי נרשם בהיסטוריה.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data-local');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(path.join(DATA_DIR, 'tafrit.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (col, id));
  CREATE TABLE IF NOT EXISTS history (seq INTEGER PRIMARY KEY AUTOINCREMENT, col TEXT, id TEXT, action TEXT, before TEXT, after TEXT, at INTEGER);
  CREATE TABLE IF NOT EXISTS chat (seq INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT, at INTEGER);
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS ops (op TEXT PRIMARY KEY, result TEXT, at INTEGER);
`);

export const now = () => Date.now();
export const newId = (p = '') => p + randomUUID().replace(/-/g, '').slice(0, 16);

const q = {
  get: db.prepare('SELECT data, created_at, updated_at FROM docs WHERE col = ? AND id = ?'),
  list: db.prepare('SELECT id, data, created_at, updated_at FROM docs WHERE col = ? ORDER BY id'),
  put: db.prepare('INSERT INTO docs (col, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
  del: db.prepare('DELETE FROM docs WHERE col = ? AND id = ?'),
  hist: db.prepare('INSERT INTO history (col, id, action, before, after, at) VALUES (?, ?, ?, ?, ?, ?)'),
  histOf: db.prepare('SELECT action, before, after, at FROM history WHERE col = ? AND id = ? ORDER BY seq'),
};

const wrap = (id, row) => row ? { ...JSON.parse(row.data), id, createdAt: row.created_at, updatedAt: row.updated_at } : null;
export function getDoc(col, id) { return wrap(id, q.get.get(col, id)); }
export function listDocs(col) { return q.list.all(col).map(r => wrap(r.id, r)); }
export function putDoc(col, id, data, action = 'save') {
  const t = now();
  const before = q.get.get(col, id);
  const clean = { ...data }; delete clean.id; delete clean.createdAt; delete clean.updatedAt;
  const json = JSON.stringify(clean);
  q.put.run(col, id, json, before ? before.created_at : t, t);
  q.hist.run(col, id, before ? action : 'create', before ? before.data : null, json, t);
  return getDoc(col, id);
}
export function deleteDoc(col, id) {
  const before = q.get.get(col, id); if (!before) return false;
  q.del.run(col, id); q.hist.run(col, id, 'delete', before.data, null, now());
  return true;
}
export function docHistory(col, id) { return q.histOf.all(col, id).map(h => ({ action: h.action, before: h.before && JSON.parse(h.before), after: h.after && JSON.parse(h.after), at: h.at })); }
export function tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }

export function kvGet(k) { const r = db.prepare('SELECT v FROM kv WHERE k = ?').get(k); return r ? JSON.parse(r.v) : null; }
export function kvSet(k, v) { db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v)); }

/** פעולה חד-פעמית: אותו opId (ניסיון חוזר אחרי בעיית קליטה) לא נרשם פעמיים */
export function once(opId, fn) {
  if (!opId) return fn();
  const hit = db.prepare('SELECT result FROM ops WHERE op = ?').get(String(opId));
  if (hit) return JSON.parse(hit.result);
  const r = fn();
  db.prepare('INSERT OR IGNORE INTO ops (op, result, at) VALUES (?, ?, ?)').run(String(opId), JSON.stringify(r ?? null), now());
  return r;
}

export function chatAppend(role, content) { db.prepare('INSERT INTO chat (role, content, at) VALUES (?, ?, ?)').run(role, JSON.stringify(content), now()); }
export function chatList(limit = 200) { return db.prepare('SELECT seq, role, content, at FROM (SELECT * FROM chat ORDER BY seq DESC LIMIT ?) ORDER BY seq').all(limit).map(r => ({ seq: r.seq, role: r.role, content: JSON.parse(r.content), at: r.at })); }
export function chatClear() { db.exec('DELETE FROM chat'); }
