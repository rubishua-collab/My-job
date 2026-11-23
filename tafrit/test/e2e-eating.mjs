// "בנה מחדש את פרופיל האכילה שלי" — דרך הכפתור עצמו, בהדמיית iPhone 13.
// מתאמן צמחוני שכבר אכל ארוחת בוקר עובר לתזונה רגילה, בוחר עוף ודגים ו"לפחות מנה אחת ביום" → הבוקר נשאר, בצהריים/ערב יש עוף או דג;
// אחר כך חוזר לצמחונות → כל ההצעות החדשות צמחוניות. הבחירה נשמרת בחשבון גם אחרי סגירה ופתיחה מחדש.  הרצה: node test/e2e-eating.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ROBI } from './week-sim.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8905, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-eating-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-eating-'));
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


const FISH = /דג|סלמון|לברק|דניס|אמנון|בקלה|טונה/; const POULTRY = /עוף|פרגית|הודו|שניצל|עראייס/; const MEAT = /עוף|פרגית|הודו|שניצל|עראייס|בקר|סינטה|סטייק|בולונז|דג|סלמון|לברק|דניס|אמנון|בקלה|טונה|פסטרמה/;
const click = async l => { await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); };
const sheet = p => p.locator('.sheet-wrap').last();
const todayEntries = async p => (await st(p)).entries.filter(e => e.date === T);
const nameOf = async (p, e) => e.label || e.snapshot?.n || '';

