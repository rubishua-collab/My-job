// בדיקת קבלה: ״שליחת לוח תשלומים ללקוח״ (אייפון) — PDF מסונן: מספר, תאריך וסכום לכל תשלום + סה״כ לתשלום, בלי ריבית/קרן/יתרות/סכום הלוואה.
// התצוגה המקדימה = העמודים שבקובץ, והקובץ שנשלח זהה לקובץ שהוצג. השליחה הקיימת (״שלח ללקוח PDF״) נשארה כמו שהיא.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8575, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ps-'));
const OUT = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ps-shots-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__sent = []; navigator.canShare = () => true; navigator.share = async (d) => { const f = d.files[0]; const u = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); window.__sent.push({ name: f.name, type: f.type, text: d.text, b64: btoa(s) }); }; });
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  // הבקשה של אבי לוי עם הלוח השמור (כמו בצילום — הפרש של אגורה בתשלום האחרון)
  const rows = [{ i: 1, date: '2026-12-27', open: 10000, payment: 3503.82, interest: 300, principal: 3203.82, close: 6796.18 }, { i: 2, date: '2027-01-27', open: 6796.18, payment: 3503.82, interest: 203.89, principal: 3299.93, close: 3496.25 }, { i: 3, date: '2027-02-27', open: 3496.25, payment: 3503.81, interest: 104.89, principal: 3398.92, close: 0 }];
  await api('POST', '/api/docs/loan_requests', { id: 'Qavi', data: { name: 'אבי לוי', amount: 10000, date: '2026-11-27', phone: '0521112233', note: '', chk: 3, lk: 'new', created: '', updated: '', terms: { rate: '3', n: '3', type: 'month', mode: 'n', first: '2026-12-27', date: '2026-11-27' }, sched: { pay: 3503.82, totalPay: 10511.45, totalInt: 608.78, n: 3, rows } }, opId: 'q' });
  const card = p.locator('.rq-item', { hasText: 'אבי לוי' });
  let html, sentB64;

  await step('בכרטיס: ״שלח ללקוח PDF״ הקיים נשאר, ולידו ״שליחת לוח תשלומים ללקוח״', async () => {
    await p.goto(URL + '/#/requests-manage'); await card.waitFor();
    const acts = (await card.locator('.rq-act button').allInnerTexts()).map(s => s.trim());
    const i = acts.indexOf('שלח ללקוח PDF'); assert.ok(i >= 0 && acts[i + 1] === 'שליחת לוח תשלומים ללקוח', acts.join('|'));
  });
  await step('תצוגה מקדימה ושם הנמען לפני השליחה; המסמך: ״לוח תשלומים״, שם הלקוח, 3 תשלומים, שלוש עמודות, הסכומים המדויקים וסה״כ 10,511.45', async () => {
    await card.locator('[data-rq-pay]').click(); await p.waitForSelector('#rqpo-pv img');
    assert.match(await p.innerText('.rqpo-to'), /נמען:\s*אבי לוי · 0521112233/);
    assert.ok(await p.locator('#rqpo-send').isEnabled()); assert.strictEqual(await p.evaluate(() => window.__sent.length), 0, 'לא נשלח לפני הלחיצה');
    html = await p.evaluate(async () => { const m = await import('/js/features/loans-pdf.js'); const q = await (await fetch('/api/docs/loan_requests/Qavi')).json(); return m.lnPayOnlyPages({ name: q.name, rows: q.sched.rows }).pages.join(''); });
    const txt = await p.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); }, html);
    assert.match(txt, /מספר תשלומים\s*3/);
    for (const t of ['לוח תשלומים', 'אבי לוי', 'מספר תשלום', 'תאריך תשלום', 'סכום לתשלום', '27/12/2026', '27/01/2027', '27/02/2027', '3,503.82', '3,503.81', 'סה״כ לתשלום', '10,511.45']) assert.ok(txt.includes(t), t);
    assert.strictEqual((txt.match(/3,503\.82/g) || []).length, 2); assert.strictEqual((txt.match(/3,503\.81/g) || []).length, 1);
    const ths = await p.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; return [...d.querySelectorAll('th')].map(x => x.textContent); }, html); assert.deepStrictEqual(ths, ['מספר תשלום', 'תאריך תשלום', 'סכום לתשלום']);
    for (const bad of ['ריבית', 'קרן', 'יתרה', 'יתרת', 'סכום ההלוואה', 'סכום הלוואה', 'למסירה', '%', '10,000', '608.78', '300.00', '3,203.82', '6,796.18']) assert.ok(!html.includes(bad), 'אסור במסמך: ' + bad);
  });
  await step('״שלח PDF ללקוח״: נשלח הקובץ המסונן בלבד, זהה לקובץ שבתצוגה המקדימה; ההודעה בלי סכומים או ריבית', async () => {
    await p.click('#rqpo-send'); await p.waitForFunction(() => window.__sent.length === 1);
    const sent = await p.evaluate(() => window.__sent[0]); assert.strictEqual(sent.type, 'application/pdf'); assert.match(sent.name, /^לוח-תשלומים-אבי-לוי\.pdf$/);
    assert.strictEqual(sent.text, 'לוח תשלומים — אבי לוי');
    const shown = await p.evaluate(async () => { const u = new Uint8Array(await window.__rqPayPdf.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); });
    assert.strictEqual(sent.b64, shown, 'הקובץ שנשלח = הקובץ שבתצוגה המקדימה'); sentB64 = sent.b64;
    const f = path.join(OUT, 'sent.pdf'); fs.writeFileSync(f, Buffer.from(sent.b64, 'base64'));
    // התמונות שבתוך ה-PDF = התמונות שהוצגו בתצוגה המקדימה
    const imgDir = path.join(OUT, 'img'); fs.mkdirSync(imgDir, { recursive: true }); execFileSync('pdfimages', ['-all', f, path.join(imgDir, 'p')]);
    const inPdf = fs.readdirSync(imgDir).filter(x => x.endsWith('.jpg')).sort().map(x => fs.readFileSync(path.join(imgDir, x)).toString('base64'));
    const pv = await p.evaluate(() => [...document.querySelectorAll('#rqpo-pv img')].map(i => i.src.split(',')[1]));
    assert.deepStrictEqual(inPdf, pv);
    execFileSync('pdftoppm', ['-r', '70', '-png', '-f', '1', '-l', '1', f, path.join(OUT, 'page')]);
    await p.click('#sheet [data-close]');
  });
  await step('השליחה הקיימת לא השתנתה: ״שלח ללקוח PDF״ עדיין מפיק את המסמך המלא (״הצעת הלוואה ולוח תשלומים״); אין שגיאות דף', async () => {
    await card.locator('[data-rq-pdf]').click(); await p.waitForSelector('#rqp-share'); assert.match(await p.innerText('#sheet h2'), /הצעת הלוואה ולוח תשלומים/);
    const full = await p.evaluate(async () => { const m = await import('/js/features/loans-pdf.js'); const R = await import('/js/loan-renew.js'); const q = await (await fetch('/api/docs/loan_requests/Qavi')).json(); return m.lnSheetPages(R.loanFromTerms(q.terms, { amount: q.amount, name: q.name, date: q.terms.date }), { title: 'הצעת הלוואה ולוח תשלומים' }).join(''); });
    assert.ok(full.includes('ריבית') && full.includes('קרן'), 'המסמך המלא כולל את כל הפרטים כמו קודם');
    await p.click('#sheet [data-close]');
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill(); console.log('   ' + OUT);
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
