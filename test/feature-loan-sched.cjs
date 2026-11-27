// בדיקת קבלה: לוח סילוקין בתוך ״בקשה חדשה״ (אייפון) — 10 תשלומים, חידוש (5,000 − 3,750 = 1,250), שמירה ופתיחה מחדש,
// אותו לוח כמו ב״הלוואות״, PDF ״הצעת הלוואה ולוח תשלומים״ (צפייה / הורדה / שיתוף הקובץ), ופתיחת ההלוואה לפי הלוח באישור המסירה.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8574, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ls-'));
const OUT = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ls-shots-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
(async () => {
  const LR = await import(path.join(ROOT, 'public/js/loan-renew.js')), C = await import(path.join(ROOT, 'public/js/calc.js'));
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__shared = []; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared.push({ n: d.files[0].name, t: d.files[0].type, s: d.files[0].size }); }; });
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  await api('POST', '/api/docs/loans', { id: 'Lold', data: { name: 'דוד כהן', phone: '0501234567', amount: 5000, rate: LR.solveRate(5000, 750, 10), n: 10, type: 'month', date: '2026-05-01', mode: 'n', paid: { 1: '2026-06-01', 2: '2026-07-01', 3: '2026-08-01', 4: '2026-09-01', 5: '2026-10-01' }, created: '' }, opId: 'lo' });
  const card = (n) => p.locator('.rq-item', { hasText: n });
  const rowsOf = (sel) => p.locator(sel + ' tbody tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())));
  const FIRST = '2026-12-15';
  let Q, tableForm;

  await step('״+ הוספת בקשה״: שם וסכום מהבקשה; חידוש (קיזוז 3,750, למסירה 1,250); ריבית 2%, חודשי, 10 תשלומים, תשלום ראשון 15.12 — סיכום ולוח מיידיים, 10 שורות, יתרה אחרונה 0', async () => {
    await p.goto(URL + '/#/requests-manage'); await p.waitForSelector('#rq-new'); await p.click('#rq-new');
    await p.fill('#rq-f-name', 'דוד כהן'); await p.fill('#rq-f-phone', '0501234567'); await p.fill('#rq-f-amount', '5000');
    await p.check('input[name="rq-f-lk"][value="renew"]'); await p.waitForFunction(() => document.querySelector('#rq-f-prev')?.value === 'Lold');
    assert.ok(/קיזוז חוב קודם:\s*3,750/.test(await p.innerText('#rq-f-calc')) && /סכום למסירה ללקוח:\s*1,250/.test(await p.innerText('#rq-f-calc')));
    await p.fill('#rq-t-rate', '2'); await p.fill('#rq-t-n', '10'); await p.fill('#rq-t-first', FIRST);
    await p.waitForSelector('#rq-t-sched tbody tr');
    const R = await rowsOf('#rq-t-sched'); assert.strictEqual(R.length, 10);
    assert.strictEqual(R[0][1], '15/12/2026'); assert.strictEqual(R[9][1], '15/09/2027'); assert.strictEqual(R[9][6], '0.00 ₪', 'יתרה אחרונה 0');
    const L = LR.loanFromTerms({ rate: '2', n: '10', type: 'month', mode: 'n', first: FIRST }, { amount: 5000, date: DATE }), s = C.lnSchedule(L);
    assert.ok((await p.innerText('#rq-t-prev')).includes(s.pay.toLocaleString('en-US', { minimumFractionDigits: 2 })), 'תשלום קבוע');
    assert.match(await p.innerText('#rq-t-prev'), /מספר תשלומים\s*10/); assert.match(await p.innerText('#rq-t-prev'), /סה״כ להחזר/); assert.match(await p.innerText('#rq-t-prev'), /סה״כ ריבית/);
    tableForm = await p.innerHTML('#rq-t-sched');
    // שינוי בתנאים — מתעדכן מיד; שבועי
    await p.click('#rq-t-segW'); assert.strictEqual((await rowsOf('#rq-t-sched'))[1][1], '22/12/2026'); await p.click('#rq-t-segM'); assert.strictEqual(await p.innerHTML('#rq-t-sched'), tableForm);
    await p.fill('#rq-f-chk', '10'); await p.fill('#rq-f-note', 'חידוש'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    Q = (await api('GET', '/api/docs/loan_requests')).find(q => q.name === 'דוד כהן');
    assert.strictEqual(Q.sched.n, 10); assert.strictEqual(Q.sched.rows[9].close, 0); assert.deepStrictEqual(Q.terms.first, FIRST); assert.strictEqual(Q.lk, 'renew'); assert.strictEqual(Q.chk, 10);
  });
  await step('אותו לוח בדיוק כמו ב״הלוואות״ (+ הלוואה חדשה) עם אותם נתונים', async () => {
    await p.goto(URL + '/#/loans'); await p.waitForSelector('#ln-new'); await p.click('#ln-new');
    await p.fill('#ln-f-name', 'דוד כהן'); await p.fill('#ln-f-amount', '5000'); await p.fill('#ln-f-date', DATE); await p.fill('#ln-f-rate', '2'); await p.fill('#ln-f-n', '10'); await p.fill('#ln-f-first', FIRST);
    await p.waitForSelector('#ln-sched tbody tr'); assert.strictEqual(await p.innerHTML('#ln-sched'), tableForm);
  });
  await step('אחרי רענון: בכרטיס הלוח השמור (10 שורות, יתרה 0, אותם תאריכים וסכומים); עריכה — הלוח נטען, שינוי ל-12 ושוב ל-10 נשמר באותה בקשה', async () => {
    await p.goto(URL + '/#/requests-manage'); await p.reload(); await card('דוד כהן').waitFor();
    await card('דוד כהן').locator('.rq-sch summary').click();
    const R = await rowsOf('.rq-item .rq-sch'); assert.strictEqual(R.length, 10); assert.strictEqual(R[9][6], '0.00 ₪');
    assert.strictEqual(await card('דוד כהן').locator('.rq-sch .ln-sched').innerHTML(), tableForm, 'הכרטיס = הטופס');
    await card('דוד כהן').locator('[data-rq-edit]').click(); await p.waitForSelector('#rq-t-sched tbody tr');
    assert.strictEqual(await p.inputValue('#rq-t-n'), '10'); assert.strictEqual(await p.inputValue('#rq-t-first'), FIRST); assert.strictEqual(await p.innerHTML('#rq-t-sched'), tableForm);
    await p.fill('#rq-t-n', '12'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    assert.strictEqual((await api('GET', '/api/docs/loan_requests/' + Q.id)).sched.n, 12);
    await card('דוד כהן').locator('[data-rq-edit]').click(); await p.fill('#rq-t-n', '10'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    const q = await api('GET', '/api/docs/loan_requests/' + Q.id); assert.strictEqual(q.sched.n, 10); assert.strictEqual((await api('GET', '/api/docs/loan_requests')).length, 1, 'אותה בקשה');
  });
  await step('״שלח ללקוח PDF״: ״הצעת הלוואה ולוח תשלומים״ עם השם, הסכום, הריבית, 10 תשלומים, סך ההחזר, הקיזוז והסכום למסירה; צפייה, הורדה ושיתוף הקובץ', async () => {
    await p.reload(); await card('דוד כהן').waitFor(); await card('דוד כהן').locator('[data-rq-pdf]').click();
    await p.waitForSelector('#rqp-share'); assert.match(await p.innerText('#sheet h2'), /הצעת הלוואה ולוח תשלומים · דוד כהן/);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rqp-dl')]); const f = path.join(OUT, 'offer.pdf'); await dl.saveAs(f);
    assert.strictEqual(fs.readFileSync(f).slice(0, 5).toString(), '%PDF-'); assert.match(dl.suggestedFilename(), /הצעת-הלוואה-דוד-כהן\.pdf/);
    assert.ok(await p.locator('#rqp-view').getAttribute('href'), 'צפייה');
    await p.click('#rqp-share'); await p.waitForFunction(() => window.__shared.length); const sh = await p.evaluate(() => window.__shared[0]); assert.strictEqual(sh.t, 'application/pdf');
    // תוכן המסמך = הלוח השמור (אותו HTML שממנו צויר ה-PDF)
    const pages = await p.evaluate(async (id) => { const m = await import('/js/features/loans-pdf.js'); const R = await import('/js/loan-renew.js'); const q = await (await fetch('/api/docs/loan_requests/' + id)).json(); const L = R.loanFromTerms(q.terms, { amount: q.amount, name: q.name, date: q.terms.date }); return m.lnSheetPages(L, { title: 'הצעת הלוואה ולוח תשלומים', extra: [['קיזוז חוב קודם', 3750], ['סכום למסירה ללקוח', 1250]] }).join(''); }, Q.id);
    for (const t of ['הצעת הלוואה ולוח תשלומים', 'דוד כהן', '5,000.00', '2%', '10 (חודשיים)', 'סה״כ להחזר', 'קיזוז חוב קודם', '3,750.00', 'סכום למסירה ללקוח', '1,250.00', '15/12/2026', '15/09/2027']) assert.ok(pages.includes(t), t);
    const q = await api('GET', '/api/docs/loan_requests/' + Q.id); for (const x of q.sched.rows) { assert.ok(pages.includes(x.date.split('-').reverse().join('/')), x.date); assert.ok(pages.includes(x.payment.toLocaleString('en-US', { minimumFractionDigits: 2 })), String(x.payment)); }
    execFileSync('pdftoppm', ['-r', '70', '-png', '-f', '1', '-l', '1', f, path.join(OUT, 'offer')]);
    await p.click('#sheet [data-close]');
  });
  await step('אישור המסירה: ההלוואה נפתחת לפי הלוח השמור (אותם תאריכים וסכומים), פעם אחת; הוצאה 1,250; אין שגיאות דף', async () => {
    const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'w' });
    await api('POST', '/api/loan-req/xfer', { id: Q.id, kind: 'work', date: DATE, accId: W, opId: 'x' });
    await api('POST', '/api/loan-req/give', { id: Q.id, c: 'טל', opId: 'g1' }); await api('POST', '/api/loan-req/give', { id: Q.id, c: 'טל', opId: 'g2' });
    const L = (await api('GET', '/api/docs/loans')).filter(l => l.fromReq === Q.id); assert.strictEqual(L.length, 1);
    const s = C.lnSchedule(L[0]), q = await api('GET', '/api/docs/loan_requests/' + Q.id);
    assert.deepStrictEqual(s.rows.map(x => [x.date, x.payment, x.close]), q.sched.rows.map(x => [x.date, x.payment, x.close]));
    assert.strictEqual((await api('GET', '/api/accounts/' + W)).expenses.filter(x => x.lr === Q.id)[0].a, 1250);
    await p.reload(); await card('דוד כהן').waitFor(); assert.match(await card('דוד כהן').locator('.rq-sch summary').innerText(), /^לוח התשלומים/);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill(); console.log('   ' + OUT);
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
