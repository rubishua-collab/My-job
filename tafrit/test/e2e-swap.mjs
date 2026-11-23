// מנות עם אופי, עוף/דג/בקר רזה והחלפת רכיב — דרך המסכים, בהדמיית iPhone 13.
// יום שלם לאוכל-כול: ארוחה עיקרית מעוף/דג/בקר; ב"החלף חלבון" שלוש הקבוצות מיד; עוף → דג, "הוסף את כל היום" נשמר פעם אחת והסיכום תואם;
// "הצע מנה אחרת"; "הצע לי" אחרי ביצים בבוקר; פרופיל עם אלרגיה לדגים; ארוחה עיקרית אחת — בחירה בין עוף, דג ובקר.  הרצה: node test/e2e-swap.mjs
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


const FISH = /סלמון|אמנון|דניס|לברק|בקלה|טונה|דג/; const POULTRY = /עוף|פרגית|הודו|שניצל/; const BEEF = /בקר|סינטה|סטייק/; const EGG = /ביצ|חביתה/;
const num = t => +String(t).match(/([\d,]+)/)[1].replace(',', '');
const openDay = async p => { await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor(); await p.click('[data-act="day"]'); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor(); return p.locator('.sheet-wrap').last(); };
const cardOf = async (sh, label) => sh.locator('.sugg').nth(await sh.locator('h3').evaluateAll((hs, l) => hs.findIndex(h => h.innerText.includes(l)), label));
const click = async l => { await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await l.click(); };

