// ספר המתכונים — דרך המסכים, בהדמיית iPhone 13, בפרופיל של רובי (עוף או דג כל יום, בלי טופו, אוהב אוכל ישראלי, על האש ודגים).
// שבעה ימים דרך "בנה לי יום שלם"; שלוש לחיצות "הצע מנה אחרת" על מנת העוף/הדג היחידה; "הצע לי" בארוחה העיקרית האחרונה בלי עוף ודג.
// הרצה: node test/e2e-recipes.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ROBI } from './week-sim.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8904, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-recipes-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-recipes-'));
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


const FISH = /דג|סלמון|לברק|דניס|אמנון|בקלה|טונה/; const POULTRY = /עוף|פרגית|הודו|שניצל|עראייס/; const BEEF = /בקר|סינטה|סטייק|בולונז/;
const grp = n => POULTRY.test(n) ? 'עוף' : FISH.test(n) ? 'דג' : BEEF.test(n) ? 'בקר' : 'אחר';
const click = async l => { await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); };
const openDay = async (p, d) => { await p.goto(BASE + (d === T ? '/#/today' : '/#/today/' + d)); await p.getByText(/היום שלי|יום /).first().waitFor(); await p.waitForTimeout(300); await p.click('[data-act="day"]'); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor(); return p.locator('.sheet-wrap').last(); };
const cardsOf = async sh => (await sh.locator('h3').allInnerTexts()).map((label, i) => ({ label, i }));
const cardName = (sh, i) => sh.locator('.sugg').nth(i).locator('[data-name]').innerText();

