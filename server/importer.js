// ייבוא גיבוי מלא: מהתוכנה המקורית (״גיבוי מלא״) או מקובץ הגיבוי שנוצר בהעברה.
// ייבוא חוזר של אותו גיבוי לא יוצר כפילויות: כל מסמך מזוהה לפי המזהה המקורי שלו וטביעת תוכן.
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, now, newId, sha256, tx, logAudit } from './db.js';
import { reconcile } from './reconcile.js';

export const COLS = ['accounts', 'clients', 'loans', 'loan_requests', 'contracts', 'contract_files', 'settings'];

// מפתח יציב לכל שורה בחשבון, כדי שאפשר יהיה לסמן איסוף ולתעד שינוי בשורה מסוימת
export function keyRows(id, d) {
  for (const f of ['rows', 'entries', 'records', 'expenses', 'loans']) {
    if (Array.isArray(d[f])) d[f].forEach((r, i) => { if (r && typeof r === 'object' && !r._k) r._k = `${f[0]}${i}`; });
  }
  return d;
}
const canon = (o) => Array.isArray(o) ? '[' + o.map(canon).join(',') + ']'
  : (o && typeof o === 'object') ? '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'
  : JSON.stringify(o === undefined ? null : o);

export function parseBackup(text) {
  const o = typeof text === 'string' ? JSON.parse(text) : text;
  const out = { collections: {}, files: [], source: '' };
  if (o && o.format === 'yoman-boker-full-backup') {
    for (const c of COLS) out.collections[c] = (o.collections[c] || []).map(x => ({ id: x.id, d: x.data }));
    out.files = o.files || []; out.source = 'קובץ גיבוי ההעברה';
  } else if (o && o.app === 'יומן חשבון בוקר' && o.data) {
    for (const c of COLS) out.collections[c] = (o.data[c] || []).map(x => ({ id: x.id, d: x.d }));
    out.source = 'גיבוי מלא מהתוכנה המקורית';
  } else if (o && o.format === 'yoman-app-backup') {
    for (const c of COLS) out.collections[c] = (o.collections[c] || []).map(x => ({ id: x.id, d: x.data }));
    out.files = o.files || []; out.source = 'גיבוי של האפליקציה החדשה';
  } else {
    throw Object.assign(new Error('הקובץ הזה אינו קובץ גיבוי מלא של יומן חשבון בוקר'), { status: 400 });
  }
  return out;
}

export function importBackup(text, { user, dryRun = false } = {}) {
  const raw = typeof text === 'string' ? text : JSON.stringify(text);
  const fileSha = sha256(raw);
  const b = parseBackup(raw);
  const report = { at: new Date().toISOString(), source: b.source, fileSha256: fileSha, dryRun, cols: {}, files: { added: 0, same: 0, bad: [] }, conflicts: [] };
  const work = () => {
    for (const col of COLS) {
      const r = { inBackup: 0, added: 0, same: 0, updated: 0, conflict: 0 };
      for (const { id, d } of b.collections[col] || []) {
        if (!id || !d || typeof d !== 'object') continue;
        r.inBackup++;
        const src = sha256(canon(d));
        const cur = db.prepare('SELECT source_hash, version, updated_by FROM docs WHERE col=? AND id=?').get(col, id);
        if (!cur) {
          if (!dryRun) {
            const data = col === 'accounts' ? keyRows(id, structuredClone(d)) : d;
            db.prepare('INSERT INTO docs(col,id,data,version,source_hash,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)')
              .run(col, id, JSON.stringify(data), 1, src, now(), now(), 'ייבוא');
          }
          r.added++;
        } else if (cur.source_hash === src) {
          r.same++;
        } else if (cur.updated_by === 'ייבוא' && cur.version === 1) {
          // לא נגעו במסמך מאז הייבוא הקודם — מותר לעדכן לגרסה החדשה מהתוכנה המקורית
          if (!dryRun) {
            const data = col === 'accounts' ? keyRows(id, structuredClone(d)) : d;
            db.prepare('UPDATE docs SET data=?, source_hash=?, updated_at=? WHERE col=? AND id=?').run(JSON.stringify(data), src, now(), col, id);
          }
          r.updated++;
        } else {
          // המסמך עודכן באפליקציה החדשה — לא דורסים. מדווחים לבדיקה
          r.conflict++; report.conflicts.push({ col, id });
        }
      }
      report.cols[col] = r;
    }
    for (const f of b.files) {
      try {
        const buf = Buffer.from(f.base64, 'base64');
        const h = sha256(buf);
        if (h !== f.sha256) { report.files.bad.push({ name: f.name, why: 'טביעת התוכן לא תואמת — הקובץ פגום' }); continue; }
        const ex = db.prepare('SELECT id FROM files WHERE source_id=? OR (sha256=? AND owner_id=? AND field=?)').get(f.sourceId, h, f.owner, f.field);
        if (ex) { report.files.same++; continue; }
        if (!dryRun) {
          const id = newId('f_'); const ext = (f.mime || '').split('/')[1] || 'bin';
          const rel = path.join('files', id + '.' + ext.replace('jpeg', 'jpg'));
          fs.writeFileSync(path.join(DATA_DIR, rel), buf);
          const [oc, oid] = String(f.owner || '').split('/');
          db.prepare('INSERT INTO files(id,sha256,name,mime,size,owner_col,owner_id,field,source,source_id,path,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(id, h, f.name, f.mime, buf.length, oc || null, oid || null, f.field, f.source, f.sourceId, rel, now());
        }
        report.files.added++;
      } catch (e) { report.files.bad.push({ name: f.name, why: String(e.message || e) }); }
    }
  };
  if (dryRun) work(); else tx(work);
  report.reconcile = reconcile(b);
  if (!dryRun) {
    db.prepare('INSERT INTO import_runs(id,at,file_sha256,by,report) VALUES(?,?,?,?,?)').run(newId('imp_'), now(), fileSha, user?.name || 'מערכת', JSON.stringify(report));
    logAudit({ user, action: 'ייבוא גיבוי', note: `${b.source}: ` + Object.entries(report.cols).map(([k, v]) => `${k} +${v.added}/=${v.same}`).join(', ') });
  }
  return report;
}
