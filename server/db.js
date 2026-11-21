// מסד הנתונים: SQLite מובנה ב-Node (node:sqlite). קובץ אחד, גיבוי פשוט, בלי שרת נפרד.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });

export const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'yoman.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','collector')),
  collector_name TEXT, pass_hash TEXT NOT NULL, disabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ua TEXT);
-- כל המסמכים של התוכנה המקורית נשמרים במבנה המקורי שלהם, כדי שהחישובים יישארו זהים
CREATE TABLE IF NOT EXISTS docs(
  col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  source_hash TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(col,id));
CREATE INDEX IF NOT EXISTS docs_col ON docs(col, deleted);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, name TEXT, mime TEXT, size INTEGER,
  owner_col TEXT, owner_id TEXT, field TEXT, source TEXT, source_id TEXT UNIQUE,
  path TEXT NOT NULL, created_at INTEGER NOT NULL);
-- מזהי פעולה: ניסיון חוזר עם אותו מזהה לא מבצע את הפעולה פעמיים
CREATE TABLE IF NOT EXISTS ops(op_id TEXT PRIMARY KEY, user_id TEXT, at INTEGER NOT NULL, result TEXT);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user_id TEXT, user_name TEXT,
  action TEXT NOT NULL, col TEXT, doc_id TEXT, item TEXT, before TEXT, after TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS audit_doc ON audit(col, doc_id);
CREATE TABLE IF NOT EXISTS import_runs(
  id TEXT PRIMARY KEY, at INTEGER NOT NULL, file_sha256 TEXT, by TEXT, report TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS wa_consent(
  phone TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('opt_in','opt_out')),
  source TEXT, note TEXT, at INTEGER NOT NULL, by TEXT);
CREATE TABLE IF NOT EXISTS wa_templates(
  name TEXT NOT NULL, language TEXT NOT NULL, status TEXT, category TEXT, body TEXT,
  components TEXT, synced_at INTEGER, PRIMARY KEY(name, language));
CREATE TABLE IF NOT EXISTS wa_batches(
  id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, created_by TEXT, template_name TEXT,
  language TEXT, source_col TEXT, source_id TEXT, source_title TEXT, total INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS wa_messages(
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES wa_batches(id), phone TEXT NOT NULL,
  client_name TEXT, params TEXT, preview TEXT, status TEXT NOT NULL, wamid TEXT UNIQUE,
  error_code TEXT, error_text TEXT, attempts INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, UNIQUE(batch_id, phone));
CREATE INDEX IF NOT EXISTS wa_msg_status ON wa_messages(status);
CREATE TABLE IF NOT EXISTS wa_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, wamid TEXT, kind TEXT, status TEXT, raw TEXT);
`);

export const now = () => Date.now();
export const newId = (p = '') => p + crypto.randomBytes(9).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; }
}

// ---- מסמכים ----
const qGet = db.prepare('SELECT * FROM docs WHERE col=? AND id=?');
const qList = db.prepare('SELECT * FROM docs WHERE col=? AND deleted=0');
export function getDoc(col, id) {
  const r = qGet.get(col, id);
  return r ? { ...r, data: JSON.parse(r.data) } : null;
}
export function listDocs(col) {
  return qList.all(col).map(r => ({ ...r, data: JSON.parse(r.data) }));
}
export function putDoc(col, id, data, { user, baseVersion, action = 'עדכון', note, item } = {}) {
  const cur = qGet.get(col, id);
  if (cur && baseVersion != null && cur.version !== baseVersion) {
    const e = new Error('המסמך עודכן ממכשיר אחר. רענן ונסה שוב.'); e.status = 409; e.current = cur.version; throw e;
  }
  const t = now(); const json = JSON.stringify(data);
  if (cur) {
    db.prepare('UPDATE docs SET data=?, version=version+1, updated_at=?, updated_by=?, deleted=0 WHERE col=? AND id=?')
      .run(json, t, user?.name || null, col, id);
  } else {
    db.prepare('INSERT INTO docs(col,id,data,version,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)')
      .run(col, id, json, 1, t, t, user?.name || null);
  }
  logAudit({ user, action: cur ? action : 'יצירה', col, doc_id: id, item, before: cur ? cur.data : null, after: json, note });
  return getDoc(col, id);
}
export function deleteDoc(col, id, { user, note } = {}) {
  const cur = qGet.get(col, id); if (!cur) return;
  db.prepare('UPDATE docs SET deleted=1, version=version+1, updated_at=?, updated_by=? WHERE col=? AND id=?').run(now(), user?.name || null, col, id);
  logAudit({ user, action: 'מחיקה (ניתן לשחזור)', col, doc_id: id, before: cur.data, note });
}

export function logAudit({ user, action, col, doc_id, item, before, after, note }) {
  db.prepare('INSERT INTO audit(at,user_id,user_name,action,col,doc_id,item,before,after,note) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(now(), user?.id || null, user?.name || 'מערכת', action, col || null, doc_id || null, item || null,
      before == null ? null : (typeof before === 'string' ? before : JSON.stringify(before)),
      after == null ? null : (typeof after === 'string' ? after : JSON.stringify(after)), note || null);
}

// ---- פעולות חד-פעמיות (idempotency) ----
export function once(opId, user, fn) {
  if (!opId) return fn();
  const prev = db.prepare('SELECT result FROM ops WHERE op_id=?').get(opId);
  if (prev) return { ...JSON.parse(prev.result || '{}'), replay: true };
  const r = fn();
  db.prepare('INSERT OR IGNORE INTO ops(op_id,user_id,at,result) VALUES(?,?,?,?)').run(opId, user?.id || null, now(), JSON.stringify(r ?? {}));
  return r;
}

export const kvGet = (k, d = null) => { const r = db.prepare('SELECT value FROM kv WHERE key=?').get(k); return r ? JSON.parse(r.value) : d; };
export const kvSet = (k, v) => db.prepare('INSERT INTO kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(k, JSON.stringify(v), now());
