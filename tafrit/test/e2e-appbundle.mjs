// בדיקת חבילת האפליקציה המותקנת (app-www) במצב "אפליקציה": מקור נפרד מהשרת, כניסה עם אסימון Bearer, CORS,
// ניקוי האסימון בהתנתקות והחלפת חשבון. מדמה את ה-WebView של iOS (iPhone 13) ושל Android (Pixel 7).
import { createRequire } from 'node:module'; import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import assert from 'node:assert/strict'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const { chromium, devices } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 8897, APP = 8898, BASE = `http://localhost:${API}`, APPURL = `http://localhost:${APP}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-app-'));
const www = path.join(tmp, 'www');
execFileSync(process.execPath, ['scripts/build-app.mjs'], { cwd: ROOT, env: { ...process.env, APP_API_BASE: BASE, APP_ALLOW_HTTP: '1' } });
fs.cpSync(path.join(ROOT, 'app-www'), www, { recursive: true });
execFileSync(process.execPath, ['scripts/build-app.mjs'], { cwd: ROOT }); // מחזיר את הבנייה הרגילה (שרת הייצור)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/json' };
const st = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(www, p); if (!f.startsWith(www) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
await new Promise(r => st.listen(APP, r));
const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: path.join(tmp, 'data'), PORT: String(API), MAIL_DEV: '1', NODE_ENV: 'test', EXTRA_ORIGINS: APPURL, ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const api = async (m, u, b, t) => { const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
async function user(email, kg) {
  await api('POST', '/api/auth/register', { email, password: 'Secret123', acceptPrivacy: true });
  const code = (await (await fetch(BASE + '/api/dev/outbox')).json()).filter(m => m.to === email).at(-1).code;
  const v = await api('POST', '/api/auth/verify', { email, code, kind: 'bearer' });
  await api('PUT', '/api/profile', { profile: { sex: 'male', age: 40, heightCm: 178, goal: 'maintain', meals: 3, onboarding: { done: true } } }, v.token);
  await api('PUT', '/api/weights/' + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()), { kg }, v.token);
  await api('POST', '/api/plans', { kind: 'initial', goal: 'maintain', settings: { meals: 3 }, startDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()), weightKg: kg }, v.token);
}
await user('a@app.test', 81.3); await user('b@app.test', 64.9);
const browser = await chromium.launch(); const results = []; const errors = [];
try {
  for (const dev of ['iPhone 13', 'Pixel 7']) {
    const ctx = await browser.newContext({ ...devices[dev], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(dev + ': ' + e.message));
    await p.goto(APPURL + '/#/login'); await p.fill('#em', 'a@app.test'); await p.fill('#pw', 'Secret123'); await p.click('#f button');
    await p.getByText('היום שלי').first().waitFor();
    const tok = await p.evaluate(() => localStorage.getItem('tafrit-token')); assert.ok(tok && tok.length > 20, 'אסימון נשמר במכשיר');
    assert.equal((await ctx.cookies(BASE)).length, 0, 'באפליקציה אין עוגיות');
    await p.click('.tabbar [data-r="weight"]'); await p.getByText('81').first().waitFor();
    assert.ok(!/64[.,]9/.test(await p.locator('#app').innerText()));
    await p.click('.tabbar [data-r="more"]'); await p.locator('[data-sec="logout"]').click(); await p.getByText('לפני שנרשמים').waitFor();
    assert.equal(await p.evaluate(() => localStorage.getItem('tafrit-token')), null, 'האסימון נמחק');
    assert.equal((await api('GET', '/api/state', null, tok)).status, 401, 'האסימון בוטל בשרת');
    await p.goto(APPURL + '/#/login'); await p.fill('#em', 'b@app.test'); await p.fill('#pw', 'Secret123'); await p.click('#f button');
    await p.getByText('היום שלי').first().waitFor(); await p.click('.tabbar [data-r="weight"]'); await p.getByText('64').first().waitFor();
    assert.ok(!/81[.,]3/.test(await p.locator('#app').innerText()));
    await p.screenshot({ path: path.join(os.tmpdir(), `tafrit-app-${dev.replace(' ', '')}.png`) });
    results.push(dev); console.log(`✓ [${dev}] חבילת האפליקציה: כניסה עם אסימון, נתונים אישיים מהשרת, התנתקות מוחקת ומבטלת את האסימון, החלפת חשבון`);
    await ctx.close();
  }
  // מקור לא מורשה נחסם
  const bad = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null);
  console.log('✓ בקשה ממקור לא מורשה נחסמת (CORS/CSRF)');
  assert.deepEqual(errors, []);
  console.log('הכל עבר');
} catch (e) { console.error('✗', e); process.exitCode = 1; } finally { await browser.close(); srv.kill(); st.close(); }
