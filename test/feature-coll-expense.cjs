// בדיקת ״+ הוצאה״ בעריכת ״חשבון גובים״ (אייפון): חובות 32,840 · הוצאות 14,651 · נטו 18,189 → הוצאת שליח 100 לבן → 32,840 · 14,751 · 18,089.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8520, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ce-'));
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
  const D = (n, a, c) => ({ n, a, c, k: 'd', t: '' }), X = (n, a, c) => ({ n, a, c, k: 'e', t: '' });
  // עותק של החשבון: חובות 32,840, הוצאות 14,651 (בן: חובות 5,000, הוצאות 1,000)
  const { id: C } = await api('POST', '/api/accounts', { kind: 'collectors', date: '2026-11-23', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + C); const data = { ...a, entries: [D('אבי כהן', 3000, 'בן'), D('דנה לוי', 2000, 'בן'), X('דלק', 1000, 'בן'), D('יוסי פרץ', 20000, 'טל'), D('שירה מור', 7840, 'טל'), X('שכירות רכב', 13651, 'טל')] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + C, { data, baseVersion: a._version, opId: 'f' }); }
  const tot = async () => (await p.locator('#ed-ctot').innerText()).replace(/\s+/g, ' ');
  const benNet = async () => (await p.locator('.ed-cg tr[data-cg="בן"]').innerText()).replace(/\s+/g, ' ');
  const lastRow = () => p.locator('table tbody tr').last();

  await step('לפני: חובות 32,840 · הוצאות 14,651 · נטו 18,189; ״+ הוצאה״ ליד ״+ שורה״ וגלוי בטלפון', async () => {
    await p.goto(URL + '/#/acc/' + C + '?edit=1'); await p.waitForSelector('[data-addx]');
    assert.strictEqual(await tot(), 'חובות 32,840 ₪ · הוצאות 14,651 ₪ · נטו 18,189 ₪');
    const bx = await p.locator('[data-addx]').boundingBox(); const ax = await p.locator('[data-add="entries"]').boundingBox();
    assert.ok(bx.x >= 0 && bx.x + bx.width <= 390 && Math.abs(bx.y - ax.y) < 60, JSON.stringify([bx, ax]));
  });
  await step('״+ הוצאה״ פותח שורה מסוג ״הוצאה״ (מסומנת בבירור), בלי שם לקוח; תיאור, סכום וגובה עם הצעות', async () => {
    await p.click('[data-addx]'); const r = lastRow();
    assert.strictEqual(await r.locator('select[data-k="k"]').inputValue(), 'e'); assert.ok((await r.innerText()).includes('הוצאה'));
    assert.strictEqual(await r.locator('[data-k="n"]').getAttribute('placeholder'), 'תיאור ההוצאה (שליח, דלק…)');
    assert.strictEqual(await r.locator('[data-k="c"]').getAttribute('list'), 'ed-colls');
    await p.waitForFunction(() => [...document.querySelectorAll('#ed-colls option')].some(o => o.value === 'בן'));
    await r.locator('[data-k="n"]').fill('שליח'); await r.locator('[data-k="c"]').fill('בן'); await r.locator('[data-k="a"]').fill('100'); // בלי לצאת מהשדה
  });
  await step('הסיכום מתעדכן מיד: חובות 32,840 · הוצאות 14,751 · נטו 18,089; הנטו של בן יורד ב-100 (4,000 → 3,900)', async () => {
    assert.strictEqual(await tot(), 'חובות 32,840 ₪ · הוצאות 14,751 ₪ · נטו 18,089 ₪');
    assert.ok(/בן 5,000 ₪ 1,100 ₪ 3,900 ₪/.test(await benNet()), await benNet());
  });
  await step('״שמור שינויים״ ופתיחה מחדש: ההוצאה פעם אחת אצל בן, בתאריך החשבון (אתמול); גם במסך החשבון', async () => {
    await p.click('#ed-savestay'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('.actionbar [data-savest]').textContent));
    const a = await api('GET', '/api/accounts/' + C); const s = a.entries.filter(e => e.n === 'שליח'); assert.strictEqual(s.length, 1);
    assert.deepStrictEqual([s[0].c, s[0].k, s[0].a], ['בן', 'e', 100]); assert.strictEqual(a.date, '2026-11-23');
    await p.reload(); await p.waitForSelector('#ed-ctot'); assert.strictEqual(await tot(), 'חובות 32,840 ₪ · הוצאות 14,751 ₪ · נטו 18,089 ₪');
    await p.goto(URL + '/#/acc/' + C); await p.waitForSelector('.card'); const v = await p.locator('#view').innerText(); assert.strictEqual((v.match(/שליח/g) || []).length, 1, 'פעם אחת במסך');
  });
  await step('מחיקת ההוצאה מהטבלה מחזירה את הסכומים הקודמים, ונשמרת', async () => {
    await p.goto(URL + '/#/acc/' + C + '?edit=1'); await p.waitForSelector('#ed-ctot');
    const r = p.locator('tr', { has: p.locator('[data-k="n"][value="שליח"]') }); p.once('dialog', d => d.accept()); await r.locator('[data-del]').click();
    assert.strictEqual(await tot(), 'חובות 32,840 ₪ · הוצאות 14,651 ₪ · נטו 18,189 ₪'); assert.ok(/בן 5,000 ₪ 1,000 ₪ 4,000 ₪/.test(await benNet()));
    await p.click('#ed-save'); await p.waitForFunction(() => !location.hash.includes('edit'));
    assert.ok(!(await api('GET', '/api/accounts/' + C)).entries.some(e => e.n === 'שליח'));
  });
  await step('עריכת הוצאה קיימת (סכום) ו״ביטול״ לפני שמירה — חוזר למצב הקודם', async () => {
    await p.goto(URL + '/#/acc/' + C + '?edit=1'); await p.waitForSelector('#ed-ctot');
    const r = p.locator('tr', { has: p.locator('[data-k="n"][value="דלק"]') }); assert.ok((await r.innerText()).includes('הוצאה'));
    await r.locator('[data-k="a"]').fill('1500'); assert.ok((await tot()).includes('הוצאות 15,151'));
    await p.click('.actionbar a:has-text("ביטול")'); await p.waitForSelector('#lvgo'); await p.click('#lvgo'); await p.waitForFunction(() => !location.hash.includes('edit'));
    assert.strictEqual((await api('GET', '/api/accounts/' + C)).entries.find(e => e.n === 'דלק').a, 1000);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
