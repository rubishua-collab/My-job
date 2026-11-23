// בדיקת קבלה רב-משתמשים: שני משתמשים + מנהל, בהדמיית iPhone 13 ו-Pixel 7 (Playwright/Chromium).
// הרצה: node test/e2e-multiuser.mjs   (מרים שרת זמני, שרת Claude מדומה, ו-DB עם נתונים בפורמט הישן)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { totp } from '../server/crypto.js';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8895, BASE = `http://localhost:${PORT}`, MOCK = 8896;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-mu-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const ADMIN = 'robi-admin@test.local', U1 = 'dana@test.local', U2 = 'yossi@test.local', PW = 'Secret123';
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const WS = addDays(T, -dow(T)); // ראשון של השבוע
const results = []; let step = 0;
const ok = (name, platform = 'שרת') => { results.push({ name, platform, pass: true }); console.log(`✓ ${++step}. [${platform}] ${name}`); };

// ---- 1. DB בפורמט הישן (משתמש יחיד) עם היסטוריה, כדי לבדוק את העברת הנתונים ----
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-mu-'));
{
  const db = new DatabaseSync(path.join(dataDir, 'tafrit.sqlite'));
  db.exec(`CREATE TABLE docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (col, id));
    CREATE TABLE history (seq INTEGER PRIMARY KEY AUTOINCREMENT, col TEXT, id TEXT, action TEXT, before TEXT, after TEXT, at INTEGER);
    CREATE TABLE chat (seq INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT, at INTEGER);
    CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE ops (op TEXT PRIMARY KEY, result TEXT, at INTEGER);`);
  const put = db.prepare('INSERT INTO docs VALUES (?, ?, ?, ?, ?)'); const t0 = Date.now() - 30 * 864e5;
  put.run('profile', 'me', JSON.stringify({ sex: 'male', age: 38, heightCm: 180, goal: 'lose', rate: 'moderate', job: 'sitting', strength: { perWeek: 3, minutes: 60 }, meals: 3, kosher: true, allergies: [], onboarding: { done: true } }), t0, t0);
  put.run('targets', 't_old', JSON.stringify({ effectiveFrom: addDays(T, -28), kcal: 2250, protein: 200, reason: 'חישוב ראשוני', source: 'onboarding' }), t0, t0);
  for (let i = 28; i >= 1; i--) put.run('weights', addDays(T, -i), JSON.stringify({ date: addDays(T, -i), kg: +(121 - (28 - i) * 0.05).toFixed(2), note: '' }), t0, t0);
  put.run('entries', 'e_old1', JSON.stringify({ date: addDays(T, -2), meal: 'lunch', foodId: 'm805', snapshot: { n: 'בשר עוף, חזה', k: 160, p: 30.1 }, grams: 200, status: 'eaten', eatenGrams: 200 }), t0, t0);
  db.prepare('INSERT INTO chat (role, content, at) VALUES (?, ?, ?)').run('user', JSON.stringify({ text: 'שאלה ישנה' }), t0);
  db.close();
}
const legacyCount = 1 + 1 + 28 + 1;

// ---- שרת Claude מדומה: מתעד את תוצאות הכלים שנשלחו אליו ----
const aiCalls = [];
const mock = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c; const body = JSON.parse(b); aiCalls.push(body);
  const last = body.messages.at(-1); const isToolResult = Array.isArray(last.content) && last.content[0]?.type === 'tool_result';
  const content = isToolResult ? [{ type: 'text', text: 'לפי היומן שלך: ' + JSON.parse(last.content[0].content).latest_weight?.kg }] : [{ type: 'tool_use', id: 'tu' + aiCalls.length, name: 'get_status', input: {} }];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'm' + aiCalls.length, type: 'message', role: 'assistant', model: body.model, content, stop_reason: isToolResult ? 'end_turn' : 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } }));
});
await new Promise(r => mock.listen(MOCK, r));

