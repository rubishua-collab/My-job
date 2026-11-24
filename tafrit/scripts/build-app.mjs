// בונה את קבצי האפליקציה המותקנת (app-www): הממשק + קוד החישוב המשותף + מאגר המזון, עם כתובת השרת.
// שימוש: APP_API_BASE=https://tafrit-robi.onrender.com node scripts/build-app.mjs && npx cap sync
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'app-www');
const API = (process.env.APP_API_BASE || 'https://tafrit-robi.onrender.com').replace(/\/$/, '');
if (!/^https:\/\//.test(API) && !process.env.APP_ALLOW_HTTP) throw new Error('APP_API_BASE חייב להיות https');
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true, filter: f => !/\/(sw\.js|privacy\.html|delete-account\.html|accessibility\.html)$/.test(f) });
fs.cpSync(path.join(ROOT, 'shared'), path.join(OUT, 'shared'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'data', 'foods.json'), path.join(OUT, 'data', 'foods.json'));
if (fs.existsSync(path.join(ROOT, 'data', 'foods-world.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'foods-world.json'), path.join(OUT, 'data', 'foods-world.json'));
fs.writeFileSync(path.join(OUT, 'js', 'config.js'), `// נוצר אוטומטית ב-build-app\nexport const API_BASE = ${JSON.stringify(API)};\nexport const APP_BUILD = true;\n`);
// באפליקציה: CSP שמאפשר חיבור רק לשרת שלנו
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${API}; object-src 'none'; base-uri 'none'">`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('app-www מוכן →', API);