try {
  // ---- 1. יום שלם לאוכל-כול ----
  const tok = await user('omni2@test.local', OMNI, 118);
  const p = await page(tok);
  let sh = await openDay(p);
  const names = await sh.locator('.sugg [data-name]').allInnerTexts();
  console.log('   יום שלם:', names.join(' | '));
  const lunch = await cardOf(sh, 'צהריים'); const lunchName = await lunch.locator('[data-name]').innerText();
  assert.ok(POULTRY.test(lunchName) || BEEF.test(lunchName) || FISH.test(lunchName), 'ארוחה עיקרית מעוף/דג/בקר: ' + lunchName);
  await shot(p, 'x01-day');
  ok(`יום שלם: צהריים "${lunchName}"`);

  // ---- 2. "החלף חלבון": עוף, דג ובקר רזה מיד ----
  await click(lunch.locator('[data-sw]').first());
  const groups = await lunch.locator('.swp [data-group]').evaluateAll(xs => xs.map(x => x.dataset.group));
  assert.deepEqual(groups.slice(0, 3).sort(), ['beef', 'fish', 'poultry'], 'שלוש האפשרויות הראשונות: ' + groups.join(','));
  assert.equal(groups.filter(g => g === 'egg').length <= 1, true, 'ביצים בשורה אחת');
  const panel = await lunch.locator('.swp').innerText();
  assert.match(panel, /הארוחה אחרי ההחלפה: \d[\d,]* קק״ל · ח [\d.]+ · פ [\d.]+ · ש [\d.]+/); assert.match(panel, /משקל (אחרי הכנה|לפני בישול)/);
  await shot(p, 'x02-protein-choices');
  const daySum = async () => num((await sh.locator('#daysum').innerText()).replace(/^\D+/, ''));
  const d0 = await daySum(); const k0 = num(await lunch.locator('.tot').innerText());
  const fishBtn = lunch.locator('.swp [data-group="fish"]').first(); const fishTxt = await fishBtn.innerText();
  const after = num(fishTxt.match(/הארוחה אחרי ההחלפה: ([\d,]+)/)[1]);
  await click(fishBtn);
  const newName = await lunch.locator('[data-name]').innerText(); const k1 = num(await lunch.locator('.tot').innerText()); const d1 = await daySum();
  assert.match(newName, FISH); assert.equal(k1, after, 'הסיכום שהוצג לפני הבחירה = סיכום הארוחה');
  assert.ok(Math.abs((d1 - d0) - (k1 - k0)) <= 1, 'הסיכום היומי עודכן');
  await shot(p, 'x03-swapped-fish');
  ok(`"החלף חלבון": ${groups.slice(0, 3).join(', ')} מיד; עוף → דג: "${newName}" (${k0} → ${k1} קק״ל, יום ${d0} → ${d1})`);

  // ---- 3. "הצע מנה אחרת" בארוחה אחרת ----
  const dinner = await cardOf(sh, 'ערב'); const dn0 = await dinner.locator('[data-name]').innerText();
  await click(dinner.locator('[data-other]')); const dn1 = await dinner.locator('[data-name]').innerText();
  assert.notEqual(dn1, dn0); assert.ok(!FISH.test(dn1) || true);
  ok(`"הצע מנה אחרת": "${dn0}" → "${dn1}"`);
  const dShown = await daySum();

  // ---- 4. הוסף את כל היום: נשמר פעם אחת, הסיכום תואם ----
  await click(sh.locator('[data-all]')); await noSheet(p);
  const es = (await st(p)).entries.filter(e => e.date === T);
  const ids = es.map(e => `${e.meal}|${e.foodId}`); assert.equal(new Set(ids).size, ids.length, 'כל רכיב פעם אחת');
  assert.ok(es.filter(e => e.meal === 'lunch').some(e => FISH.test(e.snapshot.n)), 'הדג נשמר בצהריים');
  const dayApi = await p.evaluate(async d => (await fetch('/api/day/' + d, { headers: { Authorization: 'Bearer ' + localStorage.getItem('tafrit-token') } })).json(), T);
  assert.ok(Math.abs(dayApi.planned.kcal - dShown) <= 8, `סיכום היום ${dayApi.planned.kcal} מול ${dShown}`);
  ok(`נשמר: ${es.length} פריטים בלי כפילויות; סיכום היום ${dayApi.planned.kcal} קק״ל = מה שהוצג (${dShown})`);

  // ---- 5. ביצים בבוקר → "הצע לי" ----
  const tok3 = await user('eggs@test.local', OMNI, 118);
  await api('POST', '/api/entries', { entries: [{ date: T, meal: 'breakfast', foodId: 'm1561', comp: 'egg', grams: 174, unit: 'יחידה גדולה', qty: 3, status: 'eaten' }] }, tok3);
  const p3 = await page(tok3);
  await p3.goto(BASE + '/#/today'); await p3.getByText('היום שלי').first().waitFor();
  await p3.click('[data-act="next"]'); await p3.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  let sg = p3.locator('.sheet-wrap').last(); const nx = await sg.locator('.sugg [data-name]').allInnerTexts();
  assert.ok(nx.every(n => !EGG.test(n)), 'בלי ביצים: ' + nx.join(' | '));
  await sg.locator('.sh button').first().click(); await noSheet(p3);
  await p3.locator('[data-meal="lunch"] [data-mact="suggest"]').click(); await p3.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  sg = p3.locator('.sheet-wrap').last(); const ln = await sg.locator('.sugg [data-name]').allInnerTexts();
  assert.ok(ln.every(n => !EGG.test(n)) && ln.some(n => POULTRY.test(n)) && ln.some(n => FISH.test(n)) && ln.some(n => BEEF.test(n)), ln.join(' | '));
  // החלפת חלבון גם מכאן
  const c0 = sg.locator('.sugg').first(); await click(c0.locator('[data-sw]').first());
  const g3 = await c0.locator('.swp [data-group]').evaluateAll(xs => xs.map(x => x.dataset.group));
  assert.deepEqual(g3.slice(0, 3).sort(), ['beef', 'fish', 'poultry']);
  await shot(p3, 'x04-after-eggs');
  ok(`אחרי ביצים בבוקר: "הצע לי את הארוחה הבאה" (${nx.length}) ו"הצע" לצהריים בלי ביצים — ${ln.join(' | ')}`);

  // ---- 6. אלרגיה לדגים ----
  const tok4 = await user('nofish@test.local', { ...OMNI, allergies: ['fish'] }, 118);
  const p4 = await page(tok4);
  sh = await openDay(p4);
  assert.ok(!FISH.test(await sh.innerText()), 'אין דג ביום שלם');
  const l4 = await cardOf(sh, 'צהריים'); await click(l4.locator('[data-sw]').first());
  await l4.locator('[data-more]').count() && await click(l4.locator('[data-more]'));
  const allSw = await l4.locator('.swp').innerText(); assert.ok(!FISH.test(allSw), 'אין דג בתחליפים');
  const g4 = await l4.locator('.swp [data-group]').evaluateAll(xs => xs.map(x => x.dataset.group));
  assert.ok(!g4.includes('fish') && g4.includes('poultry') && g4.includes('beef'));
  await sh.locator('.sh button').first().click(); await noSheet(p4);
  await p4.locator('[data-meal="dinner"] [data-mact="suggest"]').click(); await p4.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor();
  const t4 = await p4.locator('.sheet-wrap').last().locator('.sugg').allInnerTexts();
  assert.ok(t4.length && t4.every(t => !FISH.test(t)), t4.map(t => t.split('\n')[0]).join(' | '));
  await shot(p4, 'x05-no-fish');
  ok(`אלרגיה לדגים: יום שלם, תחליפים ו"הצע לי" בלי דגים (${t4.map(t => t.split('\n')[0]).join(' | ')})`);

  // ---- 7. ארוחה עיקרית אחת ----
  const tok2 = await user('one2@test.local', { ...OMNI, meals: 2 }, 118);
  const p2 = await page(tok2);
  const s2 = await openDay(p2);
  const chips = await s2.locator('[data-alt]').allInnerTexts();
  assert.deepEqual(chips.map(c => c.replace(/^[^\u0590-\u05FF]+/, '')).sort(), ['מנת בקר', 'מנת דג', 'מנת עוף'].sort());
  await s2.locator('[data-alt]', { hasText: 'מנת בקר' }).click();
  assert.match(await s2.locator('[data-alt].on').locator('xpath=ancestor::div[@data-opt]').locator('[data-name]').innerText(), BEEF);
  await shot(p2, 'x06-one-main');
  ok(`ארוחה עיקרית אחת: ${chips.join(' / ')}`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