const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: path.join(HERE, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), MAIL_DEV: '1', NODE_ENV: 'test', ADMIN_EMAIL: ADMIN, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK}`, DATA_ENCRYPTION_KEY: 'a'.repeat(64) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));

const api = async (method, url, body, tok) => {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); return { status: r.status, ...j, _json: j };
};
const lastCode = async (email, purpose) => (await (await fetch(BASE + '/api/dev/outbox')).json()).filter(m => m.to === email && m.purpose === purpose).at(-1).code;
async function signupApi(email) {
  await api('POST', '/api/auth/register', { email, password: PW, acceptPrivacy: true });
  return api('POST', '/api/auth/verify', { email, code: await lastCode(email, 'verify'), kind: 'bearer' });
}

const browser = await chromium.launch();
const errors = [];
const mkCtx = async (device) => { const c = await browser.newContext({ ...devices[device], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' }); return c; };
const watch = (page, tag) => { page.on('pageerror', e => errors.push(`${tag}: ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/40[0134]|favicon/.test(m.text())) errors.push(`${tag}: ${m.text()}`); }); return page; };
const shot = async (page, n) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
const noSheet = page => page.waitForFunction(() => !document.querySelector('.sheet-wrap'));

try {
  // ============ מנהל: הרשמה → נעילת מנהל → העברת הנתונים הקיימים עם גיבוי ובדיקה ============
  const adm = await signupApi(ADMIN);
  assert.equal(adm.user.admin, true);
  assert.equal(adm.migration.verified, true);
  assert.equal(Object.values(adm.migration.before).reduce((a, b) => a + b, 0), legacyCount);
  assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).some(f => f.includes('before-migration') && f.endsWith('.enc')), 'נוצר גיבוי מוצפן לפני המעבר');
  const admState = await api('GET', '/api/state', null, adm.token);
  assert.equal(admState.weights.length, 28); assert.equal(admState.targets[0].kcal, 2250); assert.equal(admState.entries.length, 1);
  assert.equal(admState.plans.length, 1, 'נוצרה "תוכנית ראשונה" מהנתונים הקיימים'); assert.equal(admState.plans[0].startDate, addDays(T, -28));
  assert.equal((await api('GET', '/api/chat', null, adm.token))._json.length, 1);
  ok(`העברת הנתונים הקיימים לחשבון המנהל: ${legacyCount} רשומות, גיבוי מוצפן לפני, בדיקת תוכן רשומה-רשומה עברה, ההיסטוריה המלאה זמינה`);

  // הצפנה באחסון: אין טקסט גלוי בטבלת המסמכים
  { const raw = new DatabaseSync(path.join(dataDir, 'tafrit.sqlite'), { readOnly: true }); const rows = raw.prepare('SELECT data FROM docs').all(); raw.close();
    assert.ok(rows.length > 30 && rows.every(r => r.data.startsWith('e1:')), 'כל המסמכים מוצפנים'); assert.ok(!rows.some(r => /[\u0590-\u05FF{}"]/.test(r.data))); }
  ok('המידע האישי מוצפן באחסון (AES-256-GCM) — אין ערכים גלויים בקובץ ה-DB');

  // ============ משתמש 1 — אייפון: הרשמה מלאה בממשק + שאלון ============
  const ctxA = await mkCtx('iPhone 13'); const pA = watch(await ctxA.newPage(), 'iPhone');
  await pA.goto(BASE + '/'); await pA.getByText('לפני שנרשמים — מה חשוב לדעת').waitFor();
  const welcome = await pA.locator('#app').innerText();
  assert.match(welcome, /מנהל האפליקציה \(רובי שועה\)/); assert.match(welcome, /Anthropic/); assert.match(welcome, /מחיקה/);
  await shot(pA, 'm01-welcome-iphone');
  await pA.click('text=פתיחת חשבון'); await pA.fill('#em', U1); await pA.fill('#pw', PW);
  await pA.click('#f button'); await pA.getByText('צריך לאשר את מדיניות הפרטיות').waitFor();
  await pA.check('#ok'); await pA.click('#f button'); await pA.locator('#cd').waitFor();
  await pA.fill('#cd', await lastCode(U1, 'verify')); await pA.click('#f button');
  await pA.getByText('נתחיל: גיל ומין').waitFor();
  ok('הרשמה בדוא״ל עם הסבר פרטיות לפני ההרשמה, אישור מדיניות ואימות כתובת בקוד', 'iPhone');
  // שאלון קצר
  await pA.click('[data-opts="sex"] [data-v="female"]'); await pA.fill('#age', '34'); await pA.click('#next');
  await pA.fill('#h', '165'); await pA.fill('#w', '72.4'); await pA.click('#next');
  await pA.click('[data-opts="goal"] [data-v="lose"]'); await pA.click('#next');
  await pA.click('[data-opts="rate"] [data-v="moderate"]'); await pA.click('#next');
  await pA.click('[data-opts="job"] [data-v="mixed"]'); await pA.click('#next');
  await pA.fill('#sp', '2'); await pA.click('#next'); await pA.click('#next'); await pA.click('#next'); await pA.click('#next');
  await pA.click('[data-opts="prep"] [data-v="15"]'); await pA.click('#next');
  await pA.click('[data-chips="likes"] [data-v="קוטג׳"]'); await pA.click('#next'); await pA.click('#next');
  await pA.click('[data-opts="kosher"] [data-v="0"]'); await pA.click('#next'); await pA.click('#next');
  await pA.click('[data-chips="all"] [data-v="fish"]'); await pA.click('#next'); await pA.click('#next');
  await pA.fill('#cw', '72.4'); await pA.check('#okgoal'); await pA.click('#next');
  await pA.locator('#savet').click(); await pA.getByText('היום שלי').first().waitFor();
  const u1tok = null; // באתר: עוגיית HttpOnly — לא נגישה לסקריפט
  assert.equal(await pA.evaluate(() => document.cookie.includes('sid')), false, 'העוגייה HttpOnly');
  ok('שאלון היכרות לפרופיל ריק ויצירת תוכנית ראשונה', 'iPhone');

  // משתמש 1: שקילה ותפריט
  await pA.click('[data-weigh]'); await pA.fill('#wk', '72.4'); await pA.click('.sheet [data-ok]'); await noSheet(pA);
  await pA.click('[data-meal="breakfast"] [data-mact="add"]'); await pA.fill('#fpq', 'קוטג 5% תנובה'); await pA.locator('[data-food="m494"]').click();
  await pA.selectOption('#fu', 'g'); await pA.fill('#fq', '200'); await pA.click('[data-add="eaten"]'); await noSheet(pA);
  await shot(pA, 'm02-u1-today-iphone');

  // ============ משתמש 2 — אנדרואיד ============
  const u2 = await signupApi(U2);
  await api('PUT', '/api/profile', { profile: { sex: 'male', age: 45, heightCm: 178, goal: 'gain', rate: 'slow', job: 'active', strength: { perWeek: 4, minutes: 60 }, meals: 4, kosher: true, allergies: ['milk'], onboarding: { done: true } } }, u2.token);
  await api('POST', '/api/plans', { kind: 'initial', goal: 'gain', settings: { rate: 'slow', job: 'active', strength: { perWeek: 4, minutes: 60 }, meals: 4 }, startDate: T, weightKg: 88.2 }, u2.token);
  for (const [i, kg] of [[-6, 88.6], [-4, 88.4], [-2, 88.3]]) if (addDays(T, i) >= WS) await api('PUT', '/api/weights/' + addDays(T, i), { kg }, u2.token);
  await api('PUT', '/api/weights/' + T, { kg: 88.2 }, u2.token);
  await api('POST', '/api/entries', { entries: [{ date: T, meal: 'lunch', foodId: 'm805', grams: 250, status: 'eaten' }] }, u2.token);
  const ctxB = await mkCtx('Pixel 7'); const pB = watch(await ctxB.newPage(), 'Android');
  await pB.goto(BASE + '/#/login'); await pB.fill('#em', U2); await pB.fill('#pw', PW); await pB.click('#f button');
  await pB.getByText('היום שלי').first().waitFor(); await shot(pB, 'm03-u2-today-android');
  const bText = await pB.locator('#app').innerText();
  assert.ok(!/קוטג/.test(bText), 'משתמש 2 לא רואה את ארוחת משתמש 1'); assert.match(await pB.locator('.sum').innerText(), /400/); // 250 ג׳ עוף = 400 קק״ל
  ok('כניסה ממכשיר אנדרואיד: רואה רק את היומן שלו', 'Android');

  // כל אחד רואה רק את שלו + ממוצע שבועי מהשקילות שלו בלבד
  await pB.click('.tabbar [data-r="weight"]'); await pB.getByText('ממוצעים שבועיים').waitFor();
  const wB = await pB.locator('#app').innerText(); assert.ok(!/72[.,]4/.test(wB) && !/120[.,]/.test(wB), 'אין שקילות של אחרים');
  const myW = [[-6, 88.6], [-4, 88.4], [-2, 88.3]].filter(([i]) => addDays(T, i) >= WS).map(x => x[1]).concat(88.2);
  const avgB = Math.round(myW.reduce((a, b) => a + b, 0) / myW.length * 100) / 100;
  assert.match(wB, new RegExp(`${myW.length} מתוך 7 שקילות`)); assert.match(wB, new RegExp(String(avgB).replace('.', '\\.')));
  await shot(pB, 'm04-u2-weight-android');
  await pA.click('.tabbar [data-r="weight"]'); await pA.getByText('ממוצעים שבועיים').waitFor();
  const wA = await pA.locator('#app').innerText(); assert.match(wA, /1 מתוך 7 שקילות/); assert.match(wA, /72[.,]4/); assert.ok(!/88[.,]/.test(wA));
  ok(`ממוצע שבועי מהשקילות של כל משתמש בלבד (משתמש 2: ${avgB}, ${myW.length} מתוך 7; משתמש 1: 72.4, 1 מתוך 7)`, 'iPhone + Android');

  // ============ מלווה התזונה משתמש רק בהיסטוריה של המשתמש ============
  await pB.click('.tabbar [data-r="chat"]'); await pB.locator('#ci').waitFor();
  await pB.fill('#ci', 'מה המצב שלי היום?'); await pB.click('#cs');
  await pB.getByText('מלווה חכם — ספק AI חיצוני').waitFor(); await shot(pB, 'm05-ai-consent-android');
  assert.equal(aiCalls.length, 0, 'לא נשלח כלום לספק לפני הסכמה');
  await pB.click('.sheet [data-yes]'); await pB.getByText('לפי היומן שלך: 88.2').waitFor();
  const toolRes = JSON.parse(aiCalls.at(-1).messages.at(-1).content[0].content);
  assert.equal(toolRes.latest_weight.kg, 88.2); assert.equal(toolRes.eaten.kcal, 400);
  const sent = JSON.stringify(aiCalls.map(c => c.messages));
  assert.ok(!sent.includes(U2) && !sent.includes(U1) && !sent.includes('72.4') && !sent.includes('קוטג'), 'בלי דוא״ל ובלי נתונים של אחרים');
  ok('מלווה התזונה: בקשת הסכמה לפני העברה ראשונה ל-Anthropic; נשלחו רק נתוני המשתמש, בלי דוא״ל', 'Android');
  await pA.click('.tabbar [data-r="chat"]'); await pA.locator('#ci').waitFor();
  await pA.fill('#ci', 'כמה נשאר לי היום?'); await pA.click('#cs');
  await pA.getByText('המשך במצב בסיסי').waitFor(); const before = aiCalls.length; await pA.click('.sheet [data-no]');
  await pA.locator('.msg.a').last().filter({ hasText: 'אכלת' }).waitFor();
  assert.equal(aiCalls.length, before, 'בלי הסכמה — לא נשלח לספק');
  assert.match(await pA.locator('.msg.a').last().innerText(), /190/); // 200 ג׳ קוטג׳ = 190
  ok('בלי הסכמה המלווה עונה במצב בסיסי מהיומן של המשתמש בלבד', 'iPhone');

  // ============ חסימת גישה לפרופיל אחר ============
  const st2 = await api('GET', '/api/state', null, u2.token); const e2 = st2.entries[0];
  const u1login = await api('POST', '/api/auth/login', { email: U1, password: PW, kind: 'bearer' });
  const t1 = u1login.token;
  for (const [m, u, b] of [['PUT', `/api/entries/${e2.id}`, { grams: 1 }], ['DELETE', `/api/entries/${e2.id}`], ['GET', `/api/entries/${e2.id}/history`], ['GET', `/api/weights/${T}/history`]]) {
    const r = await api(m, u, b, t1);
    if (u.includes('/weights/')) assert.ok(!(r._json || []).some?.(h => h.after?.kg === 88.2), 'היסטוריית שקילה של משתמש אחר לא נחשפת'); else assert.equal(r.status, 404, `${m} ${u}`);
  }
  assert.equal((await api('GET', '/api/state', null, u2.token)).entries[0].grams, 250, 'הרשומה של משתמש 2 לא השתנתה');
  assert.equal((await api('GET', '/api/admin/users', null, t1)).status, 403);
  assert.equal((await api('GET', '/api/admin/users/' + u2.user.id, null, t1)).status, 403);
  assert.equal((await api('GET', '/api/state')).status, 401);
  await pA.goto(BASE + '/#/admin/user/' + u2.user.id); await pA.getByText('אין הרשאה').waitFor();
  ok('החלפת מזהה וקישור ישיר לפרופיל אחר נחסמים (404/403/401), כולל מסך הניהול', 'שרת + iPhone');

  // ============ מנהל עם אימות דו-שלבי ============
  assert.equal((await api('GET', '/api/admin/users', null, adm.token)).status, 403, 'מנהל בלי 2FA נחסם');
  const ctxC = await mkCtx('iPhone 13'); const pC = watch(await ctxC.newPage(), 'iPhone-admin');
  await pC.goto(BASE + '/#/login'); await pC.fill('#em', ADMIN); await pC.fill('#pw', PW); await pC.click('#f button'); await pC.getByText('היום שלי').first().waitFor();
  await pC.goto(BASE + '/#/admin'); await pC.getByText('אימות דו-שלבי').first().waitFor();
  const secret = (await pC.locator('.card .num').innerText()).replace(/\s/g, '');
  await pC.fill('#cd', '000000'); await pC.click('#ok'); await pC.waitForTimeout(400);
  await pC.fill('#cd', totp(secret)); await pC.click('#ok'); await pC.getByText('ניהול משתמשים').waitFor();
  await pC.fill('#q', 'yossi'); await pC.click('#sf button'); await pC.locator('[data-u]').first().click();
  await pC.getByText('צפייה בפרופיל').waitFor(); const av = await pC.locator('#app').innerText(); assert.match(av, /yossi@test\.local/); assert.match(av, /עלייה במסת שריר/);
  await shot(pC, 'm06-admin-view-iphone');
  // מנהל בסשן אחר (מכשיר אחר) צריך שוב 2FA
  assert.equal((await api('GET', '/api/admin/users', null, adm.token)).status, 403);
  const audit = await pC.evaluate(async () => (await fetch('/api/admin/audit')).json());
  const v = audit.find(a => a.action === 'admin_view_profile' && a.target_user_id === u2.user.id);
  assert.ok(v && v.meta === null && Object.keys(v).sort().join() === 'action,actor_id,at,ip,meta,seq,target_user_id', 'יומן: מי/מתי/איזה פרופיל, בלי תוכן');
  assert.ok(audit.some(a => a.action === 'mfa_failed'));
  // הפרופיל של המנהל חסום למשתמשים אחרים
  const admEntry = (await api('GET', '/api/state', null, adm.token)).entries[0];
  assert.equal((await api('DELETE', '/api/entries/' + admEntry.id, null, u2.token)).status, 404);
  ok('מנהל: חובת אימות דו-שלבי (קוד שגוי נדחה), חיפוש ופתיחת פרופיל לצפייה, רישום ביומן בלי תוכן; הפרופיל של המנהל חסום לאחרים', 'iPhone');

  // ============ החלפת חשבון באותו טלפון + מכשיר חדש ============
  await pA.goto(BASE + '/#/more'); await pA.getByText('החשבון שלי').waitFor();
  await pA.evaluate(() => localStorage.setItem('tafrit-ob-draft', '{"x":1}'));
  await pA.locator('[data-sec="logout"]').click(); await pA.getByText('לפני שנרשמים').waitFor();
  const ls = await pA.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tafrit')));
  assert.deepEqual(ls, [], 'המידע המקומי נמחק בהתנתקות');
  assert.equal((await pA.evaluate(async () => (await fetch('/api/state')).status)), 401);
  await pA.goto(BASE + '/#/login'); await pA.fill('#em', U2); await pA.fill('#pw', PW); await pA.click('#f button'); await pA.getByText('היום שלי').first().waitFor();
  const swText = await pA.locator('#app').innerText(); assert.ok(!/קוטג/.test(swText)); assert.match(await pA.locator('.sum').innerText(), /400/);
  ok('החלפת חשבון באותו טלפון: ההתנתקות מוחקת את המידע המקומי, והחשבון השני רואה רק את שלו', 'iPhone');
  const ctxD = await mkCtx('Pixel 7'); const pD = watch(await ctxD.newPage(), 'Android-new');
  await pD.goto(BASE + '/#/login'); await pD.fill('#em', U1); await pD.fill('#pw', PW); await pD.click('#f button'); await pD.getByText('היום שלי').first().waitFor();
  assert.match(await pD.locator('.sum').innerText(), /190/);
  await pD.click('.tabbar [data-r="weight"]'); await pD.getByText('72').first().waitFor();
  ok('כניסה ממכשיר חדש: הפרופיל וכל ההיסטוריה זמינים', 'Android');

  // ============ שינוי מטרה ותוכנית (משתמש 1, אנדרואיד) ============
  // היסטוריה: יעד חיטוב בתוקף אתמול
  const histT = (await api('GET', '/api/day/' + T, null, t1)).target;
  await pD.click('.tabbar [data-r="today"]'); await pD.click('text=🎯 שינוי מטרה ותוכנית');
  await pD.getByText('מה תרצה לשנות?').waitFor(); await shot(pD, 'm07-plan-change-android');
  await pD.click('[data-opts="kind"] [data-v="goal_change"]'); await pD.click('#next');
  await pD.click('[data-opts="goal"] [data-v="gain"]'); await pD.click('#next');
  await pD.fill('#sp', '4'); await pD.click('#next');
  await pD.click('[data-opts="menu"] [data-v="keep"]'); await pD.click('#next');
  await pD.getByText('התוכנית הנוכחית מול התוכנית החדשה').waitFor();
  const cmp = await pD.locator('table.nut').innerText(); assert.match(cmp, /חיטוב וירידה בשומן/); assert.match(cmp, /עלייה במסת שריר/); assert.match(cmp, /פחמימות/); assert.match(cmp, /שומן/);
  assert.ok(!/סלמון|אמנון|טונה/.test(await pD.locator('#app').innerText()), 'אלרגיה לדגים נשמרת בתפריט החדש');
  await shot(pD, 'm08-plan-compare-android');
  await pD.click('[data-opts="start"] [data-v="' + T + '"]'); await pD.uncheck('#aps'); await pD.click('#next'); await pD.getByText('היום שלי').first().waitFor();
  const today1 = await api('GET', '/api/day/' + T, null, t1);
  assert.equal(today1.plan.goal, 'gain'); assert.ok(today1.target.kcal > histT.kcal, 'יעד עלייה גבוה מחיטוב');
  assert.equal(today1.eaten.kcal, 190, 'מה שנאכל היום נשמר');
  // היסטוריה: חשבון המנהל (חיטוב מ-28 ימים) עובר לעלייה מהיום — דוח של אתמול נשאר לפי יעד החיטוב
  await api('POST', '/api/plans', { kind: 'goal_change', goal: 'gain', settings: { rate: 'slow', meals: 3, strength: { perWeek: 3, minutes: 60 } }, startDate: T, weightKg: 120 }, adm.token);
  const ay = await api('GET', '/api/day/' + addDays(T, -1), null, adm.token), at = await api('GET', '/api/day/' + T, null, adm.token);
  assert.equal(ay.target.kcal, 2250); assert.equal(ay.plan.goal, 'lose'); assert.equal(ay.plan.endDate, addDays(T, -1)); assert.equal(at.plan.goal, 'gain'); assert.ok(at.target.kcal > 2250);
  const yest1 = ay;
  assert.equal(today1.remaining.kcal, today1.target.kcal - 190, 'היתרה לפי היעד החדש');
  ok(`מעבר מחיטוב לעלייה במסת שריר מהיום: יעד ${histT.kcal} → ${today1.target.kcal}, הארוחה שנאכלה נשמרה והיתרה חושבה מחדש; בחשבון עם היסטוריה — הדוח של אתמול נשאר לפי יעד החיטוב (${yest1.target.kcal})`, 'Android');
  // שמירת משקל בתאריך עתידי
  const fut = addDays(T, 5);
  await pD.goto(BASE + '/#/plan-change'); await pD.click('[data-opts="kind"] [data-v="goal_change"]'); await pD.click('#next');
  await pD.click('[data-opts="goal"] [data-v="maintain"]'); await pD.click('#next');
  await pD.fill('#rmin', '71'); await pD.fill('#rmax', '73'); await pD.click('#next'); await pD.click('#next');
  await pD.click('[data-opts="start"] [data-v="custom"]'); await pD.fill('#sd', fut); await pD.click('#next'); await pD.getByText('התוכנית שלי').first().waitFor();
  const dFut = await api('GET', '/api/day/' + fut, null, t1); const dBefore = await api('GET', '/api/day/' + addDays(fut, -1), null, t1);
  assert.equal(dFut.plan.goal, 'maintain'); assert.equal(dBefore.plan.goal, 'gain'); assert.equal(dBefore.plan.endDate, addDays(fut, -1));
  assert.match(await pD.locator('#app').innerText(), /עתידית/); await shot(pD, 'm09-plan-history-android');
  ok(`מעבר לשמירת משקל (טווח 71–73) מתאריך עתידי ${fut}: עד יום קודם נשארת התוכנית הנוכחית`, 'Android');
  // בנייה מחדש של תפריט בלי להחליף מטרה (משתמש 2: 4 → 3 ארוחות)
  await pB.goto(BASE + '/#/plan-change'); await pB.click('[data-opts="kind"] [data-v="same_goal"]'); await pB.click('#next'); await pB.getByText('המטרה נשארת').waitFor(); await pB.click('#next');
  await pB.click('[data-seg="meals"] [data-v="3"]'); await pB.click('#next');
  await pB.click('[data-opts="menu"] [data-v="new"]'); await pB.click('#next');
  const cmpB = await pB.locator('table.nut').innerText(); assert.match(cmpB, /ארוחות\s*4\s*3/);
  assert.ok(!/קוטג|יוגורט|גבינה/.test(await pB.locator('#app').innerText()), 'אלרגיה לחלב נשמרת');
  await pB.locator('[data-swapmeal="0"]').click(); await pB.getByText('הסיכום היומי יהיה').first().waitFor(); await pB.locator('.sheet [data-addopt="1"]').click(); await noSheet(pB);
  await pB.click('[data-opts="start"] [data-v="' + addDays(T, 1) + '"]'); await pB.click('#next'); await pB.getByText('התוכנית שלי').first().waitFor();
  const st2b = await api('GET', '/api/state', null, u2.token);
  const pl2 = st2b.plans; assert.equal(pl2.length, 2); assert.equal(pl2[1].goal, 'gain'); assert.equal(pl2[1].settings.meals, 3); assert.equal(pl2[0].settings.meals, 4);
  assert.ok(st2b.entries.some(e => e.date === addDays(T, 1) && e.source === 'plan'), 'יום לדוגמה נוסף לתכנון של מחר');
  ok('בנייה מחדש של תפריט בלי החלפת מטרה (4 → 3 ארוחות, תפריט חדש מהמאגר, החלפת ארוחה עם סיכום יומי מיידי), החל ממחר', 'Android');
  // מסך הבית ביום עתידי מציג את התוכנית הנכונה; הדוח השבועי לפי המטרה; פרטיות נשמרת
  await pB.goto(BASE + '/#/today/' + addDays(T, 1)); await pB.waitForFunction(() => location.hash.includes('/today/') && document.querySelectorAll('[data-meal]').length === 3, null, { timeout: 8000 });
  await pB.goto(BASE + '/#/today'); await pB.waitForFunction(() => document.querySelectorAll('[data-meal]').length === 4 && !document.querySelector('.sub')?.textContent.includes('24.11'), null, { timeout: 8000 });
  const stat1 = await api('POST', '/api/chat', { message: 'כמה נשאר לי היום?' }, t1);
  assert.match(stat1.text, new RegExp(String(today1.target.kcal)));
  assert.equal((await api('GET', '/api/state', null, u2.token)).plans.every(p => p.goal === 'gain'), true, 'התוכניות של משתמש 1 לא השפיעו על משתמש 2');
  ok('מסך הבית, היומן, הדוחות והמלווה מציגים את התוכנית לפי התאריך; התוכניות של משתמש אחד לא משפיעות על אחר', 'iPhone + Android');

  // ============ מחיקת חשבון מעמוד האינטרנט ============
  const pE = watch(await ctxB.newPage(), 'web');
  await pE.goto(BASE + '/delete-account'); await pE.fill('#em', U2); await pE.click('#f1 button'); await pE.locator('#cd').waitFor();
  await pE.fill('#cd', await lastCode(U2, 'delete')); await pE.click('#f2 button'); await pE.getByText('החשבון וכל המידע נמחקו').waitFor();
  assert.equal((await api('GET', '/api/state', null, u2.token)).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: U2, password: PW })).status, 401);
  { const raw = new DatabaseSync(path.join(dataDir, 'tafrit.sqlite'), { readOnly: true }); assert.equal(raw.prepare('SELECT COUNT(*) n FROM docs WHERE user_id = ?').get(u2.user.id).n, 0); raw.close(); }
  ok('מחיקת חשבון מעמוד אינטרנט עם קוד לדוא״ל: כל המידע נמחק והגישה נחסמת', 'Android');
  await pE.goto(BASE + '/privacy'); assert.match(await pE.locator('main').innerText(), /רובי שועה/);

  assert.deepEqual(errors, [], 'אין שגיאות JS');
  ok('אין שגיאות JavaScript באף אחד מהמכשירים', 'iPhone + Android');
  console.log(`\nכל ${results.length} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) {
  for (const pg of browser.contexts().flatMap(c => c.pages())) { try { await pg.screenshot({ path: path.join(SHOTS, `FAIL-${browser.contexts().indexOf(pg.context())}.png`) }); console.error('PAGE', await pg.evaluate(() => location.hash), (await pg.locator('body').innerText()).slice(0, 300)); } catch {} }
  console.error(`✗ נכשל אחרי שלב ${step}:`, e); console.error('JS errors:', errors); process.exitCode = 1;
} finally { await browser.close(); srv.kill(); mock.close(); }
fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 1));
