// בדיקת ״איחוד חובות לפי לווה״ במסך הפיצול — הדוגמה: אדיר לביא 3,200 ₪ אצל אושר + 2,200 ₪ אצל רובי, בחשבון שכבר נשמר.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8410, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-bm-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (c) => { const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const desk = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'he-IL' }); await desk.route(/wa\.me|whatsapp\.com/, r => r.abort());
  const p = await login(desk);
  const api = async (m, u, body) => { const r = await desk.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const R = (n, a, c, t, ph) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: ph || '', a, c, t: t || '', cnt: 1, side: false });
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-19', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [R('אדיר לביא', 3200, 'אושר', '10:00', '0559969029'), R('שירה כהן', 900, 'אושר', '11:00', '0521111111'), R('אדיר לביא', 2200, 'רובי', '12:30'), R('משה לוי', 300, 'רובי', '', '0522222222'), R('משה לוי', 150, 'אושר', '', '0533333333')] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'fill' }); }
  const totals = async () => { const a = await api('GET', '/api/accounts/' + SP); const t = {}; a.records.forEach(r => t[r.c] = (t[r.c] || 0) + r.a); return { t, all: a.records.reduce((s, r) => s + r.a, 0), n: a.records.length, recs: a.records }; };
  const before = await totals();
  const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });

  await step('הכפתור ״איחוד חובות לפי לווה״ ליד ״שמור שינויים״, ומציג את הלווים, השורות והסכום שיתקבל', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#mgbtn');
    const row = await p.locator('.saverow').innerText(); assert.ok(row.includes('שמור שינויים') && row.includes('איחוד חובות לפי לווה'), row);
    await p.click('#mgbtn'); await p.waitForSelector('#mgall');
    const t = await p.locator('#sheet').innerText();
    assert.ok(t.includes('אדיר לביא') && t.includes('5,400') && t.includes('3,200') && t.includes('2,200') && t.includes('אושר') && t.includes('רובי'), t);
    assert.ok(t.includes('לפי שם בלבד') && t.includes('ספק: מספרי טלפון שונים'), 'זיהוי לפי שם / ספק');
  });
  await step('לא מאחדים אוטומטית לפי שם — צריך לסמן ״זה אותו לווה — אחד שורות״', async () => {
    const gi = await p.locator('.mgc', { hasText: 'אדיר לביא' }).getAttribute('data-gi');
    assert.ok(await p.locator(`[data-one="${gi}"]`).isDisabled(), 'הכפתור נעול עד הסימון');
    assert.ok(await p.locator('#mgall').isDisabled());
    await p.check(`[data-same="${gi}"]`); await p.click(`[data-one="${gi}"]`);
    await p.waitForSelector('.mgcard');
  });
  await step('ב״כל הגובים״: שורה אחת ״אדיר לביא — 5,400 ₪״, והפירוט מציג סכום, גובה, שעה וסטטוס', async () => {
    const rows = p.locator('.mgcard .mgrow'); assert.strictEqual(await rows.count(), 1, 'רק אדיר אוחד');
    assert.ok((await rows.first().locator('.t').innerText()).includes('אדיר לביא — 5,400'));
    await rows.first().locator('summary').click(); const d = await rows.first().locator('table').innerText();
    assert.ok(/אושר\s+3,200(\.00)? ₪\s+10:00\s+לאסוף/.test(d), d); assert.ok(/רובי\s+2,200(\.00)? ₪\s+12:30\s+לאסוף/.test(d), d);
    assert.strictEqual(await p.locator('.card:not(.mgcard) .li', { hasText: 'אדיר לביא' }).count(), 0, 'לא מופיע פעמיים');
  });
  await step('סינון ״אושר״ מציג לאדיר 3,200 ₪ וסינון ״רובי״ 2,200 ₪; סכומי הגובים וסך החשבון זהים', async () => {
    await p.click('.chip[data-c="אושר"]'); await p.waitForTimeout(200); assert.strictEqual(await p.locator('.mgcard').count(), 0);
    let t = await card('אושר').innerText(); assert.ok(t.includes('אדיר לביא') && t.includes('3,200') && !t.includes('2,200'), t);
    await p.click('.chip[data-c="רובי"]'); await p.waitForTimeout(200);
    t = await card('רובי').innerText(); assert.ok(t.includes('אדיר לביא') && t.includes('2,200') && !t.includes('3,200'), t);
    await p.click('.chip[data-c=""]');
    const after = await totals(); assert.deepStrictEqual(after.t, before.t); assert.strictEqual(after.all, before.all); assert.strictEqual(after.n, before.n, 'לא נוצרה שורה/חיוב חדש');
    assert.strictEqual((await api('GET', '/api/docs/loans')).length, 0, 'לא נוצרה הלוואה');
  });
  await step('אחרי שמירה ורענון — השורה המאוחדת והפירוט מופיעים שוב', async () => {
    await p.click('#ssave'); await p.reload(); await p.waitForSelector('.mgcard .mgrow');
    assert.ok((await p.locator('.mgcard .mgrow .t').innerText()).includes('אדיר לביא — 5,400'));
    await p.locator('.mgcard summary').click(); assert.ok((await p.locator('.mgcard table').innerText()).includes('רובי'));
  });
  await step('וואטסאפ: בחירת השורה המאוחדת מכינה הודעה אישית אחת עם 5,400 ₪', async () => {
    await p.locator('.mgcard .mgrow input.ck').check(); await p.click('#sendpriv'); await p.waitForSelector('[data-msg]', { state: 'attached' });
    assert.strictEqual(await p.locator('[data-msg]').count(), 1); const m = await p.locator('[data-msg]').first().inputValue();
    assert.ok(m.includes('5,400') && m.includes('אדיר'), m);
    await p.click('#sheet [data-close]');
  });
  await step('ספק (שני טלפונים שונים): מוצג זה לצד זה ומאוחד רק בסימון ידני', async () => {
    await p.click('#mgbtn'); await p.waitForSelector('#mgall'); const t = await p.locator('#sheet').innerText();
    assert.ok(t.includes('משה לוי') && t.includes('0522222222') && t.includes('0533333333') && !t.includes('אדיר לביא'), t);
    await p.click('#sheet [data-close]');
    assert.ok(!(await totals()).recs.filter(r => r.n === 'משה לוי').some(r => r.mg));
  });
  await step('״בטל איחוד״ מחזיר לשורות נפרדות, והסכומים לא משתנים', async () => {
    await p.evaluate(() => { document.querySelector('.mgcard details').open = true; }); await p.click('[data-mgun]'); await p.waitForFunction(() => !document.querySelector('.mgcard'));
    assert.strictEqual(await p.locator('.li', { hasText: 'אדיר לביא' }).count(), 2);
    const after = await totals(); assert.deepStrictEqual(after.t, before.t); assert.ok(!after.recs.some(r => r.mg));
  });
  await step('אייפון: הכפתור גלוי בראש המסך גם בגלילה', async () => {
    const m = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const q = await login(m);
    await q.goto(URL + '/#/acc/' + SP); await q.waitForSelector('#mgbtn'); await q.evaluate(() => scrollBy(0, 900)); await q.waitForTimeout(200);
    const bx = await q.locator('#mgbtn').boundingBox(); assert.ok(bx && bx.y >= 0 && bx.y < 200 && bx.height >= 40, JSON.stringify(bx));
    assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await q.click('#mgbtn'); await q.waitForSelector('#mgall'); await q.screenshot({ path: path.join(os.tmpdir(), 'borrower-merge-iphone.png') });
    assert.deepStrictEqual(q.errs, []); await m.close();
  });
  await step('אין שגיאות דף', async () => { assert.deepStrictEqual(p.errs, []); });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
