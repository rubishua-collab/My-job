// בדיקת ״הוסף הוצאה״ ב״פיצול״ וב״איסוף יום״: שיוך לגובה לפי שם מוקלד, הצגה בשתי הלשוניות, נטו למסירה, ספירה אחת.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8450, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-dx-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (c) => { const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await login(ctx);
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const mk = async (kind, fill, op) => { const { id } = await api('POST', '/api/accounts', { kind, date: '2026-11-22', opId: op }); const a = await api('GET', '/api/accounts/' + id); const data = { ...a, ...fill }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: op + 'f' }); return id; };
  const R = (n, a, c, t) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t: t || '', cnt: 1, side: false });
  const SP = await mk('split', { records: [R('בן דבש', 900, 'טל'), R('אבי כהן', 2000, 'בן'), R('דנה לוי', 500, 'בן', '15:00'), R('רון שמש', 300, 'בנימין')] }, 's');
  const W = await mk('work', { entries: [{ n: 'אבי כהן', p: '', a: 2000, c: 'בן', t: '10:00', s: 'נאסף', ga: 2000 }, { n: 'דנה לוי', p: '', a: 500, c: 'בן', t: '15:00', s: '' }], expenses: [] }, 'w');
  const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });

  await step('״פיצול״: כפתור ״הוצאות של גובה״ בשורת הפעולות העליונה; הקלדת ״בן״ בוחרת את הגובה בן (לא את הלקוח ״בן דבש״)', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('.band [data-xact]');
    await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('.xc-row');
    await p.fill('.xc-row [data-xf="c"]', 'ב'); const sug = await p.locator('.xc-row .xc-sug').innerText();
    assert.ok(sug.includes('בן') && sug.includes('בנימין') && !sug.includes('דבש'), 'הצעות מרשימת הגובים בלבד: ' + sug);
    await p.fill('.xc-row [data-xf="c"]', 'בן'); assert.ok((await p.locator('.xc-row .xc-cs').innerText()).includes('✓ בן'));
    await p.fill('.xc-row [data-xf="a"]', '150'); await p.fill('.xc-row [data-xf="n"]', 'דלק'); await p.click('.xc-row >> nth=0 >> [data-xsave]'); await p.waitForFunction(() => !document.querySelector('.xc-row [data-xsave][disabled]') && document.querySelector('.xc-tot')); await p.click('#xc-done'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
  });
  await step('״פיצול״: אצל בן ״הוצאות״ עם שעה, תיאור וסכום; נגבה 2,000 · הוצאות 150 · נטו למסירה 1,850', async () => {
    await p.waitForSelector('.dayx'); const t = await card('בן').innerText();
    assert.ok(/\d\d:\d\d · דלק\s+150 ₪/.test(t), t); assert.ok(/נגבה בפועל \(איסוף יום\)\s+2,000 ₪/.test(t) && /סה״כ הוצאות\s+150 ₪/.test(t) && /נטו למסירה\s+1,850 ₪/.test(t), t);
    assert.ok((await card('בן').innerText()).includes('2,500'), 'סכום החובות בפיצול לא השתנה');
  });
  await step('״איסוף יום״ באותו תאריך, סינון ״בן״: שורה אחת ״דלק — 150 ₪״; נגבה 2,000, הוצאות 150, נטו למסירה 1,850; הצפוי נשאר 2,500', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.wgcard'); if (await p.locator('.chip[data-c="בן"]').count()) { await p.click('.chip[data-c="בן"]'); await p.waitForTimeout(200); }
    const c = card('בן'); assert.strictEqual(await c.locator('.wg-x .li').count(), 1); assert.ok(/דלק\s+150 ₪/.test(await c.locator('.wg-x').innerText()));
    assert.ok((await c.locator('.wg-got').innerText()).includes('2,000') && (await c.locator('.wg-exp').innerText()).includes('150') && (await c.locator('.wg-net').innerText()).includes('1,850'));
    assert.ok(/גבייה ברוטו \(צפוי\)\s*2,500/.test(await c.innerText()));
    if (await p.locator('.chip[data-c=""]').count()) await p.click('.chip[data-c=""]');
  });
  await step('״איסוף יום״ → ״הוצאות של גובה״ → ״הוסף הוצאה״ לגובה טל (בלי גביות היום) → מופיע ברשימה של טל גם ב״פיצול״', async () => {
    await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('.xc-row');
    await p.fill('.xc-row [data-xf="c"]', 'טל'); await p.fill('.xc-row [data-xf="a"]', '40'); await p.fill('.xc-row [data-xf="n"]', 'חניה'); await p.click('.xc-row >> nth=0 >> [data-xsave]'); await p.waitForFunction(() => !document.querySelector('.xc-row [data-xsave][disabled]') && document.querySelector('.xc-tot')); await p.click('#xc-done'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
    await p.waitForSelector('.wgcard[data-wg="טל"]'); assert.ok(/חניה\s+40 ₪/.test(await card('טל').innerText()), 'כרטיס לטל גם בלי גביות');
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('.dayx');
    assert.ok(/חניה\s+40 ₪/.test(await card('טל').innerText()));
  });
  await step('כל הוצאה נשמרת פעם אחת: אחרי רענון, מעבר בין הלשוניות והעברה לאיסוף — 2 הוצאות, נטו של בן 1,850', async () => {
    const recs = (await api('GET', '/api/accounts/' + SP)).records; const dn = recs.find(r => r.n === 'דנה לוי');
    const sp = await api('GET', '/api/accounts/' + SP);
    await api('POST', '/api/split-tools/xfer', { splitId: SP, date: '2026-11-22', baseVersion: sp._version, entries: [{ sid: dn._k, n: dn.n, a: dn.a, c: dn.c, t: '15:00' }], opId: 'xf1' });
    await api('POST', '/api/split-tools/xfer', { splitId: SP, date: '2026-11-22', baseVersion: sp._version, entries: [{ sid: dn._k, n: dn.n, a: dn.a, c: dn.c, t: '15:00' }], opId: 'xf1' }); // ניסיון חוזר
    const works = (await api('GET', '/api/accounts?kind=work')); assert.strictEqual(works.length, 1, 'רשימת איסוף אחת לתאריך');
    const w = await api('GET', '/api/accounts/' + W); assert.strictEqual(w.expenses.length, 2);
    assert.ok(!(await api('GET', '/api/accounts/' + SP)).expenses, 'ההוצאה לא נשמרת בפיצול');
    await p.reload(); await p.waitForSelector('.dayx'); assert.strictEqual(await card('בן').locator('.dayx .li').count(), 1);
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.wgcard'); assert.ok((await card('בן').locator('.wg-net').innerText()).includes('1,850'));
    assert.strictEqual(await card('בן').locator('.wg-x .li').count(), 1);
  });
  await step('לחיצה כפולה על ״שמור הוצאה״ לא רושמת פעמיים, ואין שגיאות דף', async () => {
    await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('.xc-row');
    await p.fill('.xc-row [data-xf="c"]', 'בנימין'); await p.fill('.xc-row [data-xf="a"]', '25'); await p.fill('.xc-row [data-xf="n"]', 'קפה'); await p.locator('.xc-row [data-xsave]').dblclick(); await p.waitForTimeout(800);
    assert.strictEqual((await api('GET', '/api/accounts/' + W)).expenses.filter(x => x.n === 'קפה').length, 1);
    await p.screenshot({ path: path.join(os.tmpdir(), 'day-expense-iphone.png') }); assert.deepStrictEqual(p.errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
