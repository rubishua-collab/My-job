// מחולל התפריטים ואוכל בחוץ — דרך המסכים, בהדמיית iPhone 13.
// "בנה לי יום שלם" לפרופיל אוכל-כול ולפרופיל צמחוני, ואז החלפת ארוחת הצהריים בשווארמה בפיתה עם טחינה.
// הרצה: node test/e2e-planner.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { OMNI, VEG } from './week-sim.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8901, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-planner-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-planner-'));
const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: path.join(HERE, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), MAIL_DEV: '1', NODE_ENV: 'test', DATA_ENCRYPTION_KEY: 'e'.repeat(64) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const api = async (method, url, body, tok) => { const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(url + ' ' + j.error); return j; };
const code = async e => (await (await fetch(BASE + '/api/dev/outbox')).json()).filter(m => m.to === e).at(-1).code;
async function user(email, profile, kg) {
  await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Secret123', acceptPrivacy: true }) });
  const v = await (await fetch(BASE + '/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: await code(email), kind: 'bearer' }) })).json();
  await api('PUT', '/api/profile', { profile: { ...profile, onboarding: { done: true } } }, v.token);
  for (let i = 3; i >= 0; i--) await api('PUT', '/api/weights/' + addDays(T, -i), { kg }, v.token);
  await api('POST', '/api/plans', { kind: 'initial', goal: profile.goal, settings: { rate: profile.rate, meals: profile.meals, likes: profile.likes, diet: profile.diet, prepMinutes: profile.prepMinutes }, startDate: addDays(T, -3), reason: 'חישוב ראשוני' }, v.token);
  return v.token;
}
const b = await chromium.launch();
const errs = [];
async function page(tok) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await ctx.addInitScript(t => { localStorage.setItem('tafrit-token', t); window.Capacitor = { isNativePlatform: () => true }; }, tok);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return p;
}
const shot = async (p, n) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
const noSheet = p => p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
const st = p => p.evaluate(async () => { const r = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('tafrit-token') } }); return r.json(); });
const FAM = { m1561: 'egg', m1564: 'egg', m805: 'chicken', m880: 'pargit', u172849: 'turkey', m1478: 'beef', m609: 'beef', m815: 'chicken', m1009: 'turkeyDeli' };

