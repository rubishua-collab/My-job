// בדיקת ״שליחת PDF״ ממסך ״חשבונות״ — באייפון (שיתוף קבצים) ובמחשב (צירוף ידני), על נתוני בדיקה.
// בלי מקומיות UTF-8 כרום בלינוקס מחליף שם קובץ בעברית ב-"download" (במחשב ובאייפון אמיתיים השם נשמר)
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8'; process.env.LANG = process.env.LANG || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8370, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-pdf-'));
const OUT = path.join(os.tmpdir(), 'yoman-acc-pdf'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
// שיתוף מדומה: שומר את הקבצים שהועברו (שם, סוג, גודל, תחילת התוכן)
const FAKE_SHARE = () => {
  window.__shared = [];
  navigator.canShare = (d) => !!(d && d.files && d.files.length);
  navigator.share = async (d) => { const f = d.files[0]; const head = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer()); window.__shared.push({ name: f.name, type: f.type, size: f.size, head, title: d.title || '', text: d.text || '' }); };
};
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (ctx) => { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const phone = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); await phone.addInitScript(FAKE_SHARE);
  const p = await login(phone);
  const api = async (m, u, body) => { const r = await phone.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  let n = 0;
  const mk = async (kind, date, fill) => { const { id } = await api('POST', '/api/accounts', { kind, date, opId: 'mk' + (++n) }); const a = await api('GET', '/api/accounts/' + id); const data = { ...a, ...fill }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: 'u' + (++n) }); return id; };
  const C19 = await mk('collectors', '2026-11-19', { entries: [{ n: 'לקוח יוסי 1', a: 1000, c: 'יוסי', k: 'd' }, { n: 'לקוח יוסי 2', a: 500, c: 'יוסי', k: 'd' }, { n: 'דלק יוסי', a: 120, c: 'יוסי', k: 'e' }, { n: 'לקוח אבי 1', a: 800, c: 'אבי', k: 'd' }, { n: 'אוכל אבי', a: 50, c: 'אבי', k: 'e' }] });
  const C18 = await mk('collectors', '2026-11-18', { entries: [{ n: 'לקוח שמונה עשר', a: 2222, c: 'דני', k: 'd' }, { n: 'חניה דני', a: 22, c: 'דני', k: 'e' }] });
  const M19 = await mk('morning', '2026-11-19', { keren: 1000, courier: 10, rows: [{ n: 'משה ריבית', i: 100, p: 300 }], loans: [{ n: 'הלוואה לבדיקה', a: 200 }] });
  const S19 = await mk('split', '2026-11-19', { records: [{ n: 'רינה פיצול', fn: 'רינה', ph: '0500000001', a: 450, c: 'יוסי', cnt: 1 }] });
  const W20 = await mk('work', '2026-11-20', { entries: [{ n: 'דוד איסוף', p: '0500000002', a: 350, c: 'אבי', t: '09:00', s: 'נאסף', ga: 350 }], expenses: [{ n: 'דלק', a: 40, c: 'אבי' }] });
  const row = (id) => p.locator(`.accrow[data-id="${id}"]`);
  const openPdf = async (pg, id) => { await pg.locator(`.accrow[data-id="${id}"] [data-pdf]`).click(); await pg.waitForFunction(() => { const b = document.querySelector('#pwa'); return b && !b.disabled; }, null, { timeout: 30000 }); };
  const closeSheet = async (pg) => { await pg.click('#sheet [data-close]'); await pg.waitForFunction(() => document.querySelector('#sheet').hidden); };

  await step('אייפון: בכל שורה יש ״שליחת PDF״ ליד ״מחיקת רישום״, בכל סוגי החשבונות, בלי גלילה הצידה', async () => {
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow');
    for (const id of [C19, C18, M19, S19, W20]) { assert.strictEqual(await row(id).locator('[data-pdf]').count(), 1); assert.strictEqual(await row(id).locator('[data-rm]').count(), 1); }
    const bx = await row(C19).locator('[data-pdf]').boundingBox(); assert.ok(bx.height >= 44 && bx.width >= 44, JSON.stringify(bx));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: path.join(OUT, 'list-iphone.png') });
  });
  await step('אייפון: החיפוש והסינון נשמרים — פתיחה וסגירה של החלון לא מאבדות אותם ולא פותחות את החשבון', async () => {
    await p.click('.chip[data-k="collectors"]'); await p.fill('#aq', '19.11'); await p.waitForTimeout(150);
    assert.strictEqual(await p.locator('.accrow').count(), 1);
    await openPdf(p, C19); assert.ok(/#\/accounts$/.test(p.url()));
    const h = await p.locator('#pdfhead').innerText(); assert.ok(h.includes('חשבון גובים') && h.includes('19.11.2026'), h);
    await closeSheet(p);
    assert.strictEqual(await p.inputValue('#aq'), '19.11'); assert.strictEqual(await p.locator('.accrow').count(), 1);
    assert.strictEqual(await p.getAttribute('.chip[data-k="collectors"]', 'aria-pressed'), 'true');
  });
  await step('אייפון: ״שליחה בוואטסאפ״ מעביר לשיתוף את קובץ ה־PDF עצמו, בשם ״חשבון גובים 19-11-2026.pdf״, ולא מציג ״נשלח״', async () => {
    await openPdf(p, C19); await p.click('#pwa'); await p.waitForSelector('#pout .note');
    const sh = await p.evaluate(() => window.__shared); const f = sh[sh.length - 1];
    assert.strictEqual(f.name, 'חשבון גובים 19-11-2026.pdf'); assert.strictEqual(f.type, 'application/pdf'); assert.strictEqual(f.head, '%PDF-'); assert.ok(f.size > 5000, f.size);
    const t = await p.locator('#pout').innerText(); assert.ok(!/נשלח(?!ת)/.test(t), t); assert.ok(t.includes('הועבר'));
  });
  await step('אייפון: ״שליחה במייל״ ו״שיתוף נוסף״ מעבירים את אותו קובץ', async () => {
    await p.click('#pmail'); await p.waitForTimeout(200); await p.click('#pshare'); await p.waitForTimeout(200);
    const sh = await p.evaluate(() => window.__shared); assert.ok(sh.length >= 3); assert.ok(sh.slice(-2).every(f => f.name === 'חשבון גובים 19-11-2026.pdf' && f.head === '%PDF-'));
  });
  await step('תוכן: חשבון גובים 19.11 — חלוקה לפי גובה עם גבייה, הוצאות ונטו', async () => {
    await p.click('#pprev'); await p.waitForSelector('#pdfpreview');
    const t = await p.locator('#pdfpreview').innerText();
    for (const s of ['חשבון גובים', '19.11.2026', 'יוסי', 'אבי', 'לקוח יוסי 1', 'דלק יוסי', '1,500', '120', '1,380', '800', '50', '750', '2,300', '2,130']) assert.ok(t.includes(s), 'חסר: ' + s);
    assert.ok(!t.includes('לקוח שמונה עשר'));
    await closeSheet(p);
  });
  await step('תוכן: חשבון גובים 18.11 מפיק קובץ משלו עם התאריך, השורות והסכומים שלו', async () => {
    await p.fill('#aq', '18.11'); await p.waitForTimeout(150); await openPdf(p, C18); await p.click('#pwa'); await p.waitForSelector('#pout .note');
    const sh = await p.evaluate(() => window.__shared); const f = sh[sh.length - 1]; assert.strictEqual(f.name, 'חשבון גובים 18-11-2026.pdf');
    await p.click('#pprev'); const t = await p.locator('#pdfpreview').innerText();
    for (const s of ['18.11.2026', 'דני', 'לקוח שמונה עשר', '2,222', 'חניה דני', '2,200']) assert.ok(t.includes(s), 'חסר: ' + s);
    assert.ok(!t.includes('לקוח יוסי 1') && !t.includes('19.11.2026'));
    await closeSheet(p); await p.fill('#aq', ''); await p.click('.chip[data-k=""]');
  });
  await step('תוכן: חשבון בוקר, פיצול ואיסוף יומי — שם קובץ ותוכן נכונים', async () => {
    const want = { [M19]: ['חשבון בוקר 19-11-2026.pdf', ['חשבון בוקר', 'משה ריבית', 'הלוואה לבדיקה', 'סה״כ סופי']], [S19]: ['פיצול 19-11-2026.pdf', ['פיצול גובים', 'רינה פיצול', '450']], [W20]: ['איסוף יומי 20-11-2026.pdf', ['איסוף יומי', '20.11.2026', 'דוד איסוף', '350', 'דלק']] };
    for (const [id, [nm, parts]] of Object.entries(want)) {
      await openPdf(p, id); await p.click('#pshare'); await p.waitForSelector('#pout .note');
      const sh = await p.evaluate(() => window.__shared); assert.strictEqual(sh[sh.length - 1].name, nm);
      await p.click('#pprev'); const t = await p.locator('#pdfpreview').innerText(); for (const s of parts) assert.ok(t.includes(s), nm + ' חסר: ' + s);
      await closeSheet(p);
    }
  });
  await step('אייפון: ביטול חלון השיתוף לא מציג ״נשלח״ ומציע צירוף ידני', async () => {
    await p.evaluate(() => { navigator.share = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }; });
    await openPdf(p, C19); await p.click('#pwa'); await p.waitForSelector('#pman');
    const t = await p.locator('#pout').innerText(); assert.ok(t.includes('שום דבר לא נשלח') && t.includes('הורד קובץ לצירוף'), t);
    await p.screenshot({ path: path.join(OUT, 'sheet-iphone.png') }); await closeSheet(p);
  });

  // ---------- מחשב בלי שיתוף קבצים: צירוף ידני ----------
  const desk = await b.newContext({ viewport: { width: 1366, height: 860 }, locale: 'he-IL', acceptDownloads: true });
  await desk.addInitScript(() => { delete Navigator.prototype.canShare; delete Navigator.prototype.share; });
  await desk.route(/wa\.me|whatsapp\.com/, r => r.abort());
  const q = await login(desk);
  await step('מחשב: ״שליחה בוואטסאפ״ בלי שיתוף קבצים — ״הורד קובץ לצירוף״ מוריד את ה־PDF, עם הנחיה ופתיחת וואטסאפ', async () => {
    await q.goto(URL + '/#/accounts'); await q.waitForSelector('.accrow'); await openPdf(q, C19); await q.click('#pwa'); await q.waitForSelector('#pman');
    const t = await q.locator('#pout').innerText(); assert.ok(t.includes('צריך לצרף את הקובץ ידנית') && t.includes('חשבון גובים 19-11-2026'), t);
    assert.ok((await q.getAttribute('#pgo', 'href')).startsWith('https://wa.me/?text='));
    const [dl] = await Promise.all([q.waitForEvent('download'), q.click('#pman')]);
    assert.strictEqual(dl.suggestedFilename(), 'חשבון גובים 19-11-2026.pdf'); const fp = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(fp);
    assert.strictEqual(fs.readFileSync(fp).slice(0, 5).toString(), '%PDF-'); assert.ok(!/נשלח(?!ת)/.test(await q.locator('#pout').innerText()));
  });
  await step('מחשב: ״שליחה במייל״ — הורדה לצירוף ופתיחת מייל חדש', async () => {
    await q.click('#pmail'); await q.waitForSelector('#pgo'); assert.ok((await q.getAttribute('#pgo', 'href')).startsWith('mailto:?subject='));
    assert.ok((await q.locator('#pout').innerText()).includes('האטב'));
  });
  await step('מחשב: ״הורדת PDF״ ו״תצוגה מקדימה״, ושני תאריכים שונים מפיקים שני קבצים שונים', async () => {
    const [d1] = await Promise.all([q.waitForEvent('download'), q.click('#pdl')]); await closeSheet(q);
    await openPdf(q, C18); const [d2] = await Promise.all([q.waitForEvent('download'), q.click('#pdl')]);
    assert.strictEqual(d1.suggestedFilename(), 'חשבון גובים 19-11-2026.pdf'); assert.strictEqual(d2.suggestedFilename(), 'חשבון גובים 18-11-2026.pdf');
    const f1 = path.join(OUT, 'a.pdf'), f2 = path.join(OUT, 'b.pdf'); await d1.saveAs(f1); await d2.saveAs(f2);
    assert.ok(!fs.readFileSync(f1).equals(fs.readFileSync(f2)));
    await q.click('#pprev'); await q.waitForSelector('#pdfpreview'); await q.screenshot({ path: path.join(OUT, 'sheet-desktop.png') });
  });
  await step('אין שגיאות דף', async () => { assert.deepStrictEqual(p.errs, []); assert.deepStrictEqual(q.errs, []); });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו. צילומים: ${OUT}`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
