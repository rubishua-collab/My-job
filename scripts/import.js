// ייבוא קובץ גיבוי מלא מהשורה: npm run import -- path/to/backup.json [--dry]
import fs from 'node:fs';
import { importBackup } from '../server/importer.js';
const f = process.argv[2]; if (!f) { console.error('usage: npm run import -- backup.json [--dry]'); process.exit(1); }
const rep = importBackup(fs.readFileSync(f, 'utf8'), { dryRun: process.argv.includes('--dry') });
console.log(JSON.stringify({ cols: rep.cols, files: rep.files, conflicts: rep.conflicts, diffs: rep.reconcile.diffs, filesMissing: rep.reconcile.after.files.missing, ok: rep.reconcile.ok }, null, 1));