try {
  // ---- אוכל-כול ----
  const tok = await user('omni@test.local', OMNI, 118);
  const p = await page(tok);
  await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor();
  await p.click('[data-act="day"]'); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  const sheet = await p.locator('.sheet-wrap').last().innerText();
  console.log(sheet.split('\n').filter(l => l.trim()).slice(0, 40).join(' / '));
  assert.match(sheet, /מספק \d+ ג׳ חלבון למנה/); assert.match(sheet, /על מה מבוססת הבחירה/);
  await shot(p, 'p01-day-sheet');
  await p.click('[data-all]'); await noSheet(p);
  let s = await st(p); let es = s.entries.filter(e => e.date === T);
  const eggMeals = new Set(es.filter(e => FAM[e.foodId] === 'egg').map(e => e.meal)).size;
  const lunch = es.filter(e => e.meal === 'lunch');
  assert.ok(eggMeals <= 1, `ארוחות עם ביצים: ${eggMeals}`);
  assert.ok(lunch.some(e => ['chicken', 'pargit', 'turkey', 'beef'].includes(FAM[e.foodId])), 'מנה בשרית בצהריים: ' + lunch.map(e => e.snapshot.n).join(', '));
  await shot(p, 'p02-today-built');
  ok(`אוכל-כול: יום שלם — ${eggMeals} ארוחת ביצים, צהריים: ${lunch.map(e => e.snapshot.n.split(',')[0]).join(' + ')}; בכרטיס: "מספק X ג׳ חלבון למנה" ומקורות`);

  // ---- החלפת הצהריים בשווארמה בפיתה עם טחינה ----
  const before = await p.evaluate(() => [...document.querySelectorAll('.card.sum .meter')].slice(0, 2).map(x => x.innerText.replace(/\s+/g, ' ')));
  const lunchPlanned = s.entries.filter(e => e.date === T && e.meal === 'lunch');
  await p.locator('[data-meal="lunch"] [data-mact="add"]').click();
  await p.fill('#fpq', 'שווארמה'); await p.locator('[data-dish="shawarma"]').click();
  await p.getByText('הערכה').first().waitFor();
  await p.locator('[data-g="bread"][data-c="pita"]').click();
  const extrasOn = await p.locator('[data-g="extras"].on').evaluateAll(xs => xs.map(x => x.dataset.c));
  for (const x of extrasOn) if (x !== 'tahini') await p.locator(`[data-g="extras"][data-c="${x}"]`).click();
  if (!extrasOn.includes('tahini')) await p.locator('[data-g="extras"][data-c="tahini"]').click();
  const totTxt = await p.locator('#eotot').innerText(); const dishK = +totTxt.match(/([\d,]+)\s*קק״ל/)[1].replace(',', '');
  assert.equal(await p.locator('#eorep').isChecked(), true, 'ברירת מחדל: להחליף את מה שתוכנן');
  await shot(p, 'p03-shawarma');
  await p.locator('.sheet-wrap').last().locator('[data-eoadd="planned"]').click(); await noSheet(p);
  s = await st(p); es = s.entries.filter(e => e.date === T && e.meal === 'lunch');
  assert.ok(lunchPlanned.every(o => !es.some(e => e.id === o.id)), 'הארוחה הקודמת הוסרה');
  assert.deepEqual(es.map(e => e.label).sort(), ['שווארמה: טחינה', 'שווארמה: פיתה', 'שווארמה: שווארמה הודו (בשר)'].sort());
  const day = await p.evaluate(async d => (await fetch('/api/day/' + d, { headers: { Authorization: 'Bearer ' + localStorage.getItem('tafrit-token') } })).json(), T);
  const sumAll = s.entries.filter(e => e.date === T).reduce((a, e) => a + e.snapshot.k * e.grams / 100, 0);
  assert.ok(Math.abs(day.planned.kcal - Math.round(sumAll)) <= 1, 'הסיכום היומי = סכום הפריטים, כל אחד פעם אחת');
  const lunchK = es.reduce((a, e) => a + e.snapshot.k * e.grams / 100, 0);
  assert.ok(Math.abs(lunchK - dishK) <= 2, `הצהריים ביומן = ערך המנה (${Math.round(lunchK)} / ${dishK})`);
  const after = await p.evaluate(() => [...document.querySelectorAll('.card.sum .meter')].slice(0, 2).map(x => x.innerText.replace(/\s+/g, ' ')));
  await shot(p, 'p04-today-after-swap');
  ok(`החלפה: צהריים = שווארמה בפיתה עם טחינה (${dishK} קק״ל, 3 רכיבים), הארוחה הקודמת הוסרה, הסיכום היומי עודכן פעם אחת (מתוכנן ${day.planned.kcal} קק״ל)`);
  console.log('   לפני:', before.join(' | '), '\n   אחרי:', after.join(' | '));

  // ---- צמחוני ----
  const tok2 = await user('veg@test.local', VEG, 72);
  const p2 = await page(tok2);
  await p2.goto(BASE + '/#/today'); await p2.getByText('היום שלי').first().waitFor();
  await p2.click('[data-act="day"]'); await p2.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor(); await p2.click('[data-all]'); await noSheet(p2);
  const es2 = (await st(p2)).entries.filter(e => e.date === T);
  const meat = es2.filter(e => /עוף|בקר|הודו|דג|טונה|סלמון|אמנון|שניצל/.test(e.snapshot.n));
  assert.deepEqual(meat.map(e => e.snapshot.n), [], 'אין בשר ודגים בפרופיל צמחוני');
  assert.ok(new Set(es2.filter(e => FAM[e.foodId] === 'egg').map(e => e.meal)).size <= 1);
  await shot(p2, 'p05-veg-day');
  ok(`צמחוני: ${[...new Set(es2.map(e => e.meal))].length} ארוחות בלי בשר ודגים, ביצים לכל היותר פעם אחת`);

  // ---- אוכל בחוץ: רשת + פיצה לפי משולשים ----
  await p.locator('[data-meal="dinner"] [data-mact="add"]').click(); await p.click('#fptabs [data-t="out"]');
  await p.locator('[data-dish="pizza"]').click(); await p.locator('[data-g="size"][data-c="L"]').click();
  const plus = p.locator('[data-cnt="slices"][data-d="1"]'); await plus.evaluate(e => e.scrollIntoView({ block: 'center' })); await plus.click();
  assert.match(await p.locator('.sheet-wrap').last().innerText(), /3 משולשים/);
  const pz = +(await p.locator('#eotot').innerText()).match(/([\d,]+)\s*קק״ל/)[1].replace(',', '');
  assert.equal(pz, Math.round(3 * 115 * 2.66));
  while (await p.locator('.sheet-wrap').count()) { await p.locator('.sheet-wrap').last().locator('.sh button').first().click(); await p.waitForTimeout(250); }
  await p.locator('[data-meal="dinner"] [data-mact="add"]').click(); await p.fill('#fpq', 'ביג מק'); await p.locator('[data-dish="mcd_bigmac"]').click();
  for (const sel of ['[data-g="meal"][data-c="ff17"]', '[data-g="drink"][data-c="ff27"]']) { const l = p.locator(sel); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); }
  assert.match(await p.locator('#eotot').innerText(), /1,?070/);
  assert.match(await p.locator('.sheet-wrap').last().innerText(), /ערכים רשמיים שפרסמה מקדונלד׳ס בארה״ב/);
  await shot(p, 'p06-bigmac-meal');
  ok(`פיצה משפחתית 3 משולשים = ${pz} קק״ל (הערכה); ארוחת ביג מק בינונית עם קולה = 1,070 קק״ל (ערכי הרשת) — רשמי מול הערכה מסומן`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
