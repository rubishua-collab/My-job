// בדיקת ״פצל חוב״ ו״הפרד לשורות״ בעריכת הפיצול (אייפון) — הסכום הכולל לא משתנה, כל גובה רואה רק את חלקו.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8500, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-sd-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const R = (n, a, c, ph, t) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: ph || '', a, c, t: t || '', cnt: 1, side: false });
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-23', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [R('אדם ממן', 3300, 'אושר', '0501112222', '10:00'), { ...R('עידן חגג', 7900, 'טל'), mg: 'gA' }, R('שירה לוי', 400, 'רובי'), { ...R('עידן חגג', 725, 'רובי'), mg: 'gA' }] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'f' }); }
  const sum = async () => (await api('GET', '/api/accounts/' + SP)).records.reduce((s, r) => s + r.a, 0);
  const TOTAL = await sum(); // 12,325
  const rowOf = (name, amt) => p.locator('tr', { has: p.locator(`[data-k="n"][value="${name}"]`) }).filter({ has: p.locator(`[data-k="a"][value="${amt}"]`) });

  await step('״פצל חוב״ ליד כל חוב בודד; החלון מציג שם, יתרה ושני חלקים; אישור נעול עד שהסכומים מסתכמים', async () => {
    await p.goto(URL + '/#/acc/' + SP + '?edit=1'); await p.waitForSelector('[data-spl]');
    assert.ok((await p.locator('#ed-h-records').innerText()).includes('(3)'));
    await rowOf('אדם ממן', '3300').locator('[data-spl]').click(); await p.waitForSelector('#spl-ok');
    const t = await p.locator('#sheet').innerText(); assert.ok(t.includes('אדם ממן') && t.includes('3,300') && t.includes('0501112222'), t);
    assert.strictEqual(await p.locator('.spl-p').count(), 2); assert.ok(await p.locator('#spl-ok').isDisabled());
    assert.strictEqual(await p.inputValue('[data-pc="0"]'), 'אושר', 'הגובה הנוכחי בחלק הראשון');
  });
  await step('הקלדת 2,000 לאושר → מוצע 1,300 לחלק השני, ״חולק״ ו״נותר״ מתעדכנים; סכום שגוי נועל את האישור', async () => {
    await p.fill('[data-pa="0"]', '2000'); assert.strictEqual(await p.inputValue('[data-pa="1"]'), '1300');
    assert.ok(/חולק:\s*3,300 ₪ · נותר לחלוקה:\s*0 ₪/.test(await p.locator('#spl-st').innerText()));
    await p.fill('[data-pa="1"]', '1400'); assert.ok(await p.locator('#spl-ok').isDisabled()); assert.ok((await p.locator('#spl-st').innerText()).includes('הסכומים גבוהים מהחוב'));
    await p.fill('[data-pa="1"]', '1300'); await p.fill('[data-pc="1"]', 'רובי'); await p.fill('[data-pt="1"]', '12:30');
    assert.ok(!(await p.locator('#spl-ok').isDisabled()));
  });
  await step('אישור: שתי שורות נפרדות (חלק 1/2, 2/2) עם השם והטלפון; הלקוח נספר פעם אחת; הסכום הכולל זהה', async () => {
    await p.click('#spl-ok'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
    assert.strictEqual(await p.locator('tr', { has: p.locator('[data-k="n"][value="אדם ממן"]') }).count(), 2);
    assert.strictEqual(await rowOf('אדם ממן', '2000').locator('[data-k="c"]').inputValue(), 'אושר'); assert.strictEqual(await rowOf('אדם ממן', '1300').locator('[data-k="c"]').inputValue(), 'רובי');
    assert.ok((await rowOf('אדם ממן', '1300').innerText()).includes('חלק 2/2'));
    assert.ok((await p.locator('#ed-h-records').innerText()).includes('(3)'), 'הלקוח נספר פעם אחת');
    assert.ok((await p.locator('#ed-sum').innerText()).includes('12,325'));
  });
  await step('״הפרד לשורות״ בשורה המאוחדת (עידן — 2 חובות): שתי שורות עריכה עם הסכום והגובה שלהן', async () => {
    await p.click('[data-mgsep]'); await p.waitForTimeout(150);
    assert.strictEqual(await p.locator('tr.mghead').count(), 0);
    assert.strictEqual(await rowOf('עידן חגג', '7900').locator('[data-k="c"]').inputValue(), 'טל'); assert.strictEqual(await rowOf('עידן חגג', '725').locator('[data-k="c"]').inputValue(), 'רובי');
    assert.ok((await p.locator('#ed-sum').innerText()).includes('12,325'));
  });
  await step('״שמור שינויים״ ופתיחה מחדש: השורות והשיוך לגובים בדיוק כפי שנשמרו; סכום הפיצול זהה; כל גובה רואה רק את חלקו', async () => {
    await p.click('#ed-savestay'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('.actionbar [data-savest]').textContent));
    assert.strictEqual(await sum(), TOTAL);
    const a = await api('GET', '/api/accounts/' + SP); const adam = a.records.filter(r => r.n === 'אדם ממן');
    assert.deepStrictEqual(adam.map(r => [r.a, r.c, r.t, r.ph, r.pp]), [[2000, 'אושר', '10:00', '0501112222', '1/2'], [1300, 'רובי', '12:30', '0501112222', '2/2']]);
    assert.ok(adam[0].pg && adam[0].pg === adam[1].pg); assert.ok(!a.records.some(r => r.mg));
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('.card h2');
    const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });
    assert.ok((await card('אושר').innerText()).includes('2,000') && !(await card('אושר').innerText()).includes('3,300'));
    assert.ok((await card('רובי').innerText()).includes('1,300'));
    await p.goto(URL + '/#/acc/' + SP + '?edit=1'); await p.waitForSelector('[data-spl]');
    assert.strictEqual(await rowOf('אדם ממן', '2000').locator('[data-k="c"]').inputValue(), 'אושר');
  });
  await step('״ביטול״ לפני שמירה מחזיר את המצב הקודם', async () => {
    await rowOf('שירה לוי', '400').locator('[data-spl]').click(); await p.waitForSelector('#spl-ok');
    await p.fill('[data-pa="0"]', '100'); await p.fill('[data-pc="1"]', 'טל'); await p.click('#spl-ok');
    assert.strictEqual(await p.locator('tr', { has: p.locator('[data-k="n"][value="שירה לוי"]') }).count(), 2);
    await p.click('.actionbar a:has-text("ביטול")'); await p.waitForSelector('#lvgo'); await p.click('#lvgo'); await p.waitForFunction(() => !location.hash.includes('edit'));
    const a = await api('GET', '/api/accounts/' + SP); assert.strictEqual(a.records.filter(r => r.n === 'שירה לוי').length, 1); assert.strictEqual(await sum(), TOTAL);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
