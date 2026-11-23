// בדיקת היכולות שהועברו מ״יומן התזונה של רובי״ (הגרסה הקודמת) — דרך המסכים, בהדמיית iPhone 13.
// הרצה: node test/e2e-legacy-features.mjs   (שרת זמני + שרת Claude מדומה לקריאת טבלה תזונתית)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8897, BASE = `http://localhost:${PORT}`, MOCK = 8898;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-legacy-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const EMAIL = 'robi@test.local', PW = 'Secret123';
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = name => console.log(`✓ ${++step}. ${name}`);

// שרת Claude מדומה: מחזיר טבלה תזונתית "שנקראה" מהתמונה
const labelCalls = [];
const mock = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c; const body = JSON.parse(b);
  const img = body.messages?.[0]?.content?.find?.(x => x.type === 'image');
  labelCalls.push({ hasImage: !!img, mediaType: img?.source?.media_type, keys: Object.keys(body) });
  const text = JSON.stringify({ found: true, name: 'חטיף חלבון שוקו', basis: '100g', kcal: 380, protein: 30, carbs: 35, fat: 12, unitGrams: 45, unitLabel: 'חטיף' });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'm1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
});
await new Promise(r => mock.listen(MOCK, r));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-legacy-'));
const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: path.join(HERE, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), MAIL_DEV: '1', NODE_ENV: 'test', ADMIN_EMAIL: 'admin@test.local', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK}`, DATA_ENCRYPTION_KEY: 'b'.repeat(64) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));

const api = async (method, url, body, tok) => {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${j.error}`); return j;
};
const lastCode = async (email, purpose) => (await (await fetch(BASE + '/api/dev/outbox')).json()).filter(m => m.to === email && m.purpose === purpose).at(-1).code;

// משתמש עם פרופיל, תוכנית ירידה עם משקל יעד, ו-3 שבועות שקילות (כמו רובי ביומן הקודם)
await api('POST', '/api/auth/register', { email: EMAIL, password: PW, acceptPrivacy: true });
const login = await api('POST', '/api/auth/verify', { email: EMAIL, code: await lastCode(EMAIL, 'verify'), kind: 'bearer' });
const tok = login.token;
await api('PUT', '/api/profile', { profile: { sex: 'male', age: 36, heightCm: 186, goal: 'lose', rate: 'moderate', targetWeight: 95, job: 'sitting', steps: 6000, strength: { perWeek: 3, minutes: 60 }, meals: 4, kosher: true, allergies: [], onboarding: { done: true } } }, tok);
for (let i = 21; i >= 0; i--) await api('PUT', '/api/weights/' + addDays(T, -i), { kg: +(121 - (21 - i) * 0.12).toFixed(2) }, tok);
await api('POST', '/api/plans', { kind: 'initial', goal: 'lose', settings: { rate: 'moderate', targetWeight: 95, meals: 4 }, startDate: addDays(T, -21), reason: 'חישוב ראשוני' }, tok);
await api('POST', '/api/account/ai-consent', { consent: true }, tok);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true });
await ctx.addInitScript(t => { localStorage.setItem('tafrit-token', t); }, tok);
// באתר הסשן הוא עוגייה; כאן נכנסים דרך מסך הכניסה כמו משתמש
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/40[0134]|favicon/.test(m.text())) errors.push(m.text()); });
const shot = async n => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
const noSheet = () => page.waitForFunction(() => !document.querySelector('.sheet-wrap'));
const state = () => page.evaluate(async () => (await fetch('/api/state', { credentials: 'same-origin' })).json());
const todayEntries = async () => (await state()).entries.filter(e => e.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()));

