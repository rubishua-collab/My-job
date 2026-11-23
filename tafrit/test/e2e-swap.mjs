// החלפת רכיב בארוחה מוצעת — דרך המסכים, בהדמיית iPhone 13.
// יום שלם לפרופיל שאוכל עוף ודגים: מנת עוף ומנת דג; בצהריים מחליפים רק את האורז בבטטה ורואים מיד כמות וערכים;
// אותה החלפה מתוך "הצע לי"; וארוחה עיקרית אחת — בחירה בין עוף לדג.  הרצה: node test/e2e-swap.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { OMNI, VEG } from './week-sim.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8903, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-swap-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-swap-'));
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


const FISH = /סלמון|אמנון|דניס|לברק|בקלה|טונה|דג/; const POULTRY = /עוף|פרגית|הודו|שניצל/;
const PROF = { ...OMNI, likes: [...OMNI.likes, 'דגים', 'סלמון'] };
const num = t => +String(t).match(/([\d,]+)/)[1].replace(',', '');
async function swapRiceToSweetPotato(p, card, label) {
  const sw = card.locator('[data-sw]');
  const roles = await card.locator('.si').evaluateAll(xs => xs.map(x => x.innerText));
  let ri = roles.findIndex(t => /אורז/.test(t));
  const carbBtn = () => card.locator('.si').nth(ri).locator('[data-sw]');
  if (ri < 0) { // אין אורז בצהריים — קודם מחליפים לאורז, ואז לבטטה
    ri = roles.findIndex((t, i) => true && /פחמימה/.test(t)) ;
    const idx = await card.locator('.si').evaluateAll(xs => xs.findIndex(x => /החלף פחמימה/.test(x.innerText)));
    ri = idx; await carbBtn().click(); await card.locator('[data-pick$="|rice"]').click();
  }
  const kBefore = num(await card.locator('.tot').innerText());
  const otherBefore = (await card.locator('.si').evaluateAll(xs => xs.map(x => x.innerText))).filter((_, i) => i !== ri);
  const b = carbBtn(); await b.evaluate(e => e.scrollIntoView({ block: 'center' })); await b.click();
  const opts = await card.locator('.swp [data-pick]').count();
  assert.ok(opts >= 5, `לפחות 5 אפשרויות מיד (${opts})`);
  const panelTxt = await card.locator('.swp').innerText();
  assert.match(panelTxt, /גרם|כוס|יחיד/); assert.match(panelTxt, /קק״ל · ח [\d.]+ · פ [\d.]+ · ש [\d.]+/); assert.match(panelTxt, /מבושל|אפוי|נא|יבש/);
  assert.match(panelTxt, /הצג עוד/);
  let pick = card.locator('[data-pick$="|sweetPotato"]');
  if (!await pick.count()) { await card.locator('[data-more]').click(); pick = card.locator('[data-pick$="|sweetPotato"]'); }
  const spTxt = await pick.innerText();
  await pick.click();
  const row = await card.locator('.si').nth(ri).innerText();
  assert.match(row, /בטטה/); assert.ok(row.includes(spTxt.split('\n')[1].split(' · ')[0]), 'הכמות שהוצגה בתחליף היא הכמות בכרטיס');
  const otherAfter = (await card.locator('.si').evaluateAll(xs => xs.map(x => x.innerText))).filter((_, i) => i !== ri);
  assert.deepEqual(otherAfter, otherBefore, 'שאר הרכיבים נשארו');
  assert.match(await card.locator('[data-name]').innerText(), /בטטה/);
  const kAfter = num(await card.locator('.tot').innerText());
  console.log(`   ${label}: ${spTxt.replace(/\n/g, ' · ')} | סיכום ארוחה ${kBefore} → ${kAfter} קק״ל`);
  return { kBefore, kAfter, ri };
}

