// בדיקת ״הוצאות של גובה״ בחשבון גובים — רשומת הוצאה אחת משותפת עם איסוף יום, והעברה חוזרת בלי כפילות.
// בן: נגבו 8,190, הוצאות 0 → הוצאת נסיעות 100 מתוך חשבון גובים → בשתי הלשוניות: נגבו 8,190 · הוצאות 100 · נטו 8,090.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8540, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-cx-'));
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
  const DATE = '2026-11-23';
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + W); const data = { ...a, entries: [{ n: 'אבי כהן', p: '', a: 5000, c: 'בן', t: '10:00', s: 'נאסף', ga: 5000 }, { n: 'דנה לוי', p: '', a: 3190, c: 'בן', t: '11:00', s: 'נאסף', ga: 3190 }, { n: 'יוסי פרץ', p: '', a: 1000, c: 'טל', t: '12:00', s: 'נאסף', ga: 1000 }], expenses: [] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + W, { data, baseVersion: a._version, opId: 'f' }); }
  const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });
  let C;
  const transfer = async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.band [data-xact]');
    await p.click('.band button:has-text("העבר לחשבון גובים")'); await p.waitForSelector('#w-toc'); await p.waitForTimeout(300); await p.click('#w-toc');
    await p.waitForURL(/edit=1/); C = p.url().split('#/acc/')[1].split('?')[0]; await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
  };
  const collBen = async () => { const a = await api('GET', '/api/accounts/' + C); const ben = a.entries.filter(e => e.c === 'בן'); return { debts: ben.filter(e => e.k !== 'e').reduce((s, e) => s + e.a, 0), exps: ben.filter(e => e.k === 'e') }; };

  await step('הכנה: איסוף יום → ״העבר לחשבון גובים״; אצל בן נגבו 8,190 והוצאות 0', async () => {
    await transfer(); const x = await collBen(); assert.strictEqual(x.debts, 8190); assert.strictEqual(x.exps.length, 0);
  });
  await step('בחשבון גובים: ״הוצאות של גובה״ בסרגל הכחול העליון, מיד משמאל ל״הדפסה״, באותו עיצוב', async () => {
    await p.goto(URL + '/#/acc/' + C); await p.waitForSelector('.band');
    const order = await p.evaluate(() => [...document.querySelectorAll('.band .row.no-print > *')].map(x => x.textContent.trim()));
    const i = order.indexOf('הדפסה'); assert.ok(i >= 0 && order[i + 1] === 'הוצאות של גובה', JSON.stringify(order));
    const cls = await p.evaluate(() => [...document.querySelectorAll('.band button')].filter(b => ['הדפסה', 'הוצאות של גובה'].includes(b.textContent.trim())).map(b => b.className)); assert.strictEqual(cls[0], cls[1]);
  });
  await step('צפייה בגובה ״בן״ → ״הוצאות של גובה״ → ״הוסף הוצאה״: בן נבחר מראש; נסיעות 100 ₪', async () => {
    if (await p.locator('.chip[data-c="בן"]').count()) await p.click('.chip[data-c="בן"]');
    await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('.xc-row');
    assert.strictEqual(await p.inputValue('.xc-row [data-xf="c"]'), 'בן'); assert.ok((await p.locator('.xc-row .xc-cs').innerText()).includes('בן'));
    await p.fill('.xc-row [data-xf="a"]', '100'); await p.fill('.xc-row [data-xf="n"]', 'נסיעות'); await p.click('.xc-row >> nth=0 >> [data-xsave]'); await p.waitForFunction(() => !document.querySelector('.xc-row [data-xsave][disabled]') && document.querySelector('.xc-tot')); await p.click('#xc-done'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
  });
  await step('חשבון גובים: אצל בן נגבו 8,190 · הוצאות 100 · נטו 8,090 (הוצאה אחת)', async () => {
    const x = await collBen(); assert.strictEqual(x.debts, 8190); assert.strictEqual(x.exps.length, 1); assert.deepStrictEqual([x.exps[0].n, x.exps[0].a], ['נסיעות', 100]); assert.ok(x.exps[0].xk);
    if (await p.locator('.chip[data-c=""]').count()) await p.click('.chip[data-c=""]');
    await p.waitForFunction(() => [...document.querySelectorAll('.card')].some(c => (c.querySelector('h2')?.textContent || '').trim() === 'בן' && c.textContent.includes('8,090') && c.textContent.includes('הוצאות (1) · 100')), null, { timeout: 8000 });
  });
  await step('איסוף יום: אותה הוצאה אצל בן — נגבה בפועל 8,190, סה״כ הוצאות 100, נטו למסירה 8,090; בתאריך החשבון', async () => {
    const w = await api('GET', '/api/accounts/' + W); assert.strictEqual(w.expenses.length, 1); assert.deepStrictEqual([w.expenses[0].c, w.expenses[0].a, w.date], ['בן', 100, DATE]);
    assert.strictEqual(w.expenses[0]._k, (await collBen()).exps[0].xk, 'רשומה אחת משותפת');
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.wgcard'); const c = card('בן');
    assert.ok((await c.locator('.wg-got').innerText()).includes('8,190') && (await c.locator('.wg-exp').innerText()).includes('100') && (await c.locator('.wg-net').innerText()).includes('8,090'));
  });
  await step('״העבר לחשבון גובים״ שוב: אותו חשבון גובים מתעדכן, ההוצאה נספרת פעם אחת, נטו 8,090; גם אחרי רענון', async () => {
    const before = C; await transfer(); assert.strictEqual(C, before, 'לא נוצר חשבון גובים נוסף');
    assert.strictEqual((await api('GET', '/api/accounts?kind=collectors')).length, 1);
    const x = await collBen(); assert.strictEqual(x.debts, 8190); assert.strictEqual(x.exps.length, 1);
    await p.reload(); await p.waitForSelector('.card'); assert.ok((await card('בן').innerText()).includes('8,090'));
    const w = await api('GET', '/api/accounts/' + W); assert.strictEqual(w.expenses.length, 1);
  });
  await step('הסרה מתוך חשבון גובים מסירה את ההוצאה משתי הלשוניות', async () => {
    await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('#xc-list [data-xdl]');
    p.once('dialog', d => d.accept()); await p.click('#xc-list [data-xdl]'); await p.waitForTimeout(800);
    assert.strictEqual((await collBen()).exps.length, 0); assert.strictEqual((await api('GET', '/api/accounts/' + W)).expenses.length, 0);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
