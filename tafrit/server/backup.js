// גיבויים מוצפנים של מסד הנתונים, ושיוך הנתונים הקיימים (מהגרסה של משתמש יחיד) לחשבון המנהל
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, DB_FILE, kvGet, kvSet, tx, now, audit } from './db.js';
import { encrypt, decrypt as decryptText, encryptBuffer, decryptBuffer } from './crypto.js';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = 21;

/** גיבוי מלא מוצפן (AES-256-GCM). מחזיר את נתיב הקובץ */
export function createBackup(reason = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tmp = path.join(DATA_DIR, `.tmp-${ts}.sqlite`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const out = path.join(BACKUP_DIR, `tafrit-${ts}-${reason}.sqlite.enc`);
  fs.writeFileSync(out, encryptBuffer(fs.readFileSync(tmp)), { mode: 0o600 });
  fs.rmSync(tmp, { force: true });
  // שמירה על מספר גיבויים סביר
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.enc')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) if (!f.includes('before-migration')) fs.rmSync(path.join(BACKUP_DIR, f));
  return out;
}
/** פענוח גיבוי לקובץ SQLite (לשחזור ידני) */
export function restoreBackupTo(file, outFile) { fs.writeFileSync(outFile, decryptBuffer(fs.readFileSync(file))); return outFile; }

export function legacyPending() {
  const t = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='docs_legacy'`).get();
  if (!t) return null;
  return Object.fromEntries(db.prepare('SELECT col, COUNT(*) n FROM docs_legacy GROUP BY col').all().map(r => [r.col, r.n]));
}

/**
 * שיוך הנתונים הקיימים לחשבון אחד (חשבון המנהל), פעם אחת בלבד:
 * 1. גיבוי מוצפן של כל ה-DB לפני השינוי
 * 2. העתקה בתוך טרנזקציה, עם הצפנה
 * 3. בדיקה שכל הרשומות עברו (ספירה + השוואת תוכן לכל רשומה)
 * 4. רק אחרי שהבדיקה עברה — מחיקת הטבלאות הישנות (שהיו לא מוצפנות)
 */
export function migrateLegacyTo(uid) {
  const pending = legacyPending();
  if (!pending || kvGet('legacy_migration')) return kvGet('legacy_migration');
  const backup = createBackup('before-migration');
  const legacy = db.prepare('SELECT col, id, data, created_at, updated_at FROM docs_legacy').all();
  const hasChat = !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='chat_legacy'`).get();
  const hasHist = !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='history_legacy'`).get();
  const chats = hasChat ? db.prepare('SELECT role, content, at FROM chat_legacy ORDER BY seq').all() : [];
  const hist = hasHist ? db.prepare('SELECT col, id, action, before, after, at FROM history_legacy ORDER BY seq').all() : [];
  const ins = db.prepare('INSERT INTO docs (user_id, col, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  const report = tx(() => {
    for (const d of legacy) ins.run(uid, d.col, d.id, encrypt(d.data), d.created_at, d.updated_at);
    for (const c of chats) db.prepare('INSERT INTO chat (user_id, role, content, at) VALUES (?, ?, ?, ?)').run(uid, c.role, encrypt(c.content), c.at);
    for (const h of hist) db.prepare('INSERT INTO history (user_id, col, id, action, before, after, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid, h.col, h.id, h.action, h.before == null ? null : encrypt(h.before), h.after == null ? null : encrypt(h.after), h.at);
    // אימות: כל רשומה קיימת אצל המשתמש עם תוכן זהה
    const get = db.prepare('SELECT data FROM docs WHERE user_id = ? AND col = ? AND id = ?');
    let mismatch = 0;
    for (const d of legacy) { const r = get.get(uid, d.col, d.id); if (!r || JSON.stringify(JSON.parse(decryptText(r.data))) !== JSON.stringify(JSON.parse(d.data))) mismatch++; }
    const after = Object.fromEntries(db.prepare('SELECT col, COUNT(*) n FROM docs WHERE user_id = ? GROUP BY col').all(uid).map(r => [r.col, r.n]));
    const ok = mismatch === 0 && Object.entries(pending).every(([c, n]) => (after[c] || 0) >= n);
    if (!ok) throw new Error(`אימות המעבר נכשל (${mismatch} רשומות שונות) — לא בוצע שינוי`);
    db.exec('DROP TABLE docs_legacy'); if (hasChat) db.exec('DROP TABLE chat_legacy'); if (hasHist) db.exec('DROP TABLE history_legacy');
    return { at: now(), userId: uid, before: pending, after, chat: chats.length, history: hist.length, verified: true, backup: path.basename(backup) };
  });
  kvSet('legacy_migration', report);
  audit(uid, 'legacy_data_assigned', uid, null, { counts: report.before, backup: report.backup });
  return report;
}

/** גיבוי יומי אוטומטי */
export function scheduleBackups() {
  const run = () => { try { createBackup('daily'); } catch (e) { console.error('[backup] נכשל:', e.message); } };
  setTimeout(run, 60_000).unref();
  setInterval(run, 24 * 3600_000).unref();
}
