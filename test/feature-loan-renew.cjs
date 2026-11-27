// בדיקת קבלה: חידוש הלוואה בבקשות להלוואה (אייפון) — 5,000 ב-10 תשלומים של 750, שולמו 5 → יתרה 3,750; חידוש על 5,000 → ללקוח 1,250.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8573, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-rn-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
(async () => {
  const LR = await import(path.join(ROOT, 'public/js/loan-renew.js'));
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  // ההלוואה הקודמת של דוד כהן: 5,000 ב-10 תשלומים של 750; שולמו 5
  const rate = LR.solveRate(5000, 750, 10);
  await api('POST', '/api/docs/loans', { id: 'Lold', data: { name: 'דוד כהן', phone: '', amount: 5000, rate, n: 10, type: 'month', date: '2026-05-01', mode: 'n', paid: { 1: '2026-06-01', 2: '2026-07-01', 3: '2026-08-01', 4: '2026-09-01', 5: '2026-10-01' }, created: '' }, opId: 'lo' });
  await api('POST', '/api/docs/loans', { id: 'Loth', data: { name: 'משה לוי', phone: '', amount: 2000, rate: 0, n: 4, type: 'month', date: '2026-08-01', mode: 'n', paid: {}, created: '' }, opId: 'lo2' });
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'w' });
  const card = (n) => p.locator('.rq-item', { hasText: n });
  const reqs = async () => api('GET', '/api/docs/loan_requests');
  const loanExp = async () => (await api('GET', '/api/accounts/' + W)).expenses.filter(x => x.lr);
  let QD, QR;

  await step('טופס: ״חידוש הלוואה״ → בחירת ההלוואה הקודמת (5,000 · 10 תשלומים · יתרה 3,750) → קיזוז 3,750, סכום למסירה 1,250 — כבר בזמן ההקלדה', async () => {
    await p.goto(URL + '/#/requests-manage'); await p.waitForSelector('#rq-new'); await p.click('#rq-new');
    await p.fill('#rq-f-name', 'דוד כהן'); await p.fill('#rq-f-amount', '5000');
    assert.match(await p.innerText('#rq-f-calc'), /סכום ההלוואה שנרשם:\s*5,000[\s\S]*סכום למסירה ללקוח:\s*5,000/);
    await p.check('input[name="rq-f-lk"][value="renew"]'); await p.waitForFunction(() => [...document.querySelectorAll('#rq-f-prev option')].some(o => o.value === 'Lold'));
    assert.strictEqual(await p.inputValue('#rq-f-prev'), 'Lold', 'נבחרה אוטומטית — ההלוואה הפתוחה היחידה של הלקוח');
    assert.match(await p.locator('#rq-f-prev option[value="Lold"]').innerText(), /יתרה 3,750/);
    const t = await p.innerText('#rq-f-calc'); assert.ok(/סכום ההלוואה שנרשם:\s*5,000/.test(t) && /קיזוז חוב קודם:\s*3,750/.test(t) && /סכום למסירה ללקוח:\s*1,250/.test(t), t);
    await p.fill('#rq-f-note', '750 כפול 10'); await p.fill('#rq-f-chk', '10'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    QD = (await reqs()).find(q => q.name === 'דוד כהן'); assert.strictEqual(QD.lk, 'renew'); assert.strictEqual(QD.prevLoan, 'Lold');
  });
  await step('כרטיס הבקשה (ממתינה): ״סכום ההלוואה שנרשם 5,000 · קיזוז חוב קודם 3,750 · סכום למסירה ללקוח 1,250״ — גם אחרי רענון', async () => {
    await p.reload(); await card('דוד כהן').waitFor();
    const t = await card('דוד כהן').locator('.rq-amts').innerText();
    assert.ok(/סכום ההלוואה שנרשם:\s*5,000/.test(t) && /קיזוז חוב קודם:\s*3,750/.test(t) && /סכום למסירה ללקוח:\s*1,250/.test(t) && /חידוש הלוואה/.test(t), t);
    // הלוואה חדשה רגילה
    await p.click('#rq-new'); await p.fill('#rq-f-name', 'רון לוי'); await p.fill('#rq-f-amount', '5000'); await p.fill('#rq-f-chk', '5'); await p.fill('#rq-f-note', '1100 כפול 5'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    QR = (await reqs()).find(q => q.name === 'רון לוי'); assert.strictEqual(QR.lk, 'new');
    assert.match(await card('רון לוי').locator('.rq-amts').innerText(), /סכום ההלוואה שנרשם:\s*5,000[\s\S]*סכום למסירה ללקוח:\s*5,000[\s\S]*הלוואה חדשה/);
  });
  await step('העברה ל״איסוף יום״: אותם שלושה סכומים ביעד; ההעברה לא רושמת שום דבר כספי', async () => {
    for (const q of [QD, QR]) await api('POST', '/api/loan-req/xfer', { id: q.id, kind: 'work', date: DATE, accId: W, opId: 'x' + q.id });
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#lrq-panel .lrq-item');
    const t = await p.locator('#lrq-panel .lrq-item', { hasText: 'דוד כהן' }).innerText();
    assert.ok(/סכום ההלוואה שנרשם:\s*5,000/.test(t) && /קיזוז חוב קודם:\s*3,750/.test(t) && /סכום למסירה ללקוח:\s*1,250/.test(t), t);
    assert.strictEqual((await loanExp()).length, 0); assert.strictEqual((await api('GET', '/api/docs/loans')).length, 2);
  });
  await step('אישור המסירה (לחיצה כפולה): הוצאה של 1,250 בלבד; הלוואה חדשה של 5,000; בהלוואה הקודמת 3,750 ״קוזזה בחידוש״ ואין יתרה לגבייה', async () => {
    const it = p.locator('#lrq-panel .lrq-item', { hasText: 'דוד כהן' });
    await p.waitForFunction(() => [...document.querySelectorAll('[data-lrc] option')].length > 1).catch(() => {});
    await it.locator('[data-lrc]').selectOption({ index: 1 }).catch(async () => { await it.locator('[data-lrc]').evaluate(s => { s.insertAdjacentHTML('beforeend', '<option>טל</option>'); s.value = 'טל'; s.dispatchEvent(new Event('change', { bubbles: true })); }); });
    await it.locator('[data-lrok]').dblclick();
    await p.waitForFunction(() => [...document.querySelectorAll('#lrq-panel .lrq-item')].some(x => x.textContent.includes('דוד כהן') && x.textContent.includes('אושרה ונמסרה')), null, { timeout: 8000 });
    const X = await loanExp(); assert.strictEqual(X.length, 1); assert.strictEqual(X[0].a, 1250, 'הוצאה = הסכום שנמסר');
    const L = await api('GET', '/api/docs/loans'); assert.strictEqual(L.length, 3);
    const nl = L.find(l => l.fromReq === QD.id); assert.strictEqual(nl.amount, 5000); assert.strictEqual(nl.renewOf, 'Lold'); assert.strictEqual(nl.n, 10);
    const old = L.find(l => l.id === 'Lold'); assert.strictEqual(LR.loanOwe(old).owe, 0, 'אין יתרה פתוחה'); assert.strictEqual(old.offsetBy.a, 3750);
    assert.strictEqual(old.hist.filter(h => h.t === 'offset').length, 5); assert.ok(old.hist.every(h => h.t !== 'offset' || h.n === 'קוזזה בחידוש'));
    assert.match(await it.innerText(), /הלקוח קיבל בפועל:\s*1,250/);
  });
  await step('כרטיס הבקשה אחרי המסירה: ״הלקוח קיבל בפועל: 1,250 ₪״ (וגם הנרשם והקיזוז); ההלוואה הקודמת מסומנת ״קוזזה בחידוש״ במסך ההלוואות', async () => {
    await p.goto(URL + '/#/requests-manage'); await p.reload(); await card('דוד כהן').waitFor();
    const t = await card('דוד כהן').locator('.rq-amts').innerText();
    assert.ok(/סכום ההלוואה שנרשם:\s*5,000/.test(t) && /קיזוז חוב קודם:\s*3,750/.test(t) && /הלקוח קיבל בפועל:\s*1,250/.test(t) && !/סכום למסירה/.test(t), t);
    const st = await p.evaluate(async () => { const c = await import('/js/calc.js'); const L = await (await fetch('/api/docs/loans/Lold')).json(); return c.lnStatus(L).txt; }); assert.strictEqual(st, 'קוזזה בחידוש');
  });
  await step('לחיצה חוזרת על האישור, ומעבר לשונית ואישור שוב — אין הלוואה, הוצאה או קיזוז כפולים', async () => {
    const r = await api('POST', '/api/loan-req/give', { id: QD.id, c: 'טל', opId: 'again' }); assert.ok(r.already);
    await api('POST', '/api/loan-req/xfer', { id: QD.id, kind: 'split', date: DATE, opId: 'mv1' }); await api('POST', '/api/loan-req/xfer', { id: QD.id, kind: 'work', date: DATE, accId: W, opId: 'mv2' });
    const r2 = await api('POST', '/api/loan-req/give', { id: QD.id, c: 'טל', opId: 'again2' }); assert.ok(r2.already);
    assert.strictEqual((await loanExp()).length, 1); assert.strictEqual((await api('GET', '/api/docs/loans')).length, 3);
    assert.strictEqual((await api('GET', '/api/docs/loans/Lold')).hist.filter(h => h.t === 'offset').length, 5);
  });
  await step('הלוואה חדשה רגילה: קיזוז 0; אחרי המסירה ״סכום ההלוואה שנרשם: 5,000״ וגם ״הלקוח קיבל בפועל: 5,000״; הוצאה 5,000; אין שגיאות דף', async () => {
    await api('POST', '/api/loan-req/give', { id: QR.id, c: 'טל', chk: 5, opId: 'gr' });
    const X = (await loanExp()).find(x => x.lr === QR.id); assert.strictEqual(X.a, 5000);
    const nl = (await api('GET', '/api/docs/loans')).find(l => l.fromReq === QR.id); assert.strictEqual(nl.amount, 5000); assert.ok(!nl.renewOf); assert.strictEqual(nl.n, 5);
    await p.reload(); await card('רון לוי').waitFor();
    const t = await card('רון לוי').locator('.rq-amts').innerText(); assert.ok(/סכום ההלוואה שנרשם:\s*5,000/.test(t) && /הלקוח קיבל בפועל:\s*5,000/.test(t) && !/קיזוז/.test(t), t);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
