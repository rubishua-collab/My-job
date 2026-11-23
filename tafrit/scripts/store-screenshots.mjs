// צילומי מסך לחנויות עם נתוני דוגמה (לא נתונים אמיתיים): App Store ‏1290×2796 ו-Google Play ‏1080×2400.
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8899, BASE = `http://localhost:${PORT}`;
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-ss-')), PORT: String(PORT), MAIL_DEV: '1', NODE_ENV: 'test', ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const api = async (m, u, b, t) => (await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b && JSON.stringify(b) })).json();
const email = 'demo@example.com', pw = 'Demo2026!';
await api('POST', '/api/auth/register', { email, password: pw, acceptPrivacy: true });
const code = (await api('GET', '/api/dev/outbox')).at(-1).code; const { token: t } = await api('POST', '/api/auth/verify', { email, code, kind: 'bearer' });
await api('PUT', '/api/profile', { profile: { sex: 'male', age: 36, heightCm: 178, goal: 'lose', rate: 'moderate', job: 'mixed', steps: 7000, strength: { perWeek: 3, minutes: 60 }, cardio: { perWeek: 2, minutes: 30 }, meals: 4, kosher: true, likes: ['עוף', 'ביצים', 'קוטג׳'], allergies: [], prepMinutes: 15, hungerTimes: ['evening'], onboarding: { done: true } } }, t);
for (let i = 27; i >= 0; i--) if (i % 7 !== 3) await api('PUT', '/api/weights/' + addDays(T, -i), { kg: +(94.8 - (27 - i) * 0.09 + (i % 3) * 0.15).toFixed(1) }, t);
await api('POST', '/api/plans', { kind: 'initial', goal: 'lose', settings: { rate: 'moderate', job: 'mixed', steps: 7000, strength: { perWeek: 3, minutes: 60 }, cardio: { perWeek: 2, minutes: 30 }, meals: 4, likes: ['עוף', 'ביצים', 'קוטג׳'], prepMinutes: 15, hungerTimes: ['evening'] }, startDate: addDays(T, -27), weightKg: 94.8 }, t);
for (let i = 1; i <= 13; i++) { const d = addDays(T, -i); await api('POST', '/api/entries', { entries: [{ date: d, meal: 'breakfast', foodId: 'm1561', grams: 116, unit: 'יחידה גדולה', qty: 2, comp: 'egg', status: 'eaten' }, { date: d, meal: 'lunch', foodId: 'm805', grams: 180, comp: 'chicken', status: 'eaten' }, { date: d, meal: 'lunch', foodId: 'm2721', grams: 200, comp: 'rice', status: 'eaten' }, { date: d, meal: 'dinner', foodId: 'm494', grams: 250, comp: 'cottage', status: 'eaten' }, { date: d, meal: 'dinner', foodId: 'm1995', grams: 96, unit: 'פרוסה בינונית', qty: 3, comp: 'bread', status: 'eaten' }] }, t); await api('PUT', '/api/days/' + d, { complete: true }, t); }
await api('POST', '/api/entries', { entries: [{ date: T, meal: 'breakfast', foodId: 'm1561', grams: 116, unit: 'יחידה גדולה', qty: 2, comp: 'egg', status: 'eaten' }, { date: T, meal: 'breakfast', foodId: 'm1995', grams: 64, unit: 'פרוסה בינונית', qty: 2, comp: 'bread', status: 'eaten' }, { date: T, meal: 'breakfast', foodId: 'm9704', grams: 200, comp: 'salad', status: 'eaten' }, { date: T, meal: 'lunch', foodId: 'm805', grams: 180, comp: 'chicken', status: 'planned' }, { date: T, meal: 'lunch', foodId: 'm2721', grams: 180, comp: 'rice', status: 'planned' }, { date: T, meal: 'lunch', foodId: 'm9704', grams: 200, comp: 'salad', status: 'planned' }] }, t);
await api('POST', '/api/chat', { message: 'יש לי בבית ביצים, קוטג׳ ופיתה, מה אפשר להכין?' }, t);

const b = await chromium.launch();
const sets = [['ios', { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }],
  ['android', { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36' }]];
for (const [name, vp] of sets) {
  const out = path.join(ROOT, 'store', name, 'screenshots'); fs.mkdirSync(out, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, userAgent: vp.userAgent, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/#/login'); await p.fill('#em', email); await p.fill('#pw', pw); await p.click('#f button'); await p.getByText('היום שלי').first().waitFor();
  const snap = async n => { await p.waitForTimeout(500); await p.screenshot({ path: path.join(out, n + '.png') }); };
  await snap('1-today');
  await p.click('[data-meal="lunch"] [data-mact="suggest"]'); await p.locator('.sheet .sugg').first().waitFor(); await snap('2-suggestions'); await p.locator('.sheet [data-x]').click();
  await p.click('.tabbar [data-r="weight"]'); await p.getByText('ממוצעים שבועיים').waitFor(); await snap('3-weight');
  await p.click('.tabbar [data-r="week"]'); await p.getByText('סיכום שבועי').first().waitFor(); await snap('4-week');
  await p.goto(BASE + '/#/targets'); await p.getByText('כמה הגוף שלך מוציא במנוחה?').waitFor(); await snap('5-targets');
  await p.goto(BASE + '/#/plan-change'); await p.click('[data-opts="kind"] [data-v="goal_change"]'); await p.click('#next'); await p.click('[data-opts="goal"] [data-v="recomp"]'); await p.click('#next'); await p.click('#next'); await p.click('#next');
  await p.getByText('התוכנית הנוכחית מול התוכנית החדשה').waitFor(); await snap('6-plan-change');
  await p.goto(BASE + '/#/chat'); await p.locator('.sugg').first().waitFor(); await snap('7-companion');
  await ctx.close();
}
// גרפיקה מוצגת ל-Google Play: ‏1024×500
const p = await (await b.newContext({ viewport: { width: 1024, height: 500 } })).newPage();
await p.setContent(`<html dir="rtl"><body style="margin:0;width:1024px;height:500px;background:#1f7a52;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;gap:48px"><img src="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'store/icon-1024.png')).toString('base64')}" style="width:220px;border-radius:48px"><div><div style="font-size:64px;font-weight:700">תפריט יומי רובי</div><div style="font-size:30px;margin-top:12px;opacity:.9">יעדים, יומן אכילה, שקילות ומלווה תזונה אישי</div></div></body></html>`);
await p.screenshot({ path: path.join(ROOT, 'store/android/feature-graphic-1024x500.png') });
await b.close(); srv.kill(); console.log('screenshots ok');