try {
  await page.goto(BASE + '/#/login'); await page.fill('#em', EMAIL); await page.fill('#pw', PW); await page.click('#f button');
  await page.getByText('היום שלי').first().waitFor();

  // 1. מאגר: הרשימה הנפוצה מהיומן הקודם + רשתות מזון מהיר למנה
  await page.click('[data-act="self"]'); await page.fill('#fpq', 'אסאדו');
  await page.getByText('אסאדו (צלעות בקר) (צלוי)').first().waitFor();
  await page.fill('#fpq', 'ביג מק'); await page.getByText("ביג מק (מקדונלד'ס)").first().waitFor();
  assert.match(await page.locator('#fpres').innerText(), /ל-1 המבורגר/);
  await page.getByText("ביג מק (מקדונלד'ס)").first().click();
  await page.locator('#fq').fill('2'); await page.waitForTimeout(150);
  assert.match(await page.locator('#fdt').innerText(), /1,?100/);
  await shot('l01-fastfood-detail');
  await page.click('[data-add="eaten"]'); await noSheet();
  let es = await todayEntries(); const bm = es.find(e => e.snapshot.n.includes('ביג מק'));
  assert.equal(bm.grams, 200); assert.equal(bm.qty, 2); assert.equal(bm.snapshot.pp, 'המבורגר');
  assert.match(await page.locator('#app').innerText(), /2 המבורגר/);
  ok('מאגר: מזונות נפוצים מהיומן הקודם (אסאדו) ורשתות מזון מהיר לפי מנה — 2 ביג מק = 1,100 קק״ל, נשמר');

  // 2. רישום ידני (שם + ערכים לכל המנה)
  await page.click('[data-act="self"]'); await page.click('#fptabs [data-t="manual"]');
  await page.fill('#mn', 'שווארמה בלאפה'); await page.fill('#mk', '750'); await page.fill('#mp', '40'); await page.fill('#mc', '70'); await page.fill('#mf', '30');
  assert.match(await page.locator('#manprev').innerText(), /750 קק״ל/);
  await shot('l02-manual');
  await page.click('[data-manadd="eaten"]'); await noSheet();
  es = await todayEntries(); const man = es.find(e => e.snapshot.n === 'שווארמה בלאפה');
  assert.equal(man.snapshot.src, 'manual'); assert.equal(man.snapshot.k, 750); assert.ok(man.foodId.startsWith('q:'));
  // עריכת כמות: 2 מנות
  await page.locator(`[data-entry="${man.id}"]`).click(); await page.click('[data-edit]');
  await page.locator('#fq').fill('2'); await page.click('[data-save]'); await noSheet();
  es = await todayEntries(); assert.equal(es.find(e => e.id === man.id).grams, 200);
  await page.reload(); await page.getByText('שווארמה בלאפה').first().waitFor();
  assert.match(await page.locator(`[data-entry="${man.id}"]`).innerText(), /1,?500|1500/);
  ok('רישום ידני של מנה (שם + קק״ל/חלבון/פחמימה/שומן), עריכת כמות פי 2 = 1,500 קק״ל, נשמר אחרי רענון');

  // 3. ברקוד: מוצר חדש → שמירה עם הברקוד → סריקה מתמונה מוצאת אותו; שיוך ברקוד למוצר קיים
  const CODE = '7290000066318';
  await page.click('[data-act="self"]'); await page.click('#fptabs [data-t="scan"]');
  await page.fill('#bcin', CODE); await page.click('[data-bcfind]');
  await page.getByText(`ברקוד ${CODE} עוד לא שמור אצלך.`).waitFor();
  await page.click('[data-scnew]');
  assert.equal(await page.locator('#cbc').inputValue(), CODE);
  await page.fill('#cn', 'קוטג׳ 5% תנובה'); await page.fill('#ck', '92'); await page.fill('#cp', '10.5'); await page.fill('#cc', '1.4'); await page.fill('#cf', '5');
  await page.locator('.sheet-wrap').last().locator('[data-ok]').click();
  await page.locator('#fq').waitFor(); await page.locator('#fq').fill('250'); await page.click('[data-add="eaten"]'); await noSheet();
  es = await todayEntries(); assert.ok(es.some(e => e.snapshot.n === 'קוטג׳ 5% תנובה' && e.grams === 250));
  // תמונת ברקוד אמיתית (EAN-13) — נקראת במכשיר
  const png = await page.evaluate(code => {
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const R = L.map(x => [...x].map(b => b === '0' ? '1' : '0').join(''));
    const P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const d = [...code].map(Number); let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (P[d[0]][i - 1] === 'L' ? L : G)[d[i]];
    bits += '01010'; for (let i = 7; i <= 12; i++) bits += R[d[i]]; bits += '101';
    const m = 4, q = 40; const c = document.createElement('canvas'); c.width = bits.length * m + 2 * q; c.height = 260;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
    [...bits].forEach((b, i) => { if (b === '1') x.fillRect(q + i * m, 30, m, 200); });
    return c.toDataURL('image/png').split(',')[1];
  }, CODE);
  await page.click('[data-act="self"]'); await page.click('#fptabs [data-t="scan"]');
  await page.setInputFiles('#scfile', { name: 'barcode.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#fq').waitFor({ timeout: 15000 });
  assert.match(await page.locator('.sheet-wrap').last().innerText(), /קוטג׳ 5% תנובה/);
  await shot('l03-barcode-found');
  await page.keyboard.press('Escape'); await page.goto(BASE + '/#/today'); await page.reload(); await page.getByText('היום שלי').first().waitFor();
  // שיוך ברקוד שני למוצר שכבר שמור
  await page.click('[data-act="self"]'); await page.click('#fptabs [data-t="scan"]');
  await page.fill('#bcin', '7290011194246'); await page.click('[data-bcfind]'); await page.locator('#sclinksel').waitFor();
  await page.click('[data-sclink]'); await page.locator('#fq').waitFor();
  const cust = (await state()).custom.find(c => c.name === 'קוטג׳ 5% תנובה'); assert.equal(cust.barcode, '7290011194246');
  await page.goto(BASE + '/#/today'); await page.reload(); await page.getByText('היום שלי').first().waitFor();
  ok('ברקוד: מספר לא מוכר → "שמור כמוצר חדש" עם הברקוד; צילום ברקוד EAN-13 נקרא במכשיר ומוצא את המוצר; שיוך ברקוד למוצר קיים');

  // 4. צילום טבלה תזונתית → ערכים → יחידות → שמירה גם במוצרים האישיים
  await page.click('[data-act="self"]'); await page.click('#fptabs [data-t="photo"]');
  await page.setInputFiles('#phfile', { name: 'label.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#phbody').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#phn').inputValue(), 'חטיף חלבון שוקו'); assert.equal(await page.locator('#phk').inputValue(), '380');
  assert.equal(labelCalls.at(-1).hasImage, true); assert.equal(labelCalls.at(-1).mediaType, 'image/jpeg');
  await page.click('[data-phm="u"]'); assert.equal(await page.locator('#phuw').inputValue(), '45');
  await page.fill('#phu', '2'); assert.match(await page.locator('#phprev').innerText(), /342 קק״ל/);
  await page.check('#phsave'); await shot('l04-label-photo');
  await page.click('[data-phadd="eaten"]'); await noSheet();
  const st4 = await state(); assert.ok(st4.custom.some(c => c.name === 'חטיף חלבון שוקו' && c.unitGrams === 45));
  assert.ok(st4.entries.some(e => e.snapshot.n === 'חטיף חלבון שוקו' && e.grams === 90 && e.qty === 2));
  ok('צילום טבלה תזונתית: הערכים נקראו (נשלחה רק תמונה מוקטנת, JPEG), 2 חטיפים × 45 ג׳ = 342 קק״ל, נשמר גם כמוצר אישי');

  // 5. פחמימות ושומן, יום אימון, מים
  let txt = await page.locator('.card.sum').innerText();
  assert.match(txt, /פחמימות/); assert.match(txt, /שומן/);
  const kcalTarget = () => page.locator('.card.sum .meter').first().locator('.lab').innerText();
  const before = +(await kcalTarget()).match(/\/\s*([\d,]+)/)[1].replace(',', '');
  await page.check('#train'); await page.waitForTimeout(500);
  const after = +(await kcalTarget()).match(/\/\s*([\d,]+)/)[1].replace(',', '');
  assert.equal(after - before, 150);
  await page.click('[data-cup="1"]'); await page.waitForTimeout(300); await page.click('[data-cup="1"]'); await page.waitForTimeout(400);
  await page.reload(); await page.getByText('היום שלי').first().waitFor();
  assert.equal(await page.locator('#train').isChecked(), true);
  assert.match(await page.locator('.water').innerText(), /2\s*כוסות[\s\S]*0\.26 מתוך/);
  await shot('l05-today-water-train');
  const sum = await page.evaluate(async d => (await fetch('/api/day/' + d)).json(), T);
  assert.equal(sum.target.kcal, after);
  ok(`יעד פחמימות ושומן על המסך; יום אימון מעלה את היעד ב-150 (${before} → ${after}), גם בשרת; מים: 2 כוסות = 0.26 ליטר — נשמר אחרי רענון`);

  // 6. PDF של היום
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-pdf="save"]')]);
  const pdfPath = path.join(SHOTS, 'day.pdf'); await dl.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 30000);
  assert.equal(dl.suggestedFilename(), `tafrit-yomi-${T}.pdf`);
  ok(`PDF של יומן היום (${Math.round(pdf.length / 1024)} KB): ארוחות, תכננתי/אכלתי, יעד, יתרה ומים`);

  // 7. שקילה: כמה זמן עד היעד + קו יעד בגרף
  await page.goto(BASE + '/#/weight'); await page.getByText('כמה זמן עד 95').waitFor();
  txt = await page.locator('#app').innerText();
  assert.match(txt, /1% בשבוע/); assert.match(txt, /0\.75% בשבוע/); assert.match(txt, /0\.5% בשבוע/); assert.match(txt, /בקצב השבועי שלך עכשיו/);
  assert.match(txt, /משקל יעד: 95 ק״ג/);
  await shot('l06-weight-eta');
  ok('שקילה: "כמה זמן עד היעד" לפי הקצב האמיתי ולפי 1% / 0.75% / 0.5% בשבוע, ומשקל היעד בגרף');

  // 8. תיקון ידני של היעד (−150)
  await page.goto(BASE + '/#/targets'); await page.locator('#manual summary').click();
  const k0 = +(await page.locator('#mk').inputValue()); await page.click('[data-adj="-150"]');
  assert.equal(+(await page.locator('#mk').inputValue()), k0 - 150);
  await page.click('#msave'); await page.getByText('היום שלי').first().waitFor();
  const tg = (await state()).targets.at(-1); assert.equal(tg.kcal, k0 - 150); assert.equal(tg.source, 'manual'); assert.ok(tg.carbs && tg.fat);
  ok(`תיקון ידני של היעד: ${k0} → ${k0 - 150} קק״ל מהיום, עם פחמימות ושומן מחושבים, נשמר בהיסטוריה`);

  // 9. ארוחה קבועה מאפס (כולל פריט מזון מהיר) → הוספה להיום
  await page.goto(BASE + '/#/more'); await page.click('[data-sec="fixed"]'); await page.click('[data-new]');
  await page.fill('#fmn', 'בוקר קבוע');
  await page.click('[data-addi]'); await page.fill('#fpq', 'קוטג׳ 5% תנובה'); await page.locator('[data-food^="c:"]').first().click();
  await page.click('[data-addi]'); await page.fill('#fpq', 'לחם מלא'); await page.locator('[data-food^="y"]').first().click();
  await page.locator('[data-g="0"]').fill('200'); await page.locator('#fmn').click();
  await shot('l07-fixed-builder');
  await page.locator('.sheet-wrap').last().locator('[data-ok]').click(); await noSheet();
  const fm = (await state()).fixedMeals.find(m => m.name === 'בוקר קבוע'); assert.equal(fm.items.length, 2); assert.equal(fm.items[0].grams, 200);
  await page.click('[data-sec="fixed"]'); await page.locator(`[data-fm="${fm.id}"]`).click(); await page.selectOption('#fmslot', 'breakfast'); await page.click('[data-add]'); await noSheet();
  es = await todayEntries(); assert.equal(es.filter(e => e.source === 'fixed' && e.meal === 'breakfast').length, 2);
  // ארוחה קבועה מתוך היום שכוללת פריט ידני — נשמרת ומוספת מחדש
  await page.goto(BASE + '/#/today'); await page.getByText('היום שלי').first().waitFor();
  const slotOfMan = es.find(e => e.id === man.id).meal;
  page.once('dialog', d => d.accept('ארוחת שווארמה'));
  await page.locator(`[data-meal="${slotOfMan}"] [data-mact="fixed"]`).click(); await page.waitForTimeout(500);
  const fm2 = (await state()).fixedMeals.find(m => m.name === 'ארוחת שווארמה'); assert.ok(fm2.items.some(i => i.manual?.name === 'שווארמה בלאפה'));
  await page.click('[data-act="self"]'); await page.click('#fptabs [data-t="fixed"]'); await page.locator(`[data-fixed="${fm2.id}"]`).click(); await noSheet();
  assert.ok((await todayEntries()).filter(e => e.snapshot.n === 'שווארמה בלאפה').length >= 2);
  ok('ארוחה קבועה נבנית מאפס ב״עוד״ (מוצר אישי + מזון מהמאגר, כמויות), נערכת ומתווספת להיום; ארוחה עם רישום ידני נשמרת כקבועה ומתווספת שוב');

  assert.deepEqual(errors, [], 'אין שגיאות JavaScript');
  ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) {
  await shot('l99-fail').catch(() => {});
  console.error('✗ נכשל:', e.message, '\n', errors.join('\n')); process.exitCode = 1;
} finally { await browser.close(); srv.kill(); mock.close(); }
