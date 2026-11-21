// בדיקת הלוואות ובקשות להלוואה: יצירה בשני המצבים, לוח סילוקין = lnSchedule, תשלום מלא / חלקי / ביטול, יתרה לפי lnSum,
// מניעת רישום כפול (opId), התנגשות גרסאות, PDF, מחיקה, תיק ההלוואות במסך ״היום״, ובקשות: יצירה, עריכה, חיפוש, סכומים, מחיקה.
// הרצה: BACKUP=path/to/backup.json node test/feature-loans.cjs   (פורט 8304)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-loans');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-loans-data-'));
const PORT = +process.env.E2E_PORT || 8304, URL = 'http://localhost:' + PORT;
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false, err: e.message }); console.log('✗', name, '\n   ', (e.stack || e.message).split('\n').slice(0, 6).join('\n    ')); } };
const lnFmt = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₪';
const numOf = s => +String(s).replace(/[^\d.\-]/g, '');

(async () => {
  const calc = await import(path.join(ROOT, 'public/js/calc.js'));
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP || '', TZ: 'Asia/Jerusalem' };
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 60 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept()); p.setDefaultTimeout(8000);
  const api = async (method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: false });
  const doc = async id => (await api('GET', '/api/docs/loans/' + id)).json;
  const kpiVal = async label => (await p.locator('#ln-kpis .kpi', { hasText: label }).locator('.v').innerText()).trim();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  const selectedId = async () => p.locator('.ln-item[aria-current="true"]').getAttribute('data-ln-id');
  // השוואת טבלת הלוח שבמסך מול lnSchedule
  const checkTable = async (sel, L) => {
    const s = calc.lnSchedule(L); assert.ok(s, 'אין לוח');
    const rows = await p.$$eval(sel + ' tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())));
    assert.strictEqual(rows.length, s.rows.length, 'מספר שורות');
    s.rows.forEach((x, k) => {
      const r = rows[k];
      assert.strictEqual(+r[0], x.i);
      const [d, m, y] = r[1].split('/'); assert.strictEqual(`${y}-${m}-${d}`, x.date, 'תאריך ' + x.i);
      [x.open, x.payment, x.interest, x.principal, x.close].forEach((v, j) => assert.strictEqual(r[2 + j], lnFmt(v), `שורה ${x.i} עמודה ${j}`));
    });
    const foot = await p.$$eval(sel + ' tfoot td', tds => tds.map(t => t.innerText.trim()));
    assert.strictEqual(foot[1], lnFmt(s.totalPay)); assert.strictEqual(foot[2], lnFmt(s.totalInt));
    return s;
  };

  await step('כניסה', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
  });

  await step('תפריט ״עוד״ מציג את מסכי ההלוואות והבקשות', async () => {
    await p.goto(URL + '/#/more'); await p.waitForSelector('a[href="#/loans-manage"]'); await p.waitForSelector('a[href="#/requests-manage"]');
  });

  await step('ההלוואות מהגיבוי מוצגות, הלוח שלהן = lnSchedule', async () => {
    await p.goto(URL + '/#/loans-manage'); await p.waitForSelector('.ln-item');
    const all = (await api('GET', '/api/docs/loans')).json;
    assert.strictEqual(await p.locator('.ln-item').count(), all.length);
    const L = all[0]; await p.click(`.ln-item[data-ln-id="${L.id}"]`); await p.waitForSelector('#ln-tbl');
    await checkTable('#ln-tbl', L);
    const s = calc.lnSum(L); assert.strictEqual(await kpiVal('יתרת קרן'), lnFmt(s.remain));
  });

  let idN, idP;
  await step('הלוואה חדשה לפי מספר תשלומים: תצוגה מקדימה ולוח = lnSchedule', async () => {
    await p.click('#ln-new'); await p.fill('#ln-f-name', 'בדיקה מספר תשלומים'); await p.fill('#ln-f-phone', '050-1234567');
    await p.fill('#ln-f-amount', '10000'); await p.fill('#ln-f-rate', '3'); await p.fill('#ln-f-n', '12'); await p.fill('#ln-f-date', '2026-09-30');
    const L = { amount: 10000, rate: 3, n: 12, type: 'month', mode: 'n', date: '2026-09-30' };
    const s = await checkTable('#ln-sched', L);
    assert.ok((await p.innerText('#ln-prev')).includes(lnFmt(s.pay)));
    await shot('01-new-loan-n');
    await p.click('#ln-save'); await p.waitForSelector('#ln-detail .ln-dh h2:text-is("בדיקה מספר תשלומים")');
    idN = await selectedId(); const d = await doc(idN);
    assert.strictEqual(d.name, 'בדיקה מספר תשלומים'); assert.strictEqual(d.n, 12); assert.strictEqual(d.mode, 'n'); assert.deepStrictEqual(d.paid, {});
    await checkTable('#ln-tbl', d);
    // תאריך מתן בעבר => יש תשלומים בפיגור
    const st = calc.lnStatus(d); assert.ok((await p.locator('#ln-detail .ln-dh .pill').innerText()).includes(st.txt));
  });

  await step('הלוואה חדשה לפי החזר קבוע (שבועית): הלוח = lnSchedulePay, ההחזר הנמוך מדי נחסם', async () => {
    await p.click('#ln-new'); await p.click('#ln-seg-w'); await p.click('#ln-seg-p');
    await p.fill('#ln-f-name', 'בדיקה החזר קבוע'); await p.fill('#ln-f-amount', '5000'); await p.fill('#ln-f-rate', '2'); await p.fill('#ln-f-pay', '100');
    assert.ok((await p.innerText('#ln-prev')).includes('ההחזר נמוך מדי'));
    await p.fill('#ln-f-pay', '600');
    const L = { amount: 5000, rate: 2, payAmt: 600, type: 'week', mode: 'pay', date: today };
    const s = await checkTable('#ln-sched', L);
    await p.click('#ln-save'); await p.waitForSelector('#ln-detail .ln-dh h2:text-is("בדיקה החזר קבוע")');
    idP = await selectedId(); const d = await doc(idP);
    assert.strictEqual(d.mode, 'pay'); assert.strictEqual(d.type, 'week'); assert.strictEqual(d.n, s.rows.length); assert.strictEqual(d.payAmt, 600);
    await checkTable('#ln-tbl', d);
  });

  await step('רישום תשלום מלא: נשמר, ביומן, והיתרה = lnSum', async () => {
    await p.click(`.ln-item[data-ln-id="${idN}"]`); await p.waitForSelector('#ln-tbl');
    await p.click('[data-ln-i="1"]'); await p.waitForSelector('#ln-payask');
    await shot('02-payask');
    await p.click('[data-lnp="ok"]'); await p.waitForSelector('[data-ln-i="1"].on');
    const d = await doc(idN); assert.strictEqual(d.paid[1], today); assert.strictEqual(d.hist.length, 1); assert.strictEqual(d.hist[0].t, 'pay');
    const s = calc.lnSum(d); assert.strictEqual(await kpiVal('יתרת קרן'), lnFmt(s.remain)); assert.strictEqual(await kpiVal('שולם עד כה'), lnFmt(s.paidSum));
    assert.ok(await p.locator('#ln-hist tr', { hasText: 'רישום תשלום' }).count());
  });

  await step('תשלום חלקי: נשמר ב-part, מוריד את יתרת הקרן לפי lnSum, ונחסם כשמכסה את כל התשלום', async () => {
    await p.click('[data-ln-i="2"]'); await p.click('[data-lnp="kpart"]');
    await p.fill('#ln-pay-i', '5000'); await p.fill('#ln-pay-p', '5000'); await p.click('[data-lnp="ok"]');
    await p.waitForSelector('#ln-payask .note.err');
    await p.fill('#ln-pay-i', '100'); await p.fill('#ln-pay-p', '200');
    assert.strictEqual((await p.locator('#ln-payask .row .kpi .v').nth(2).innerText()).trim(), lnFmt(300));
    await p.click('[data-lnp="ok"]'); await p.waitForSelector('[data-ln-i="2"].part');
    const d = await doc(idN); assert.strictEqual(d.part[2].length, 1); assert.strictEqual(d.part[2][0].a, 300); assert.strictEqual(d.part[2][0].p, 200); assert.strictEqual(d.part[2][0].ii, 100);
    const s = calc.lnSum(d); assert.strictEqual(await kpiVal('יתרת קרן'), lnFmt(s.remain)); assert.strictEqual(await kpiVal('שולם עד כה'), lnFmt(s.paidSum));
    assert.strictEqual(d.hist.length, 2);
  });

  await step('ביטול תשלום חלקי וביטול תשלום מלא מחייבים סיבה ונרשמים ביומן', async () => {
    await p.click('[data-ln-i="2"]'); await p.click('[data-lnp="pundo"][data-k="0"]');
    await p.click('[data-lnp="ok"]'); await p.waitForSelector('#ln-payask .note.err', { hasText: 'סיבה' });
    await p.selectOption('#ln-undo-r', 'טעות ברישום'); await p.click('[data-lnp="ok"]');
    await p.waitForFunction(() => !document.querySelector('[data-ln-i="2"].part'));
    let d = await doc(idN); assert.ok(!d.part[2]); assert.strictEqual(d.hist.at(-1).t, 'partundo');
    await p.click('[data-ln-i="1"]'); await p.waitForSelector('#ln-payask.undo');
    await p.selectOption('#ln-undo-r', 'אחר'); await p.click('[data-lnp="ok"]');
    await p.waitForSelector('#ln-payask .note.err', { hasText: 'הערה' });
    await p.fill('#ln-undo-n', 'בדיקה'); await p.click('[data-lnp="ok"]');
    await p.waitForFunction(() => !document.querySelector('[data-ln-i="1"].on'));
    d = await doc(idN); assert.deepStrictEqual(d.paid, {}); assert.strictEqual(d.hist.at(-1).t, 'undo'); assert.strictEqual(d.hist.at(-1).n, 'בדיקה');
    const s = calc.lnSum(d); assert.strictEqual(s.remain, 10000); assert.strictEqual(await kpiVal('יתרת קרן'), lnFmt(10000));
    assert.strictEqual(d.hist.length, 4);
  });

  await step('אותה פעולה שנשלחת פעמיים (אותו opId) נרשמת פעם אחת', async () => {
    const d = await doc(idN); const v = d._version; const data = { ...d, paid: { 3: today } };
    const r1 = await api('PUT', '/api/docs/loans/' + idN, { data, baseVersion: v, opId: 'op-loan-test-1' });
    const r2 = await api('PUT', '/api/docs/loans/' + idN, { data, baseVersion: v, opId: 'op-loan-test-1' });
    assert.strictEqual(r1.status, 200); assert.strictEqual(r2.status, 200); assert.ok(r2.json.replay); assert.strictEqual(r2.json.version, r1.json.version);
    assert.strictEqual((await doc(idN))._version, v + 1);
    const audit = (await api('GET', '/api/audit?limit=50')).json.filter(a => a.doc_id === idN);
    assert.ok(audit.some(a => a.action === 'רישום תשלום'), 'יומן שינויים');
  });

  await step('שינוי ממכשיר אחר: רישום עם גרסה ישנה נחסם (409), הנתונים מתרעננים ולא נדרסים', async () => {
    // חלון רישום פתוח (העדכון החי מושהה), ובינתיים מכשיר אחר מסמן את תשלום 5
    await p.waitForSelector('[data-ln-i="3"].on');
    await p.click('[data-ln-i="4"]'); await p.waitForSelector('#ln-payask');
    const d0 = await doc(idN); const o = await api('PUT', '/api/docs/loans/' + idN, { data: { ...d0, paid: { ...d0.paid, 5: today } }, baseVersion: d0._version, opId: 'op-loan-test-2' });
    assert.strictEqual(o.status, 200);
    await p.click('[data-lnp="ok"]');
    await p.waitForFunction(() => !document.querySelector('#ln-payask'));
    const d = await doc(idN); assert.deepStrictEqual(Object.keys(d.paid).sort(), ['3', '5'], 'נדרס: ' + JSON.stringify(d.paid));
    await p.waitForSelector('[data-ln-i="5"].on');
    assert.ok(!(await p.locator('[data-ln-i="4"].on').count()));
    // עכשיו עם הגרסה העדכנית הרישום מצליח
    await p.click('[data-ln-i="4"]'); await p.click('[data-lnp="ok"]'); await p.waitForSelector('[data-ln-i="4"].on');
    const d2 = await doc(idN); assert.deepStrictEqual(Object.keys(d2.paid).sort(), ['3', '4', '5']);
    assert.strictEqual(await kpiVal('יתרת קרן'), lnFmt(calc.lnSum(d2).remain));
  });

  await step('עדכון טלפון ו-PDF של לוח הסילוקין', async () => {
    await p.fill('#ln-d-phone', '052-7654321'); await p.locator('#ln-d-phone').press('Tab');
    await p.waitForFunction(async (id) => { const r = await fetch('/api/docs/loans/' + id); const j = await r.json(); return j.phone === '052-7654321'; }, idN);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#ln-pdf')]);
    const buf = fs.readFileSync(await dl.path()); await p.waitForSelector('#ln-dl');
    assert.strictEqual(await p.getAttribute('#ln-dl', 'download'), 'לוח סילוקין - בדיקה מספר תשלומים.pdf');
    // ב-Chromium ללא ממשק שם קובץ בעברית מדווח כ-"download"; בודקים את השם שבקישור
    assert.ok(/^לוח סילוקין - /.test(await p.getAttribute('#ln-dl', 'download').catch(() => '') || dl.suggestedFilename()) || dl.suggestedFilename() === 'download', dl.suggestedFilename());
    assert.strictEqual(buf.slice(0, 5).toString(), '%PDF-'); assert.ok(buf.length > 20000, 'גודל ' + buf.length);
    const wa = await p.getAttribute('#ln-wa', 'href'); assert.ok(wa.startsWith('https://wa.me/972527654321?text='), wa);
    await shot('03-pdf-ready');
  });

  await step('תיק ההלוואות במסך ״היום״ עם פירוט', async () => {
    await p.goto(URL + '/#/today'); await p.waitForSelector('#ln-port-card');
    const all = (await api('GET', '/api/docs/loans')).json;
    const open = calc.r2(all.map(L => calc.lnSum(L)).filter(s => s && !s.closed).reduce((a, s) => a + s.remain, 0));
    const v = await p.locator('#ln-port-card [data-hl="open"] .v').innerText();
    assert.strictEqual(numOf(v), open, v + ' ≠ ' + open);
    await p.locator('#ln-port-card .kpi[data-hl="late"]').click(); await p.waitForSelector('#sheet:not([hidden]) table');
    await shot('04-portfolio-late');
    await p.locator('#sheet [data-dd-loan]').first().click(); await p.waitForSelector('#ln-tbl');
    assert.ok(p.url().includes('#/loans-manage/'));
  });

  await step('מחיקת הלוואה רק אחרי ״כן, מחק״', async () => {
    await p.click(`.ln-item[data-ln-id="${idP}"]`); await p.click('#ln-del'); await p.waitForSelector('#ln-del-yes');
    await p.click('#ln-del-no'); assert.strictEqual((await api('GET', '/api/docs/loans/' + idP)).status, 200);
    await p.click('#ln-del'); await p.click('#ln-del-yes'); await p.waitForFunction((id) => !document.querySelector(`.ln-item[data-ln-id="${id}"]`), idP);
    assert.strictEqual((await api('GET', '/api/docs/loans/' + idP)).status, 404);
  });

  const reqSum = async () => { const L = (await api('GET', '/api/docs/loan_requests')).json; return { n: L.length, tot: calc.sum(L.map(r => calc.num(r.amount))), L }; };
  await step('בקשות: הרשימה והסכום הכולל תואמים לנתונים', async () => {
    await p.goto(URL + '/#/requests-manage'); await p.waitForSelector('.rq-item');
    const s = await reqSum(); assert.strictEqual(await p.locator('.rq-item').count(), s.n);
    assert.strictEqual(numOf((await p.innerText('#rq-sum')).split('סה״כ מבוקש')[1]), s.tot);
  });
  await step('בקשה חדשה: חובה שם וסכום, סכום עם פסיקים, הסכום הכולל מתעדכן', async () => {
    const before = await reqSum();
    await p.click('#rq-new'); await p.click('#rq-save'); await p.waitForSelector('#rq-form-msg:not([hidden])');
    await p.fill('#rq-f-name', 'מבקש בדיקה'); await p.fill('#rq-f-amount', '12,500'); await p.fill('#rq-f-phone', '050-1111111'); await p.fill('#rq-f-note', 'הערת בדיקה');
    assert.ok((await p.innerText('#rq-amt-prev')).includes('12,500'));
    await p.click('#rq-save'); await p.waitForSelector('.rq-item.flash');
    const s = await reqSum(); assert.strictEqual(s.n, before.n + 1); assert.strictEqual(s.tot, calc.r2(before.tot + 12500));
    const r = s.L.find(x => x.name === 'מבקש בדיקה'); assert.strictEqual(r.amount, 12500); assert.strictEqual(r.date, today); assert.ok(r.created && r.updated);
    assert.strictEqual(numOf((await p.innerText('#rq-sum')).split('סה״כ מבוקש')[1]), s.tot);
    await shot('05-requests');
  });
  await step('חיפוש בבקשות: סכום כולל וסכום התואמות', async () => {
    await p.fill('#rq-q', 'מבקש בדיקה'); await p.waitForSelector('.rq-s.hit');
    assert.strictEqual(await p.locator('.rq-item').count(), 1);
    assert.strictEqual(numOf((await p.innerText('.rq-s.hit')).split('סה״כ מבוקש')[1]), 12500);
    await p.click('#rq-qclr');
  });
  await step('עריכת בקשה', async () => {
    const r = (await reqSum()).L.find(x => x.name === 'מבקש בדיקה');
    await p.click(`[data-rq-edit="${r.id}"]`); assert.strictEqual(await p.inputValue('#rq-f-amount'), '12,500');
    assert.ok(await p.locator(`.rq-item.editing[data-rq-id="${r.id}"]`).count());
    await p.fill('#rq-f-amount', '15000'); await p.click('#rq-save'); await p.waitForSelector('#rq-form', { state: 'hidden' });
    const r2 = (await api('GET', '/api/docs/loan_requests/' + r.id)).json; assert.strictEqual(r2.amount, 15000); assert.strictEqual(r2.created, r.created);
    assert.ok((await p.locator(`[data-rq-id="${r.id}"] .rq-amt`).innerText()).includes('15,000'));
  });
  await step('מחיקת בקשה עם אישור', async () => {
    const r = (await reqSum()).L.find(x => x.name === 'מבקש בדיקה');
    await p.click(`[data-rq-del="${r.id}"]`); await p.click(`[data-rq-yes="${r.id}"]`);
    await p.waitForFunction((id) => !document.querySelector(`[data-rq-id="${id}"]`), r.id);
    assert.strictEqual((await api('GET', '/api/docs/loan_requests/' + r.id)).status, 404);
  });
  await step('אין שגיאות בדף', async () => { assert.deepStrictEqual(errs, [], errs.join(' | ')); });

  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} עברו. צילומים: ${OUT}`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
