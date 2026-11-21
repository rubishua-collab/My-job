// גיבוי מלא ושחזור, כמו בתוכנה המקורית (app.html 5372-5568):
// גיבוי אוטומטי פעם ביום בשרת (DATA_DIR/backups, נשמרים 60 האחרונים), ״גיבוי מלא עכשיו״, רשימה עם הורדה,
// ושחזור מגיבוי שמור או מקובץ — עם בחירה לפי סוג (חשבונות, הלוואות, בקשות, לקוחות, חוזים, הגדרות).
// שחזור לא מוחק כלום: כל מסמך שבגיבוי חוזר לגרסה שבגיבוי, מה שנוסף אחרי הגיבוי נשאר. לפני השחזור נשמר גיבוי של המצב הנוכחי.
// בעל התוכנה בלבד. /api/backup ו-/api/backup/import של הליבה נשארים כמו שהם.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseBackup, keyRows } from '../importer.js';
import { sha256 } from '../db.js';

export const BK_COLS = [['accounts', 'חשבונות שמורים'], ['loans', 'הלוואות'], ['loan_requests', 'בקשות להלוואה'], ['clients', 'מאגר לקוחות'], ['contracts', 'חוזים (כולל קבצי חתימה ות.ז.)'], ['settings', 'הגדרות וטיוטות']];
const KEEP = 60;
const AUTO_EVERY = 20 * 3600e3; // כמו במקור: גיבוי אוטומטי אם האחרון ישן מ-20 שעות

const canon = (o) => Array.isArray(o) ? '[' + o.map(canon).join(',') + ']'
  : (o && typeof o === 'object') ? '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
  : JSON.stringify(o === undefined ? null : o);