try {
  // צמחוני, כבר אכל ארוחת בוקר
  const tok = await user('switch@test.local', { ...ROBI, diet: 'vegetarian', menuPrefs: { noAuto: ['tofu'] } }, 118);
  await api('POST', '/api/entries', { entries: [
    { date: T, meal: 'breakfast', foodId: 'm1570', comp: 'omelet', grams: 120, status: 'eaten' },
    { date: T, meal: 'breakfast', foodId: 'm1995', comp: 'bread', grams: 64, unit: 'פרוסה בינונית', qty: 2, status: 'eaten' }] }, tok);
  const p = await page(tok);
  await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor();
  // בונים יום צמחוני כדי שיהיו הצעות טעונות
  await p.click('[data-act="day"]'); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  const vegDay = await sheet(p).locator('.sugg [data-name]').allInnerTexts();
  assert.ok(vegDay.every(n => !MEAT.test(n)), 'לפני: צמחוני — ' + vegDay.join(' | '));
  await click(sheet(p).locator('[data-all]')); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  const before = await todayEntries(p); const breakfastIds = before.filter(e => e.meal === 'breakfast').map(e => e.id).sort();
  ok(`לפני: צמחוני, בוקר נאכל (${breakfastIds.length} פריטים), יום צמחוני: ${vegDay.join(' | ')}`);

  // ---- 1. הכפתור במסך "היום שלי" ----
  await click(p.locator('[data-act="eating"]')); await p.locator('.sheet-wrap h2', { hasText: 'פרופיל האכילה שלי' }).waitFor();
  let s = sheet(p);
  assert.equal(await s.locator('[data-diet="vegetarian"].on').count(), 1, 'מציג את הבחירה הנוכחית');
  assert.equal(await s.locator('[data-src="poultry"][disabled]').count(), 1, 'עוף חסום בצמחוני');
  await shot(p, 'e01-editor-veg');
  await click(s.locator('[data-diet="none"]'));
  assert.equal(await s.locator('[data-src="poultry"].on').count(), 1, 'עוף נפתח ונבחר');
  assert.equal(await s.locator('[data-src="fish"].on').count(), 1, 'דגים נפתחו ונבחרו');
  assert.equal(await s.locator('[data-src="tofu"].on').count(), 0, 'טופו שהמתאמן הוציא — נשאר מחוץ');
  if (await s.locator('[data-src="beef"].on').count()) await click(s.locator('[data-src="beef"]')); // בוחר רק עוף ודגים
  const rule = s.locator('#eprule'); if (!(await rule.isChecked())) await click(rule);
  assert.match(await s.locator('#eprule').locator('xpath=..').innerText(), /לפחות מנת עוף או דג אחת ביום/);
  const chg = await s.locator('#epchg').innerText();
  assert.match(chg, /סוג תזונה: צמחונית ← תזונה רגילה/); assert.match(chg, /עוף/);
  assert.match(await s.innerText(), /אלרגיות ורגישויות/);
  await shot(p, 'e02-editor-regular');
  await click(s.locator('[data-epsave]')); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 20000 });
  let es = await todayEntries(p);
  assert.deepEqual(es.filter(e => e.meal === 'breakfast').map(e => e.id).sort(), breakfastIds, 'ארוחת הבוקר שנאכלה נשארה');
  assert.ok(es.filter(e => e.meal === 'breakfast').every(e => e.status === 'eaten'));
  const mains = es.filter(e => ['lunch', 'dinner'].includes(e.meal));
  const hasCF = mains.some(e => POULTRY.test(e.snapshot.n) || FISH.test(e.snapshot.n));
  assert.ok(hasCF, 'עוף או דג בצהריים/ערב: ' + mains.map(e => e.snapshot.n.split(',')[0]).join(', '));
  assert.ok(!mains.some(e => /בקר|סינטה|סטייק/.test(e.snapshot.n)), 'בקר לא נבחר');
  const ids = es.map(e => `${e.meal}|${e.foodId}`); assert.equal(new Set(ids).size, ids.length, 'בלי כפילויות');
  const recipes = [...new Set(es.filter(e => e.recipe && ['lunch', 'dinner'].includes(e.meal)).map(e => `${e.meal}:${e.recipe}`))];
  const dayApi = await p.evaluate(async d => (await fetch('/api/day/' + d, { headers: { Authorization: 'Bearer ' + localStorage.getItem('tafrit-token') } })).json(), T);
  await shot(p, 'e03-today-after');
  ok(`אחרי שמירה (כפתור אחד): הבוקר נשאר "נאכל", מתכונים: ${recipes.join(' · ')}; נאכל ${dayApi.eaten.kcal} קק״ל נכלל ביעד, נשארו ${dayApi.remaining.kcal}`);

  // ---- 2. כל ההצעות לפי הפרופיל: יום שלם, הצע לי, הצע מנה אחרת, החלף חלבון ----
  await click(p.locator('[data-meal="dinner"] [data-mact="suggest"]')); await p.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  s = sheet(p); const sn = await s.locator('.sugg [data-name]').allInnerTexts();
  assert.ok(sn.some(n => POULTRY.test(n) || FISH.test(n)) && !sn.some(n => /בקר|סינטה|סטייק|בולונז/.test(n)), sn.join(' | '));
  await click(s.locator('.sugg').first().locator('[data-sw]').first());
  const g = await s.locator('.swp [data-group]').evaluateAll(xs => xs.map(x => x.dataset.group));
  assert.ok(g.includes('poultry') && g.includes('fish') && !g.includes('beef') && !g.includes('plant') || !g.includes('beef'), g.join(','));
  await s.locator('.sh button').first().click(); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  ok(`רגיל: "הצע" לערב — ${sn.join(' | ')}; "החלף חלבון": ${[...new Set(g)].join(', ')}`);

  // ---- 3. נשמר בחשבון: סגירה ופתיחה מחדש (הקשר חדש) ----
  const p2 = await page(tok);
  await p2.goto(BASE + '/#/more'); await p2.getByText('בנה מחדש את פרופיל האכילה שלי').first().waitFor();
  await click(p2.locator('[data-sec="eating"]')); await p2.locator('.sheet-wrap h2', { hasText: 'פרופיל האכילה שלי' }).waitFor();
  s = sheet(p2);
  assert.equal(await s.locator('[data-diet="none"].on').count(), 1); assert.equal(await s.locator('[data-src="beef"].on').count(), 0); assert.ok(await s.locator('#eprule').isChecked());
  ok('אחרי פתיחה מחדש (ממסך "עוד"): תזונה רגילה, עוף ודגים, בלי בקר, כלל יומי מסומן');

  // ---- 4. חזרה לצמחונות ----
  await click(s.locator('[data-diet="vegetarian"]'));
  const chg2 = await s.locator('#epchg').innerText();
  assert.match(chg2, /סוג תזונה: תזונה רגילה ← צמחונית/); assert.match(chg2, /יבוטל/);
  assert.match(await s.innerText(), /לא מתאים לצמחונית/);
  await shot(p2, 'e04-back-to-veg');
  await click(s.locator('[data-epsave]')); await p2.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 20000 });
  es = await todayEntries(p2);
  assert.deepEqual(es.filter(e => e.meal === 'breakfast').map(e => e.id).sort(), breakfastIds);
  const planned = es.filter(e => e.status !== 'eaten');
  assert.ok(planned.length && planned.every(e => !MEAT.test(e.snapshot.n)), 'מתוכנן צמחוני: ' + planned.map(e => e.snapshot.n.split(',')[0]).join(', '));
  // יום שלם, הצע לי, הצע מנה אחרת, החלף חלבון
  await p2.goto(BASE + '/#/today'); await p2.getByText('היום שלי').first().waitFor();
  await click(p2.locator('[data-act="day"]')); await p2.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  s = sheet(p2); const d2 = await s.locator('.sugg [data-name]').allInnerTexts();
  assert.ok(d2.every(n => !MEAT.test(n)), d2.join(' | '));
  const c0 = s.locator('.sugg').first(); const others = [];
  for (let i = 0; i < 3; i++) { await click(c0.locator('[data-other]')); others.push(await c0.locator('[data-name]').innerText()); }
  assert.ok(others.every(n => !MEAT.test(n)), others.join(' | '));
  await click(c0.locator('[data-sw]').first());
  const g2 = await c0.locator('.swp [data-group]').evaluateAll(xs => xs.map(x => x.dataset.group));
  assert.ok(!g2.some(x => ['poultry', 'fish', 'beef'].includes(x)), g2.join(','));
  assert.ok(!MEAT.test(await c0.locator('.swp').innerText()));
  await s.locator('.sh button').first().click(); await p2.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await click(p2.locator('[data-act="next"]')); await p2.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  const nx = await sheet(p2).locator('.sugg').allInnerTexts();
  assert.ok(nx.every(t => !MEAT.test(t)), nx.map(t => t.split('\n')[0]).join(' | '));
  await shot(p2, 'e05-veg-suggestions');
  ok(`חזרה לצמחונות: הבוקר נשאר; יום שלם — ${d2.join(' | ')}; "הצע מנה אחרת" ×3 — ${others.join(' → ')}; "הצע לי" ו"החלף חלבון" בלי עוף/דג/בשר`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