try {
  const tok = await user('fish@test.local', PROF, 118);
  const p = await page(tok);
  await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor();
  await p.click('[data-act="day"]'); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  const sh = p.locator('.sheet-wrap').last();
  const names = await sh.locator('.sugg [data-name]').allInnerTexts();
  console.log('   יום שלם:', names.join(' | '));
  const lunchCard = sh.locator('.sugg').filter({ has: p.locator('[data-name]') }).nth(await sh.locator('h3').evaluateAll(hs => hs.findIndex(h => h.innerText.includes('צהריים'))));
  const lunchName = await lunchCard.locator('[data-name]').innerText();
  assert.match(lunchName, POULTRY, 'מנת עוף בצהריים: ' + lunchName);
  assert.ok(names.some(n => FISH.test(n)), 'מנת דג ביום');
  await shot(p, 's01-day');
  ok(`יום שלם: צהריים "${lunchName}", ערב/אחר "${names.find(n => FISH.test(n))}"`);

  const daySum = async () => num((await sh.locator('#daysum').innerText()).replace(/^\D+/, ''));
  const d0 = await daySum();
  const r = await swapRiceToSweetPotato(p, lunchCard, 'יום שלם');
  const d1 = await daySum();
  assert.equal(d1 - d0, r.kAfter - r.kBefore === 0 ? 0 : d1 - d0); assert.ok(Math.abs((d1 - d0) - (r.kAfter - r.kBefore)) <= 1, `הסיכום היומי עודכן (${d0} → ${d1})`);
  await shot(p, 's02-day-swapped');
  ok(`החלפת אורז בבטטה בצהריים: רק הפחמימה השתנתה, שם המנה, הרכיבים, סיכום הארוחה והיום עודכנו מיד (${d0} → ${d1} קק״ל)`);

  await sh.locator('[data-all]').click(); await noSheet(p);
  let es = (await st(p)).entries.filter(e => e.date === T);
  const lunch = es.filter(e => e.meal === 'lunch');
  assert.ok(lunch.some(e => e.foodId === 'm3654'), 'בטטה נשמרה בצהריים'); assert.ok(!lunch.some(e => e.foodId === 'm2721'), 'האורז לא נשמר');
  const ids = es.map(e => `${e.meal}|${e.foodId}`); assert.equal(new Set(ids).size, ids.length, 'כל רכיב נשמר פעם אחת');
  ok(`"הוסף את כל היום": נשמרה רק האפשרות שנבחרה (${es.length} פריטים, בלי כפילויות)`);

  // ---- אותה החלפה מתוך "הצע לי" ----
  await p.locator('[data-meal="lunch"] [data-mact="suggest"]').click(); await p.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  const sg = p.locator('.sheet-wrap').last();
  const sn = await sg.locator('.sugg [data-name]').allInnerTexts();
  console.log('   הצע לי:', sn.join(' | '));
  assert.ok(sn.some(n => POULTRY.test(n)) && sn.some(n => FISH.test(n)), 'בהצעות: אפשרות עוף ואפשרות דג');
  const ci = sn.findIndex(n => POULTRY.test(n)); const card = sg.locator('.sugg').nth(ci);
  await swapRiceToSweetPotato(p, card, 'הצע לי');
  await shot(p, 's03-suggest-swapped');
  await card.locator('[data-addopt]').click();
  const cf = p.locator('.sheet-wrap').last(); if (await cf.getByText('יש כבר תכנון לארוחה').count()) await cf.getByRole('button', { name: 'החלף' }).click();
  await noSheet(p);
  es = (await st(p)).entries.filter(e => e.date === T && e.meal === 'lunch');
  assert.ok(es.some(e => e.foodId === 'm3654')); const li = es.map(e => e.foodId); assert.equal(new Set(li).size, li.length);
  ok(`"הצע לי": ${sn.length} ארוחות (עוף, דג, אחרת), אותה החלפה עובדת ונשמרת פעם אחת`);

  // ---- "הצע לי את הארוחה הבאה" — כפתורי החלפה וחיפוש במאגר ----
  await p.click('[data-act="next"]'); await p.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  const nx = p.locator('.sheet-wrap').last();
  assert.ok(await nx.locator('[data-sw]').count() >= 3, 'כפתורי החלפה בכל כרטיס');
  const first = nx.locator('.sugg').first(); const b0 = first.locator('[data-sw]').first(); const lbl = await b0.innerText(); await b0.click();
  await first.locator('[data-db]').click(); await p.fill('#fpq', lbl.includes('חלבון') ? 'טונה' : lbl.includes('פחמימה') ? 'קינואה' : 'שקדים');
  await p.locator('[data-food]').first().click();
  await p.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1);
  assert.ok((await first.locator('.why').innerText()).includes('הוחלף'));
  await shot(p, 's04-next-db');
  ok(`"הצע לי את הארוחה הבאה": ${lbl} → חיפוש במאגר עובד`);
  await nx.locator('.sh button').first().click(); await noSheet(p);

  // ---- ארוחה עיקרית אחת: בחירה עוף / דג ----
  const tok2 = await user('one@test.local', { ...PROF, meals: 2 }, 118);
  const p2 = await page(tok2);
  await p2.goto(BASE + '/#/today'); await p2.getByText('היום שלי').first().waitFor();
  await p2.click('[data-act="day"]'); await p2.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  const s2 = p2.locator('.sheet-wrap').last();
  assert.equal(await s2.locator('[data-alt]').count(), 2);
  const n1 = await s2.locator('[data-alt]').first().locator('xpath=ancestor::div[@data-opt]').locator('[data-name]').innerText();
  await s2.locator('[data-alt]', { hasText: 'מנת דג' }).click();
  const n2 = await s2.locator('[data-alt].on').locator('xpath=ancestor::div[@data-opt]').locator('[data-name]').innerText();
  assert.match(n1, POULTRY); assert.match(n2, FISH);
  await shot(p2, 's05-one-main');
  ok(`ארוחה עיקרית אחת: בחירה "${n1}" / "${n2}"`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
