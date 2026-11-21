// בדיקת היכולת ״דוחות״: ניתוחים, חשבון מודפס, סרגל חלוקת הריבית, לוח בקרה, חיפוש שמורים, הרשאות.
// הרצה: BACKUP=path/to/backup.json node test/feature-reports.cjs   (פורט ברירת מחדל 8306)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-reports');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-rep-'));
const PORT = +process.env.E2E_PORT || 8306, URL = 'http://localhost:' + PORT;
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false }); console.log('✗', name, '\n   ', e.message.split('\n').slice(0, 3).join('\n    ')); } };

(async () => {
  const calc = await import(path.join(ROOT, 'public/js/calc.js'));
  const P = await import(path.join(ROOT, 'public/js/features/reports-print.js'));
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP };
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 60 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const api = async (ctx, method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const login = async (pg, u, p) => { await pg.goto(URL + '/#/login'); await pg.fill('input[name=u]', u); await pg.fill('input[name=p]', p); await pg.click('form button'); await pg.waitForSelector('.kpis'); };

  const desk = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true });
  const d = await desk.newPage(); const errs = []; d.on('pageerror', e => errs.push(e.message)); d.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await login(d, 'owner', 'Owner-pass-1');
  let all = [];

  await step('השרת מחזיר את כל החשבונות המלאים למורשה כספים', async () => {
    const r = await api(desk, 'GET', '/api/reports/accounts'); assert.strictEqual(r.status, 200);
    all = r.json; const meta = (await api(desk, 'GET', '/api/accounts')).json;
    assert.strictEqual(all.length, meta.length); assert.ok(all.some(a => a.kind === 'morning' && (a.rows || []).length));
  });

  await step('ניתוחים: סכומי התקופה שווים לסכום calcMorning על הנתונים האמיתיים', async () => {
    const ms = all.filter(a => a.kind === 'morning' && a.date).sort((x, y) => x.date.localeCompare(y.date));
    const from = ms[Math.max(0, ms.length - 12)].date, to = ms[ms.length - 2].date;
    const inR = ms.filter(a => a.date >= from && a.date <= to);
    const S = (f) => calc.r2(inR.reduce((t, a) => calc.r2(t + calc.calcMorning(a)[f]), 0));
    const exp = { interest: S('interest'), principal: S('principal'), robi: S('robi'), line: S('line'), loans: S('loansTotal'), courier: S('courier') };
    await d.goto(URL + `/#/analytics?from=${from}&to=${to}`); await d.waitForSelector('#an-kpis .kpi');
    const kv = await d.$$eval('#an-kpis .kpi', els => els.map(e => [e.querySelector('.kl').textContent, e.querySelector('.kv').textContent]));
    const val = (label) => kv.find(k => k[0].startsWith(label))[1];
    assert.strictEqual(val('ריבית שנגבתה'), P.fmt(exp.interest) + ' ₪');
    assert.strictEqual(val('קרן שנגבתה'), P.fmt(exp.principal) + ' ₪');
    assert.strictEqual(val('חלק רובי'), P.fmt(exp.robi) + ' ₪');
    assert.strictEqual(val('חלק הקו'), P.fmt(exp.line) + ' ₪');
    assert.strictEqual(val('הלוואות שניתנו'), P.fmt(exp.loans) + ' ₪');
    assert.strictEqual(val('משלוחים'), P.fmt(exp.courier) + ' ₪');
    const kStart = calc.calcMorning(inR[0]).keren, kEnd = calc.calcMorning(inR[inR.length - 1]).final;
    assert.strictEqual(val('שינוי בקרן'), P.fmt(calc.r2(kEnd - kStart)) + ' ₪');
    assert.ok(await d.locator('svg.chart').count() >= 2, 'גרפים');
    await d.screenshot({ path: path.join(OUT, 'r1-analytics.png'), fullPage: true });
    // דוח תקופה PDF
    const [dl] = await Promise.all([d.waitForEvent('download', { timeout: 60000 }), d.click('#an-pdf')]);
    // (כרום ללא מסך מדווח שם קובץ בעברית כ-download; בודקים את התוכן ואת השם שמוצג למשתמש)
    assert.strictEqual(fs.readFileSync(await dl.path()).subarray(0, 4).toString(), '%PDF');
    await d.waitForSelector('#an-share a[href^="https://wa.me/?text="]');
    assert.ok(/דוח-תקופה-.*\.pdf/.test(await d.locator('#an-share').innerText()));
  });

  let mId, mDoc;
  await step('חשבון בוקר מודפס: הסה״כ הסופי שווה ל-calcMorning + השוואה לחשבון הקודם', async () => {
    const ms = all.filter(a => a.kind === 'morning' && (a.rows || []).length).sort((x, y) => x.date.localeCompare(y.date));
    mDoc = ms[ms.length - 1]; mId = mDoc.id;
    await d.goto(URL + '/#/acc/' + mId); await d.waitForSelector('tr.final');
    await d.click('button:has-text("דוח להדפסה / שיתוף")'); await d.waitForSelector('#r-report tr.final');
    const fin = (await d.locator('#r-report tr.final td.a').innerText()).trim();
    assert.strictEqual(fin, P.fmt(calc.calcMorning(mDoc).final) + ' ₪');
    assert.ok(await d.locator('#m-yday').count(), 'השוואה לחשבון הקודם');
    const href = await d.locator('a.btn.wa').getAttribute('href');
    assert.ok(decodeURIComponent(href).includes('סה״כ סופי: ' + P.fmt(calc.calcMorning(mDoc).final)));
    await d.screenshot({ path: path.join(OUT, 'r2-morning-report.png'), fullPage: true });
    const [dl] = await Promise.all([d.waitForEvent('download', { timeout: 60000 }), d.click('#r-pdf')]);
    assert.strictEqual(fs.readFileSync(await dl.path()).subarray(0, 4).toString(), '%PDF');
    assert.ok(/חשבון-בוקר-.*\.pdf/.test(await d.locator('#s-share').innerText()));
  });

  await step('סרגל חלוקת הריבית: שינוי נשמר בשרת ומחשב מחדש', async () => {
    await d.goto(URL + '/#/acc/' + mId); await d.waitForSelector('#m-rp-range');
    await d.$eval('#m-rp-range', el => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await d.waitForFunction(() => document.querySelector('#m-rp-v') && document.querySelector('#m-rp-v').textContent === '40%' && document.body.innerText.includes('רובי (40%)'), null, { timeout: 10000 });
    const doc = (await api(desk, 'GET', '/api/accounts/' + mId)).json; assert.strictEqual(doc.rp, 40);
    const c40 = calc.calcMorning(doc); assert.strictEqual(c40.rp, 40);
    const fin = (await d.locator('tr.final td.a').first().innerText()).replace(/[^\d.\-−]/g, '');
    assert.strictEqual(+fin.replace('−', '-'), c40.final, 'סופי אחרי שינוי: ' + fin);
    assert.notStrictEqual(c40.final, calc.calcMorning(mDoc).final);
    await d.screenshot({ path: path.join(OUT, 'r3-rp-slider.png'), fullPage: true });
    await d.click('#m-rp-reset'); await d.waitForFunction(() => document.body.innerText.includes('רובי (25%)'), null, { timeout: 10000 });
    const back = (await api(desk, 'GET', '/api/accounts/' + mId)).json; assert.ok(!('rp' in back), 'rp הוסר כשהוא 25');
    assert.strictEqual(calc.calcMorning(back).final, calc.calcMorning(mDoc).final);
  });

  await step('לוח בקרה, התראות במסך היום, חיפוש בחשבונות שמורים עם הדגשה', async () => {
    await d.goto(URL + '/#/dashboard'); await d.waitForSelector('#h-steps .step'); assert.strictEqual(await d.locator('#h-steps .step').count(), 4);
    assert.ok(await d.locator('#h-recent .rc').count() > 0); assert.ok(await d.locator('#h-kpis .kpi').count() === 5);
    await d.screenshot({ path: path.join(OUT, 'r4-dashboard.png'), fullPage: true });
    await d.goto(URL + '/#/today'); await d.waitForSelector('#rep-today-alerts .alerts');
    const row = (mDoc.rows || []).find(r => r.i);
    await d.goto(URL + '/#/saved'); await d.waitForSelector('#s-list'); await d.fill('#s-name', String(row.n).split(' ')[0]); await d.fill('#s-amount', String(row.i)); await d.selectOption('#s-type', 'ריבית');
    await d.waitForSelector('.hitrow'); await d.locator(`.hitrow[href^="#/report/${mId}"]`).first().click();
    await d.waitForSelector('#r-report tr.hit'); assert.ok((await d.locator('#r-report tr.hit').first().innerText()).includes(String(row.n).split(' ')[0]));
    await d.screenshot({ path: path.join(OUT, 'r5-saved-hit.png'), fullPage: true });
  });

  await step('אייפון: לוח בקרה וניתוחים בלי גלילה רוחבית', async () => {
    const ph = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' }); const p = await ph.newPage();
    await login(p, 'owner', 'Owner-pass-1');
    for (const h of ['#/dashboard', '#/analytics?range=all', '#/report/' + mId]) {
      await p.goto(URL + '/' + h); await p.waitForSelector('.rpx'); await p.waitForTimeout(300);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 1, h + ' רוחב עודף ' + over);
    }
    await p.screenshot({ path: path.join(OUT, 'r6-iphone-report.png'), fullPage: true }); await ph.close();
  });

  await step('גובה לא יכול לגשת לדוחות', async () => {
    await api(desk, 'POST', '/api/users', { username: 'ben', password: 'Ben-pass-12', role: 'collector', name: 'בן', collector_name: 'בן' });
    const g = await b.newContext({ ...devices['iPhone 13'] }); const gp = await g.newPage();
    await login(gp, 'ben', 'Ben-pass-12');
    assert.strictEqual((await api(g, 'GET', '/api/reports/accounts')).status, 403);
    for (const h of ['#/analytics', '#/dashboard', '#/saved', '#/report/' + mId]) { await gp.goto(URL + '/' + h); await gp.waitForSelector('h1:has-text("אין הרשאה")'); }
    await gp.goto(URL + '/#/more'); await gp.waitForTimeout(300); assert.strictEqual(await gp.locator('a[href="#/analytics"]').count(), 0);
    await g.close();
  });
  await step('אין שגיאות בדפדפן', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} עברו. צילומי מסך: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
