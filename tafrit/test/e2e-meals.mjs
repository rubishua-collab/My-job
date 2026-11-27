// "מספר ארוחות ביום" במסך היום — דרך הכפתורים, בהדמיית iPhone 13.
// 3 → 5 כרטיסים לפי סדר היום; יום שלם ממלא את חמשתם בתוך היעד; נשמר אחרי פתיחה מחדש ולימים הבאים;
// הקטנה מסירה קודם כרטיס ריק, ועם אוכל — שואלת לאן להעביר.  הרצה: node test/e2e-meals.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ROBI } from './week-sim.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8907, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-meals-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-meals-'));
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


const click = async l => { await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); };
const cards = p => p.locator('[data-meal]').evaluateAll(xs => xs.map(x => x.dataset.meal));
const titles = p => p.locator('[data-meal] h3, [data-meal] .mh b').allInnerTexts();
const count = async p => +(await p.locator('#mealcount .num').innerText());
const openToday = async (p, d = T) => { await p.goto(BASE + (d === T ? '/#/today' : '/#/today/' + d)); await p.locator('#mealcount').waitFor(); };

try {
  const tok = await user('meals@test.local', { ...ROBI, meals: 3 }, 118);
  const p = await page(tok);
  await openToday(p);
  assert.equal(await count(p), 3); assert.deepEqual(await cards(p), ['breakfast', 'lunch', 'dinner']);
  await shot(p, 'm01-three');
  // ---- 3 → 5 ----
  await click(p.locator('[data-mc="1"]')); await p.waitForFunction(() => document.querySelectorAll('[data-meal]').length === 4);
  await click(p.locator('[data-mc="1"]')); await p.waitForFunction(() => document.querySelectorAll('[data-meal]').length === 5);
  assert.equal(await count(p), 5);
  assert.deepEqual(await cards(p), ['breakfast', 'snack1', 'lunch', 'snack', 'dinner']);
  const txt = await p.locator('[data-meal]').allInnerTexts();
  const labels = txt.map(t => t.split('\n')[0].trim());
  console.log('   כרטיסים:', labels.join(' | '));
  for (const id of ['breakfast', 'snack1', 'lunch', 'snack', 'dinner']) {
    const c = p.locator(`[data-meal="${id}"]`);
    assert.equal(await c.locator('[data-mact="add"]').count(), 1); assert.equal(await c.locator('[data-mact="suggest"]').count(), 1); assert.equal(await c.locator('[data-lock]').count(), 1);
  }
  await shot(p, 'm02-five');
  ok(`3 → 5 בלחיצות על +: ${labels.join(', ')}; בכל כרטיס הוסף, הצע ונעילה`);

  // ---- הצע לכרטיס ביניים בוקר ונעילה ----
  await click(p.locator('[data-meal="snack1"] [data-mact="suggest"]')); await p.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  assert.match(await p.locator('.sheet-wrap h2').last().innerText(), /ביניים בוקר/);
  assert.ok(await p.locator('.sheet-wrap .sugg').count() >= 1);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await click(p.locator('[data-meal="snack1"] [data-lock]')); await p.waitForTimeout(500);
  let st1 = await st(p); assert.ok((st1.days?.[T]?.locked || []).includes('snack1'), 'נעילת ביניים בוקר');
  await click(p.locator('[data-meal="snack1"] [data-lock]')); await p.waitForTimeout(500);
  ok('"הצע" בכרטיס ביניים בוקר פותח הצעות לביניים בוקר; נעילה עובדת');

  // ---- בנה לי יום שלם ממלא 5 ארוחות בתוך היעד ----
  await click(p.locator('[data-act="day"]')); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  const h3 = await p.locator('.sheet-wrap h3').allInnerTexts();
  assert.equal(h3.length, 5, h3.join(','));
  await click(p.locator('.sheet-wrap [data-all]')); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 20000 });
  let es = (await st(p)).entries.filter(e => e.date === T);
  const meals = [...new Set(es.map(e => e.meal))];
  assert.deepEqual(SORT(meals), SORT(['breakfast', 'snack1', 'lunch', 'snack', 'dinner']));
  const day = await p.evaluate(async d => (await fetch('/api/day/' + d, { headers: { Authorization: 'Bearer ' + localStorage.getItem('tafrit-token') } })).json(), T);
  const tgt = day.target; const per = {};
  for (const e of es) { per[e.meal] = (per[e.meal] || 0) + e.snapshot.k * e.grams / 100; }
  const tot = { k: 0, c: 0, f: 0 }; for (const e of es) { tot.k += e.snapshot.k * e.grams / 100; tot.c += (e.snapshot.c || 0) * e.grams / 100; tot.f += (e.snapshot.f || 0) * e.grams / 100; }
  assert.ok(Math.abs(day.planned.kcal - tgt.kcal) <= tgt.kcal * 0.1, `קלוריות ${day.planned.kcal} מול ${tgt.kcal}`);
  assert.ok(day.planned.protein >= tgt.protein * 0.85, `חלבון ${day.planned.protein} מול ${tgt.protein}`);
  assert.ok(per.snack1 < per.lunch && per.snack < per.dinner, 'ארוחות ביניים קטנות מהעיקריות');
  await shot(p, 'm03-five-built');
  ok(`יום שלם ל-5 ארוחות: ${Object.entries(per).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')} קק״ל · סה״כ ${day.planned.kcal}/${tgt.kcal} קק״ל, ${day.planned.protein}/${tgt.protein} ג׳ חלבון, פחמימות ${Math.round(tot.c)}/${tgt.carbs ?? '—'}, שומן ${Math.round(tot.f)}/${tgt.fat ?? '—'}`);

  // ---- הצע לי את הארוחה הבאה — בתוך 5 הארוחות ----
  await click(p.locator('[data-act="next"]')); await p.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  const nh = await p.locator('.sheet-wrap h2').last().innerText();
  assert.ok(/ארוחת בוקר|ביניים בוקר|ארוחת צהריים|ביניים אחה״צ|ארוחת ערב/.test(nh), nh);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  ok(`"הצע לי את הארוחה הבאה": ${nh}`);

  // ---- נשמר אחרי סגירה ופתיחה מחדש, ובימים הבאים ----
  const p2 = await page(tok);
  await openToday(p2); assert.equal(await count(p2), 5);
  await openToday(p2, addDays(T, 1)); assert.equal(await count(p2), 5); assert.deepEqual(await cards(p2), ['breakfast', 'snack1', 'lunch', 'snack', 'dinner']);
  const prof = (await st(p2)).profile; assert.deepEqual(prof.mealIds, ['breakfast', 'snack1', 'lunch', 'snack', 'dinner']);
  ok('אחרי פתיחה מחדש: 5 ארוחות היום ומחר (נשמר בפרופיל)');

  // ---- הקטנה ביום ריק: כרטיס ריק מוסר בלי שאלה ----
  await click(p2.locator('[data-mc="-1"]')); await p2.waitForFunction(() => document.querySelectorAll('[data-meal]').length === 4);
  assert.equal(await p2.locator('.sheet-wrap').count(), 0, 'בלי שאלה');
  assert.deepEqual(await cards(p2), ['breakfast', 'lunch', 'snack', 'dinner']);
  ok('מחר (ריק): − מסיר את ביניים בוקר מיד');

  // ---- הקטנה ביום מלא: שואל לאן להעביר ----
  await openToday(p2); // היום — 5 כרטיסים כי יש בהם אוכל
  assert.equal(await count(p2), 5, 'ארוחה עם אוכל נשארת מוצגת');
  const snack1Items = (await st(p2)).entries.filter(e => e.date === T && e.meal === 'snack1').map(e => e.id).sort();
  // מסמנים את הבוקר "אכלתי" ונועלים את הצהריים — הם חייבים להישמר
  const bf = (await st(p2)).entries.filter(e => e.date === T && e.meal === 'breakfast');
  for (const x of bf) await api('PUT', '/api/entries/' + x.id, { status: 'eaten' }, tok);
  await api('PUT', '/api/days/' + T, { locked: ['lunch'] }, tok);
  await openToday(p2);
  await click(p2.locator('[data-mc="-1"]')); await p2.locator('.sheet-wrap h2', { hasText: 'להסיר את' }).waitFor();
  const q = await p2.locator('.sheet-wrap').last().innerText();
  assert.match(q, /ביניים בוקר/); assert.match(q, /לאיזו ארוחה להעביר/);
  await shot(p2, 'm04-move');
  await click(p2.locator('.sheet-wrap [data-to="snack"]')); await p2.waitForFunction(() => document.querySelectorAll('[data-meal]').length === 4, null, { timeout: 10000 });
  es = (await st(p2)).entries.filter(e => e.date === T);
  assert.deepEqual(es.filter(e => snack1Items.includes(e.id)).map(e => e.meal), snack1Items.map(() => 'snack'), 'הפריטים עברו לביניים אחה״צ');
  assert.ok(bf.every(x => es.find(e => e.id === x.id)?.status === 'eaten'), 'הבוקר שנאכל נשמר');
  assert.ok(((await st(p2)).days[T].locked || []).includes('lunch'), 'הצהריים נשארו נעולים');
  ok(`היום (מלא): − שאל לאן להעביר את ${snack1Items.length} פריטי ביניים בוקר → הועברו לביניים אחה״צ; בוקר שנאכל וצהריים נעולים נשמרו`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
function SORT(a) { return [...a].sort(); }