// להשוואה: בלי המפתח הפנימי _k של השורות (לא משתתף בשום חישוב)
const stripK = (d) => {
  const c = structuredClone(d);
  for (const f of ['rows', 'entries', 'records', 'expenses', 'loans']) if (Array.isArray(c[f])) c[f].forEach(r => { if (r && typeof r === 'object') delete r._k; });
  return c;
};
export const sameDoc = (a, b) => canon(stripK(a)) === canon(stripK(b));

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, putDoc, once, newId, now, logAudit, DATA_DIR } = ctx;
  const DIR = path.join(DATA_DIR, 'backups'); fs.mkdirSync(DIR, { recursive: true });
  const owner = (u) => need(can.restore(u), 'רק בעל התוכנה יכול לגבות ולשחזר');

  function list() {
    const out = [];
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith('.meta.json')) continue;
      try { const m = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); if (fs.existsSync(path.join(DIR, m.id + '.json.gz'))) out.push(m); } catch { /* קובץ פגום — מדלגים */ }
    }
    return out.sort((a, b) => b.ts - a.ts);
  }
  function collect() {
    const collections = {};
    for (const [c] of BK_COLS) collections[c] = [];
    for (const x of db.prepare('SELECT col,id,data,version FROM docs WHERE deleted=0').all()) (collections[x.col] ||= []).push({ id: x.id, data: JSON.parse(x.data), version: x.version });
    const files = [];
    for (const f of db.prepare('SELECT * FROM files').all()) {
      let b64 = ''; try { b64 = fs.readFileSync(path.join(DATA_DIR, f.path)).toString('base64'); } catch { continue; }
      files.push({ sourceId: f.source_id || f.id, source: f.source, owner: (f.owner_col || '') + '/' + (f.owner_id || ''), field: f.field, name: f.name, mime: f.mime, size: f.size, sha256: f.sha256, base64: b64 });
    }
    const extra = { wa_consent: db.prepare('SELECT * FROM wa_consent').all(), kv: db.prepare('SELECT * FROM kv').all() };
    return { collections, files, extra };
  }
  const counts = (cols, files) => ({ ...Object.fromEntries(BK_COLS.map(([c]) => [c, (cols[c] || []).length])), files: (files || []).length });
  function snapshot(reason, user, auto = false) {
    const { collections, files, extra } = collect();
    const at = new Date().toISOString(), ts = now();
    const id = 'B' + ts.toString(36) + newId().slice(0, 4).replace(/[^\w]/g, 'x');
    const json = JSON.stringify({ format: 'yoman-app-backup', formatVersion: 1, createdAt: at, reason, collections, files, extra });
    const gz = zlib.gzipSync(json);
    fs.writeFileSync(path.join(DIR, id + '.json.gz.tmp'), gz); fs.renameSync(path.join(DIR, id + '.json.gz.tmp'), path.join(DIR, id + '.json.gz'));
    const meta = { id, at, ts, reason, auto: !!auto, by: user?.name || 'מערכת', size: json.length, gz: gz.length, sha256: sha256(json), counts: counts(collections, files) };
    fs.writeFileSync(path.join(DIR, id + '.meta.json'), JSON.stringify(meta)); // הגיבוי מופיע ברשימה רק אחרי שהקובץ נשמר
    const L = list(); for (const old of L.slice(KEEP)) { try { fs.unlinkSync(path.join(DIR, old.id + '.json.gz')); fs.unlinkSync(path.join(DIR, old.id + '.meta.json')); } catch { /* */ } }
    logAudit({ user, action: 'גיבוי מלא', note: reason + ' · ' + Object.entries(meta.counts).map(([k, v]) => k + ' ' + v).join(', ') });
    return meta;
  }
  const loadJson = (id) => {
    if (!/^[\w-]+$/.test(String(id || ''))) throw err(400, 'מזהה גיבוי לא תקין');
    const p = path.join(DIR, id + '.json.gz'); if (!fs.existsSync(p)) throw err(404, 'הגיבוי לא נמצא');
    return zlib.gunzipSync(fs.readFileSync(p)).toString('utf8');
  };
  const source = (body) => {
    if (body.uploadId) { const id = String(body.uploadId); if (!/^U[\w-]+$/.test(id)) throw err(400, 'קובץ לא תקין'); const p = path.join(DIR, 'tmp-' + id + '.json.gz'); if (!fs.existsSync(p)) throw err(404, 'הקובץ שהועלה כבר לא זמין. העלה אותו שוב'); return parseBackup(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')); }
    return parseBackup(loadJson(body.id));
  };
  function preview(b) {
    return BK_COLS.map(([k, l]) => {
      let add = 0, chg = 0, same = 0; const arr = (b.collections[k] || []).filter(x => x && x.id && x.d && typeof x.d === 'object');
      for (const x of arr) { const c = getDoc(k, x.id); if (!c || c.deleted) add++; else if (sameDoc(c.data, x.d)) same++; else chg++; }
      return { k, l, n: arr.length, add, chg, same };
    }).concat([{ k: 'files', l: 'קבצים מצורפים (נוספים רק חסרים)', n: (b.files || []).length, add: (b.files || []).filter(f => !db.prepare('SELECT 1 FROM files WHERE sha256=?').get(f.sha256)).length, chg: 0, same: 0, info: true }]);
  }

  // ---- גיבוי אוטומטי פעם ביום ----
  const auto = () => { try { const last = list()[0]; if (!last || now() - last.ts > AUTO_EVERY) snapshot('אוטומטי', null, true); } catch (e) { console.error('גיבוי אוטומטי נכשל', e.message); } };
  if (process.env.BACKUP_AUTO !== '0') { setTimeout(auto, +process.env.BACKUP_AUTO_DELAY_MS || 8000).unref(); setInterval(auto, 3600e3).unref(); }

  r.get('/api/backups', (req, res, { user }) => { owner(user); return { list: list(), cols: BK_COLS, keep: KEEP }; });
  r.post('/api/backups', (req, res, { user, body }) => { owner(user); return once(body.opId, user, () => snapshot('ידני', user)); });
  r.get('/api/backups/:id/download', (req, res, { user, params }) => {
    owner(user); const json = loadJson(params.id); const m = list().find(x => x.id === params.id);
    logAudit({ user, action: 'הורדת גיבוי מלא', item: params.id });
    ctx.send(res, 200, json, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="yoman-full-backup-${(m?.at || new Date().toISOString()).slice(0, 10)}-${params.id}.json"` });
  });
  r.del('/api/backups/:id', (req, res, { user, params }) => {
    owner(user); loadJson(params.id);
    fs.unlinkSync(path.join(DIR, params.id + '.json.gz')); try { fs.unlinkSync(path.join(DIR, params.id + '.meta.json')); } catch { /* */ }
    logAudit({ user, action: 'מחיקת גיבוי', item: params.id }); return { ok: true };
  });
  // העלאת קובץ גיבוי לשחזור: נשמר זמנית בשרת, מוחזרת תצוגה מקדימה
  r.post('/api/backups/upload', (req, res, { user, raw }) => {
    owner(user);
    const text = raw.toString('utf8'); const b = parseBackup(text);
    for (const f of fs.readdirSync(DIR)) if (f.startsWith('tmp-')) { try { if (now() - fs.statSync(path.join(DIR, f)).mtimeMs > 6 * 3600e3) fs.unlinkSync(path.join(DIR, f)); } catch { /* */ } }
    const uploadId = 'U' + now().toString(36) + newId().slice(0, 4).replace(/[^\w]/g, 'x');
    fs.writeFileSync(path.join(DIR, 'tmp-' + uploadId + '.json.gz'), zlib.gzipSync(text));
    let at = ''; try { const o = JSON.parse(text); at = o.createdAt || o.at || ''; } catch { /* */ }
    return { uploadId, source: b.source, at, preview: preview(b) };
  });
  r.post('/api/backups/preview', (req, res, { user, body }) => { owner(user); const b = source(body); return { source: b.source, preview: preview(b) }; });
  r.post('/api/backups/restore', (req, res, { user, body }) => {
    owner(user);
    return once(body.opId, user, () => {
      const b = source(body);
      const keys = (Array.isArray(body.cols) ? body.cols : []).filter(k => BK_COLS.some(([c]) => c === k));
      if (!keys.length) throw err(400, 'בחר מה לשחזר');
      const pre = snapshot('לפני שחזור', user); // כמו bkRestore: קודם גיבוי של המצב הנוכחי
      let done = 0, same = 0, fail = 0, files = 0; const failed = [];
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const k of keys) for (const x of b.collections[k] || []) {
          if (!x || !x.id || !x.d || typeof x.d !== 'object') continue;
          const c = getDoc(k, x.id);
          if (c && !c.deleted && sameDoc(c.data, x.d)) { same++; continue; }
          try {
            const data = k === 'accounts' ? keyRows(x.id, structuredClone(x.d)) : structuredClone(x.d);
            putDoc(k, String(x.id), data, { user, action: 'שחזור מגיבוי', note: (body.id || 'קובץ') + ' · ' + b.source });
            done++;
          } catch (e) { fail++; failed.push(k + '/' + x.id + ': ' + e.message); }
        }
        if (keys.includes('contracts')) for (const f of b.files || []) {
          try {
            const buf = Buffer.from(f.base64 || '', 'base64'); const h = sha256(buf);
            if (h !== f.sha256 || db.prepare('SELECT 1 FROM files WHERE sha256=? OR source_id=?').get(h, f.sourceId || '')) continue;
            const id = newId('f_'); const ext = ((f.mime || '').split('/')[1] || 'bin').replace('jpeg', 'jpg');
            const rel = path.join('files', id + '.' + ext); fs.writeFileSync(path.join(DATA_DIR, rel), buf);
            const [oc, oid] = String(f.owner || '').split('/');
            db.prepare('INSERT INTO files(id,sha256,name,mime,size,owner_col,owner_id,field,source,source_id,path,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
              .run(id, h, f.name, f.mime, buf.length, oc || null, oid || null, f.field, f.source || 'שחזור', f.sourceId || id, rel, now());
            files++;
          } catch { /* קובץ אחד פגום לא עוצר את השחזור */ }
        }
        db.exec('COMMIT');
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; }
      logAudit({ user, action: 'שחזור מגיבוי', note: `${keys.join(',')} · שוחזרו ${done}, ללא שינוי ${same}, קבצים ${files}` });
      return { done, same, fail, failed: failed.slice(0, 20), files, preBackup: pre.id };
    });
  });
}