try {
  const tok = await user('robi@test.local', ROBI, 118);
  const p = await page(tok);
  // ---- 1. שבעה ימים ----
  const week = [];
  for (let k = 0; k < 7; k++) {
    const d = addDays(T, k); const sh = await openDay(p, d);
    const labels = await sh.locator('h3').allInnerTexts(); const names = await sh.locator('.sugg [data-name]').allInnerTexts();
    const txt = await sh.innerText();
    assert.ok(!/טופו/.test(txt), `${d}: טופו הוצע`);
    assert.equal(new Set(names).size, names.length, `${d}: מנה חוזרת ביום: ${names.join(' | ')}`);
    const mains = labels.map((l, i) => ({ l, n: names[i] })).filter(x => /צהריים|ערב/.test(x.l));
    assert.ok(mains.some(m => ['עוף', 'דג'].includes(grp(m.n))), `${d}: אין עוף או דג: ${mains.map(m => m.n).join(' | ')}`);
    if (k === 0) {
      const c = sh.locator('.sugg').nth(labels.findIndex(l => l.includes('צהריים')));
      assert.ok(await c.locator('.desc').count() && await c.locator('.howto li').count() >= 2, 'תיאור והוראות');
      assert.match(await c.locator('.howto summary').innerText(), /⏱ \d+ דקות/);
      await shot(p, 'r01-day1');
    }
    week.push({ d, mains });
    await click(sh.locator('[data-all]')); await noSheet(p);
  }
  const es = (await st(p)).entries; const ids = es.map(e => `${e.date}|${e.meal}|${e.foodId}`); assert.equal(new Set(ids).size, ids.length, 'בלי כפילויות');
  const allMains = week.flatMap(w => w.mains.map(m => m.n));
  ok(`שבעה ימים: בכל יום עוף או דג, בלי טופו ובלי מנה שחוזרת ביום (${new Set(allMains).size} מנות עיקריות שונות מתוך ${allMains.length})`);
  for (const w of week) console.log(`   ${w.d}: ${w.mains.map(m => `${m.l.replace('ארוחת ', '')}: ${m.n} [${grp(m.n)}]`).join(' · ')}`);

  // ---- 2. שלוש פעמים "הצע מנה אחרת" על מנת העוף/הדג היחידה ----
  const d8 = addDays(T, 7); const sh = await openDay(p, d8);
  const labels = await sh.locator('h3').allInnerTexts();
  const li = labels.findIndex(l => l.includes('צהריים')), di = labels.findIndex(l => l.includes('ערב'));
  let ln = await cardName(sh, li), dn = await cardName(sh, di);
  // אם שתי הארוחות עוף/דג — מחליפים את אחת מהן עד שהיא בקר, כדי שתישאר מנת עוף/דג אחת
  let only = ['עוף', 'דג'].includes(grp(ln)) ? li : di; let other = only === li ? di : li;
  for (let t = 0; t < 10 && ['עוף', 'דג'].includes(grp(await cardName(sh, other))); t++) await click(sh.locator('.sugg').nth(other).locator('[data-other]'));
  const otherName = await cardName(sh, other); assert.ok(!['עוף', 'דג'].includes(grp(otherName)), 'הארוחה השנייה כבר לא עוף/דג'); console.log('   הארוחה השנייה:', otherName);
  const start = await cardName(sh, only); const got = [];
  for (let t = 0; t < 3; t++) { await click(sh.locator('.sugg').nth(only).locator('[data-other]')); got.push(await cardName(sh, only)); }
  assert.equal(new Set([start, ...got]).size, 4, 'שלוש חלופות שונות');
  for (const n of got) assert.ok(['עוף', 'דג'].includes(grp(n)), n);
  await shot(p, 'r02-other-x3');
  ok(`"הצע מנה אחרת" ×3 על "${start}" (${labels[only]}): ${got.join(' → ')}`);
  await sh.locator('.sh button').first().click(); await noSheet(p);

  // ---- 3. "הצע לי" בארוחה העיקרית האחרונה, כשבצהריים היה בקר ----
  const tok2 = await user('robi2@test.local', ROBI, 118);
  await api('POST', '/api/entries', { entries: [{ date: T, meal: 'lunch', foodId: 'k18_066', comp: 'sirloin', grams: 150, status: 'eaten', recipe: 'sirloinStir' }] }, tok2);
  const p2 = await page(tok2);
  await p2.goto(BASE + '/#/today'); await p2.getByText('היום שלי').first().waitFor();
  await p2.locator('[data-meal="dinner"] [data-mact="suggest"]').click(); await p2.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  const sg = p2.locator('.sheet-wrap').last(); const sn = await sg.locator('.sugg [data-name]').allInnerTexts();
  assert.match(await sg.innerText(), /עוד לא היה היום עוף או דג/);
  assert.ok(sn.length >= 2 && sn.every(n => ['עוף', 'דג'].includes(grp(n))), sn.join(' | '));
  await shot(p2, 'r03-last-main');
  ok(`"הצע" לערב אחרי בקר בצהריים: רק עוף ודג — ${sn.join(' | ')}`);

  await sg.locator('.sh button').first().click(); await noSheet(p2);
  // ---- 4. העדפות התפריט נשמרות בפרופיל ----
  const s4 = await openDay(p2, T); await click(s4.locator('#mprefs summary'));
  assert.equal(await s4.locator('[data-dm="poultry"].on').count(), 1); assert.equal(await s4.locator('[data-no="tofu"].on').count(), 1);
  ok('העדפות התפריט בפרופיל: עוף/דג כל יום, בלי טופו');

  // ---- 5. המקרה מהטלפון: פרופיל שמוגדר "צמחוני" אבל בהעדפות התפריט נבחרו עוף, דג ובקר ----
  const tok5 = await user('veg-but-chicken@test.local', { ...ROBI, diet: 'vegetarian', menuPrefs: undefined }, 118);
  const p5 = await page(tok5);
  let s5 = await openDay(p5, T);
  const before = await s5.locator('.sugg [data-name]').allInnerTexts();
  assert.ok(before.every(n => !['עוף', 'דג'].includes(grp(n))), 'לפני: צמחוני');
  assert.match(await s5.locator('#mprefs').innerText(), /לא מוצעים כי בפרופיל מוגדר סוג תזונה: צמחוני/);
  await shot(p5, 'r04-veg-warning');
  for (const g of ['poultry', 'fish', 'beef']) { const c = s5.locator(`[data-dm="${g}"]`); if (!(await c.getAttribute('class')).includes('on')) await click(c); }
  await click(s5.locator('[data-no="tofu"]'));
  await click(s5.locator('[data-saveprefs]'));
  await p5.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor(); await p5.waitForTimeout(400);
  s5 = p5.locator('.sheet-wrap').last();
  const after = await s5.locator('.sugg [data-name]').allInnerTexts();
  const labels5 = await s5.locator('h3').allInnerTexts();
  const mains5 = labels5.map((l, i) => ({ l, n: after[i] })).filter(x => /צהריים|ערב/.test(x.l));
  assert.ok(mains5.some(m => ['עוף', 'דג'].includes(grp(m.n))), 'אחרי: ' + after.join(' | '));
  const l5 = s5.locator('.sugg').nth(labels5.findIndex(l => l.includes('צהריים')));
  await click(l5.locator('[data-sw]').first());
  const g5 = await l5.locator('.swp [data-group]').evaluateAll(xs => xs.map(x => x.dataset.group));
  assert.deepEqual(g5.slice(0, 3).sort(), ['beef', 'fish', 'poultry'], g5.join(','));
  assert.ok(!/טופו/.test(await s5.innerText()));
  await shot(p5, 'r05-veg-fixed');
  ok(`פרופיל "צמחוני" + בחירה בהעדפות: לפני — ${before.join(' | ')}; אחרי — ${mains5.map(m => m.n).join(' | ')}; "החלף חלבון": עוף, דג ובקר ראשונים`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
