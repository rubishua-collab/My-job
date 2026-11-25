// בדיקת ״נאסף״ באיסוף יום (אייפון): תגובה איטית, כמה לקוחות ברצף, לחיצה כפולה, כשל שמירה וניסיון חוזר מתוך השורה.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8561, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-qm-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 600)); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await wait(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept(''));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = '2026-11-25';
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'mk' });
  const NAMES = [['אבי כהן', 100, 'טל'], ['בני לוי', 200, 'טל'], ['גיל מור', 300, 'טל'], ['דנה רז', 400, 'בן'], ['הדר טל', 500, 'בן'], ['ורד אור', 600, 'בן'], ['זיו בר', 700, 'טל'], ['חן גל', 800, 'בן']];
  { const a = await api('GET', '/api/accounts/' + W); const d = { ...a, entries: NAMES.map(([n, am, c], i) => ({ _k: 'k' + i, n, a: am, c, t: `1${i}:00`, p: '05000000' + i, s: '' })) }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete d[k]); await api('PUT', '/api/accounts/' + W, { data: d, baseVersion: a._version, opId: 'fill' }); }
  const row = (n) => p.locator('.li[data-row]', { hasText: n });
  const btn = (n, s) => row(n).locator(`.st button[data-s="${s}"]`);
  const pressed = async (n) => (await row(n).locator('.st button[aria-pressed="true"]').allInnerTexts()).join(',');
  const uiGot = async () => (await p.locator('.kpi.good .v').innerText()).replace(/[^\d.]/g, '');
  const uiColl = async (g) => (await p.locator(`.wgcard[data-wg="${g}"] .wg-got`).innerText()).replace(/[^\d.]/g, '');
  const srvState = async () => { const a = await api('GET', '/api/accounts/' + W); const got = a.entries.filter(e => e.s === 'נאסף'); return { got: got.reduce((s, e) => s + e.a, 0), names: got.map(e => e.n).sort(), byColl: (c) => got.filter(e => e.c === c).reduce((s, e) => s + e.a, 0) }; };
  const marksOf = async (key) => (await api('GET', `/api/accounts/${W}/history`)).filter(x => x.item === key).length;
  // תגובה איטית: השרת שומר מיד, אבל התשובה מגיעה לטלפון רק אחרי השהיה (כמו קליטה חלשה) — עדכון ״חי״ מגיע לפני התשובה
  let slow = 0, mode = 'ok', calls = 0;
  await p.route('**/api/accounts/*/mark', async (route) => {
    calls++;
    if (mode === 'fail') return route.abort('internetdisconnected');
    const r = await route.fetch();
    if (mode === 'lost') { mode = 'ok'; return route.abort('connectionreset'); } // נשמר בשרת, התשובה אבדה
    if (slow) await wait(slow);
    await route.fulfill({ response: r });
  });
  await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-row]');

  await step('תגובה איטית: חיווי ״שומר…״ בשורה, ואחרי השמירה השורה והסיכומים מתעדכנים מיד; נשארים באותו מקום ברשימה', async () => {
    slow = 1500;
    await row('גיל מור').scrollIntoViewIfNeeded(); const y0 = await p.evaluate(() => scrollY);
    await btn('גיל מור', 'נאסף').click();
    await p.waitForTimeout(250);
    assert.ok(await row('גיל מור').locator('.mkst').isVisible(), 'חיווי שמירה בשורה');
    assert.match(await row('גיל מור').locator('.mkst').innerText(), /שומר/);
    await p.waitForFunction(() => [...document.querySelectorAll('.li[data-row]')].some(r => r.textContent.includes('גיל מור') && r.classList.contains('got')), null, { timeout: 5000 });
    assert.strictEqual(await pressed('גיל מור'), 'נאסף');
    assert.strictEqual(await uiGot(), '300'); assert.strictEqual(await uiColl('טל'), '300');
    assert.ok(Math.abs(await p.evaluate(() => scrollY) - y0) < 40, 'אותו מיקום ברשימה');
    assert.ok(p.url().includes(W), 'אותו יום');
  });
  await step('כמה לקוחות ברצף מהר (תגובה איטית, עדכונים חיים באמצע): כולם מסומנים ״נאסף״ במסך ובשרת, הסכום נכון', async () => {
    slow = 1200;
    for (const n of ['אבי כהן', 'בני לוי', 'דנה רז', 'הדר טל']) { await btn(n, 'נאסף').click(); await p.waitForTimeout(120); }
    await p.waitForTimeout(3500);
    for (const n of ['אבי כהן', 'בני לוי', 'גיל מור', 'דנה רז', 'הדר טל']) assert.strictEqual(await pressed(n), 'נאסף', n);
    const s = await srvState(); assert.strictEqual(s.got, 1500);
    assert.strictEqual(await uiGot(), '1500'); assert.strictEqual(await uiColl('טל'), '600'); assert.strictEqual(await uiColl('בן'), '900');
  });
  await step('רענון חי איטי שחוזר באיחור (ישן) לא מוחק סימון חדש יותר מהמסך', async () => {
    slow = 0; let n = 0;
    await p.route('**/api/accounts/' + W, async (route) => { if (route.request().method() !== 'GET') return route.continue(); const r = await route.fetch(); const my = ++n; await wait(my === 1 ? 2200 : 150); await route.fulfill({ response: r }); });
    await btn('אבי כהן', 'לא ענו').click(); await p.waitForTimeout(300);
    await btn('בני לוי', 'לעבור').click();
    await p.waitForTimeout(3500);
    await p.unroute('**/api/accounts/' + W);
    assert.strictEqual(await pressed('אבי כהן'), 'לא ענו'); assert.strictEqual(await pressed('בני לוי'), 'לעבור');
    await btn('אבי כהן', 'נאסף').click(); await btn('בני לוי', 'נאסף').click(); await p.waitForTimeout(1200);
    assert.strictEqual(await pressed('אבי כהן'), 'נאסף'); assert.strictEqual(await pressed('בני לוי'), 'נאסף'); assert.strictEqual(await uiGot(), '1500');
  });
  await step('לחיצה כפולה מהירה ולחיצה נוספת אחרי עיכוב: נרשם פעם אחת בלבד, נשאר ״נאסף״', async () => {
    slow = 900;
    const h0 = await marksOf('k5'); const c0 = calls;
    await btn('ורד אור', 'נאסף').dblclick();
    await p.waitForTimeout(400); await btn('ורד אור', 'נאסף').click({ force: true }).catch(() => {});
    await p.waitForTimeout(2500);
    assert.strictEqual(calls - c0, 1, 'בקשה אחת לשרת');
    assert.strictEqual(await marksOf('k5') - h0, 1, 'רישום אחד בהיסטוריה');
    assert.strictEqual(await pressed('ורד אור'), 'נאסף');
    assert.strictEqual(await uiGot(), '2100'); assert.strictEqual((await srvState()).got, 2100);
  });
  await step('השמירה נכשלה (אין קליטה): הודעה ברורה בשורה עם ״נסה שוב״; השורה לא מסומנת; ניסיון חוזר מצליח פעם אחת', async () => {
    slow = 0; mode = 'fail';
    await btn('זיו בר', 'נאסף').click();
    await row('זיו בר').locator('.mkerr').waitFor({ timeout: 5000 });
    assert.match(await row('זיו בר').locator('.mkerr').innerText(), /לא נשמר/);
    assert.strictEqual(await pressed('זיו בר'), ''); assert.strictEqual(await uiGot(), '2100');
    assert.ok(!(await srvState()).names.includes('זיו בר'));
    mode = 'ok'; const h0 = await marksOf('k6');
    await row('זיו בר').locator('[data-mkretry]').click();
    await p.waitForFunction(() => [...document.querySelectorAll('.li[data-row]')].some(r => r.textContent.includes('זיו בר') && r.classList.contains('got')), null, { timeout: 5000 });
    assert.strictEqual(await row('זיו בר').locator('.mkerr').count(), 0);
    assert.strictEqual(await marksOf('k6') - h0, 1); assert.strictEqual(await uiGot(), '2800');
  });
  await step('נשמר בשרת אבל התשובה אבדה: ״נסה שוב״ לא רושם פעם שנייה', async () => {
    mode = 'lost'; const h0 = await marksOf('k7');
    await btn('חן גל', 'נאסף').click();
    await row('חן גל').locator('.mkerr').waitFor({ timeout: 5000 });
    await row('חן גל').locator('[data-mkretry]').click();
    await p.waitForFunction(() => [...document.querySelectorAll('.li[data-row]')].some(r => r.textContent.includes('חן גל') && r.classList.contains('got')), null, { timeout: 5000 });
    assert.strictEqual(await marksOf('k7') - h0, 1, 'רישום אחד'); assert.strictEqual(await uiGot(), '3600'); assert.strictEqual((await srvState()).got, 3600);
  });
  await step('המסך מיד אחרי הלחיצות זהה למסך אחרי כניסה מחדש ולשרת', async () => {
    const before = { got: await uiGot(), tal: await uiColl('טל'), ben: await uiColl('בן'), st: await Promise.all(NAMES.map(([n]) => pressed(n))) };
    await p.reload(); await p.waitForSelector('.li[data-row]');
    const after = { got: await uiGot(), tal: await uiColl('טל'), ben: await uiColl('בן'), st: await Promise.all(NAMES.map(([n]) => pressed(n))) };
    assert.deepStrictEqual(after, before);
    const s = await srvState(); assert.strictEqual(String(s.got), after.got); assert.strictEqual(String(s.byColl('טל')), after.tal); assert.strictEqual(String(s.byColl('בן')), after.ben);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
