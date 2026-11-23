// השלמה אוטומטית ב״מה אתה אוהב לאכול?״ — בדיקה בהדמיית iPhone 13 עם מקלדת (הקלדה אמיתית, תו אחרי תו).
// הרצה: node test/e2e-likes.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8899, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-likes-shots'); fs.mkdirSync(SHOTS, { recursive: true });
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-likes-'));
const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: path.join(HERE, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), MAIL_DEV: '1', NODE_ENV: 'test', DATA_ENCRYPTION_KEY: 'd'.repeat(64) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const code = async () => (await (await fetch(BASE + '/api/dev/outbox')).json()).at(-1).code;

const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/40[0134]/.test(m.text())) errs.push(m.text()); });
const shot = async n => { await p.waitForTimeout(200); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); };
const sugg = async () => (await p.locator('#likesug .ac-opt').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
const tags = () => p.locator('#liketags [data-tag]').evaluateAll(xs => xs.map(x => x.dataset.tag));
const typeQ = async t => { await p.locator('#likesx').fill(''); await p.locator('#likesx').pressSequentially(t, { delay: 40 }); await p.waitForTimeout(100); };
try {
  await p.goto(BASE + '/#/signup'); await p.fill('#em', 'likes@test.local'); await p.fill('#pw', 'Secret123'); await p.check('#ok'); await p.click('#f button');
  await p.locator('#cd').waitFor(); await p.fill('#cd', await code()); await p.click('#f button'); await p.getByText('נתחיל: גיל ומין').waitFor();
  // עד שאלה 11
  await p.click('[data-opts="sex"] [data-v="male"]'); await p.fill('#age', '36'); await p.click('#next');
  await p.fill('#h', '186'); await p.fill('#w', '120'); await p.click('#next');
  await p.click('[data-opts="goal"] [data-v="lose"]'); await p.click('#next'); await p.click('#next');
  await p.click('[data-opts="job"] [data-v="sitting"]'); await p.click('#next');
  for (let k = 0; k < 4; k++) await p.click('#next');
  await p.click('[data-opts="prep"] [data-v="15"]'); await p.click('#next');
  await p.getByText('מה אתה אוהב לאכול?').waitFor();
  assert.match(await p.locator('.ob .muted.small').first().innerText(), /שאלה 11 מתוך 17/);

  // "חמ" כבר מהאות הראשונה
  await typeQ('ח'); assert.ok((await sugg()).length > 0, 'יש הצעות כבר מהאות הראשונה');
  await typeQ('חמ'); let s = await sugg(); console.log('חמ →', s.join(' | '));
  assert.equal(s[0], 'חמאה');
  await shot('k01-ham');
  await p.locator('#likesug [data-pick="חמאה"]').click();
  assert.deepEqual(await tags(), ['חמאה']); assert.equal(await p.locator('#likesx').inputValue(), '');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'likesx', 'השדה נשאר בפוקוס — המקלדת פתוחה למאכל הבא');
  ok('"חמ" → "חמאה" ראשונה; לחיצה אחת מוסיפה תגית, השדה מתנקה ונשאר מוכן להקלדה');

  // "ע" → עוף + עגבנייה; עוף הוא כפתור קיים
  await typeQ('ע'); s = await sugg(); console.log('ע →', s.join(' | '));
  assert.ok(s.includes('עוף') && s.includes('עגבנייה'));
  await p.locator('#likesug [data-pick="עגבנייה"]').click();
  await typeQ('עגבניה'); s = await sugg(); assert.deepEqual(s, ['עגבנייה כבר נבחר']);
  ok('"ע" מציע "עוף" ו"עגבנייה"; הכתיב "עגבניה" מוצא את "עגבנייה" ומסמן "כבר נבחר"');
  await typeQ('עו'); await p.locator('#likesug [data-pick="עוף"]').click();
  assert.equal(await p.locator('[data-chips="likes"] [data-v="עוף"]').getAttribute('class'), 'chip on', 'הכפתור הקיים סומן בירוק');
  assert.deepEqual(await tags(), ['חמאה', 'עגבנייה'], 'לא נוצרה תגית כפולה לעוף');
  await typeQ('עו'); assert.match((await sugg())[0], /^עוף כבר נבחר$/);
  ok('בחירה במאכל שיש לו כפתור מסמנת את הכפתור הקיים (בלי כפילות), וברשימה הוא "כבר נבחר"');

  // מאכל שלא במאגר + פסיקים
  await typeQ('קובה של סבתא'); s = await sugg(); assert.equal(s.at(-1), 'הוסף את ‘קובה של סבתא’ כמאכל אישי');
  await p.locator('#likesug .ac-opt.add').click();
  await p.locator('#likesx').pressSequentially('מג׳דרה, פלאפל,', { delay: 20 });
  assert.deepEqual(await tags(), ['חמאה', 'עגבנייה', 'קובה של סבתא', 'מג׳דרה', 'פלאפל']);
  await shot('k02-tags');
  ok('מאכל שחסר במאגר: "הוסף את ‘…’ כמאכל אישי"; הזנה בפסיקים עדיין עובדת');

  // הסרה בנפרד
  await p.locator('#liketags [data-tag="פלאפל"]').click(); await p.locator('#liketags [data-tag="מג׳דרה"]').click(); await p.locator('#liketags [data-tag="קובה של סבתא"]').click();
  assert.deepEqual(await tags(), ['חמאה', 'עגבנייה']);
  await p.locator('#liketags [data-tag="חמאה"]').click(); assert.deepEqual(await tags(), ['עגבנייה']);
  await typeQ('חמ'); await p.locator('#likesug [data-pick="חמאה"]').click(); assert.deepEqual(await tags(), ['עגבנייה', 'חמאה']);
  ok('כל מאכל נבחר מוסר בנפרד בלחיצה (ואפשר לבחור אותו שוב)');

  // הרשימה גלויה מעל המקלדת: גובה המסך בפועל עם מקלדת פתוחה ≈ 55%
  await typeQ('ב'); await p.waitForTimeout(800); const box = await p.locator('#likesug').boundingBox(); const inpBox = await p.locator('#likesx').boundingBox();
  const vh = p.viewportSize().height;
  console.log('input top', Math.round(inpBox.y), 'list bottom of first 3 options', Math.round(box.y + 3 * 49), 'viewport', vh);
  assert.ok(inpBox.y < vh * 0.25, 'השדה נגלל לראש המסך');
  assert.ok(box.y + 3 * 49 < vh * 0.55, 'לפחות 3 הצעות נראות מעל המקלדת');
  await shot('k03-keyboard-area');
  ok('בפוקוס השדה עולה לראש המסך, וההצעות נראות מעל אזור המקלדת');

  // שמירה במעבר בין שלבים
  await p.locator('#likesx').fill(''); await p.click('#next');
  await p.waitForFunction(() => document.querySelector('.q')?.textContent !== 'מה אתה אוהב לאכול?');
  console.log('שאלה 12:', await p.locator('.q').innerText());
  await p.click('#back');
  await p.getByText('מה אתה אוהב לאכול?').waitFor();
  assert.deepEqual(await tags(), ['עגבנייה', 'חמאה']); assert.equal(await p.locator('[data-chips="likes"] [data-v="עוף"]').getAttribute('class'), 'chip on');
  await p.waitForTimeout(500); await p.reload(); await p.getByText('מה אתה אוהב לאכול?').waitFor();
  assert.deepEqual(await tags(), ['עגבנייה', 'חמאה']);
  const prof = await p.evaluate(async () => (await (await fetch('/api/state')).json()).profile);
  assert.ok(['עוף', 'עגבנייה', 'חמאה'].every(x => prof.likes.includes(x)), 'נשמר גם בשרת');
  await shot('k04-back');
  ok(`הבחירות נשמרות ב"המשך" ← "חזרה", אחרי רענון ובשרת (${prof.likes.join(', ')})`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { await shot('k99-fail').catch(() => {}); console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
