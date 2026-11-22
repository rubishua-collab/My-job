// בדיקת ״שמור שינויים״: פיצול (שעה + גובה + סכום בכמה שורות בלחיצה אחת), עריכה בכל סוגי החשבונות, כישלון ושמירה חוזרת,
// ״יש שינויים שטרם נשמרו״ במעבר מסך/תאריך, פס צף בגלילה באייפון. נתוני בדיקה במסד ריק.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8390, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-save-'));
const OUT = path.join(os.tmpdir(), 'yoman-save'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
const SAVED = /נשמר בשעה \d\d:\d\d/;
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (c) => { const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const desk = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'he-IL' });
  const p = await login(desk);
  const api = async (m, u, body) => { const r = await desk.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  let n = 0;
  const mk = async (kind, date, fill) => { const { id } = await api('POST', '/api/accounts', { kind, date, opId: 'mk' + (++n) }); const a = await api('GET', '/api/accounts/' + id); const data = { ...a, ...fill }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: 'u' + (++n) }); return id; };
  const acc = (id) => api('GET', '/api/accounts/' + id);
  const R = (nm, a, c, t) => ({ n: nm, fn: nm.split(' ')[0], ln: nm.split(' ')[1] || '', ph: '', a, c, t: t || '', cnt: 1, side: false });
  // פיצול של יום קודם (21.11) — עורכים יום קודם, והשינוי חייב להישמר בתאריך הזה
  const SP = await mk('split', '2026-11-21', { records: [R('אורי א', 100, 'טל'), R('בני ב', 200, 'טל'), R('גלי ג', 300, 'רובי'), R('דנה ד', 400, 'רובי')] });
  const st = () => p.locator('#hsave + [data-savest]').innerText();

  await step('פיצול: ״שמור שינויים״ ליד ״עריכה״, וסטטוס ״יש שינויים שטרם נשמרו״ אחרי עריכה', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#hsave');
    const row = await p.locator('.band .row').first().innerText(); assert.ok(row.indexOf('עריכה') >= 0 && row.indexOf('שמור שינויים') >= 0, row);
    await p.click('#spt-rows summary'); await p.waitForSelector('table.ed tr[data-id]');
  });
  await step('פיצול: שעה ללקוח 1, גובה ללקוח 2 וסכום ללקוח 3 — נשמרים בלחיצה אחת, כולל ערך שהסמן עדיין בתוכו', async () => {
    const recs = (await acc(SP)).records; const k = nm => recs.find(r => r.n === nm)._k;
    await p.locator(`#spt-lists [data-spt="${k('אורי א')}"]`).fill('10:32');                 // בלי Enter
    await p.locator(`#spt-lists [data-mv="${k('בני ב')}"]`).selectOption('רובי');
    await p.waitForTimeout(300);
    const amt = p.locator(`table.ed tr[data-id="${k('גלי ג')}"] input[data-f="a"]`); await amt.fill('350');   // הסמן נשאר בשדה
    assert.ok(/יש שינויים שטרם נשמרו|שומר…/.test(await st()), await st());
    await p.click('#hsave'); await p.waitForFunction(() => /נשמר בשעה \d\d:\d\d/.test(document.querySelector('#hsave + [data-savest]').textContent), null, { timeout: 15000 });
    const a = await acc(SP); const by = Object.fromEntries(a.records.map(r => [r.n, r]));
    assert.strictEqual(by['אורי א'].t, '10:32'); assert.strictEqual(by['בני ב'].c, 'רובי'); assert.strictEqual(by['גלי ג'].a, 350);
    assert.strictEqual(a.date, '2026-11-21', 'נשמר בתאריך שמוצג'); assert.strictEqual(a.records.length, 4);
    const tot = {}; a.records.forEach(r => tot[r.c] = (tot[r.c] || 0) + r.a); assert.deepStrictEqual(tot, { 'טל': 100, 'רובי': 950 });
  });
  await step('פיצול: אחרי רענון ופתיחה מחדש — הערכים והסיכומים לכל גובה נכונים', async () => {
    await p.reload(); await p.waitForSelector('#hsave');
    const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });
    assert.ok((await card('טל').innerText()).includes('100')); assert.ok((await card('רובי').innerText()).includes('950'));
    assert.ok((await p.locator('.card', { hasText: 'סיכום' }).last().innerText()).includes('1,050'));
  });
  await step('פיצול: לחיצה חוזרת על ״שמור שינויים״ לא משכפלת שורות ולא סופרת פעמיים', async () => {
    const v0 = (await acc(SP))._version;
    await p.click('#hsave'); await p.waitForTimeout(400); await p.click('#hsave'); await p.waitForTimeout(400);
    const a = await acc(SP); assert.strictEqual(a.records.length, 4); assert.strictEqual(a.records.reduce((s, r) => s + r.a, 0), 1050); assert.strictEqual(a._version, v0, 'אין שמירה כשאין שינוי');
    assert.strictEqual((await api('GET', '/api/accounts?kind=work')).length, 0, 'לא נוצר איסוף יומי');
  });
  await step('פיצול: בגלילה למטה (אזור ״שעות, גובים ופיצול סכום״) ״שמור שינויים״ נשאר בראש המסך', async () => {
    const m = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const q = await login(m);
    await q.goto(URL + '/#/acc/' + SP); await q.waitForSelector('#hsave');
    await q.locator('#spt-lists').scrollIntoViewIfNeeded(); await q.evaluate(() => scrollBy(0, 300)); await q.waitForTimeout(300);
    const bx = await q.locator('#ssave').boundingBox(); assert.ok(bx && bx.y >= 0 && bx.y < 120 && bx.height >= 40, 'הכפתור נשאר בראש המסך: ' + JSON.stringify(bx));
    await q.screenshot({ path: path.join(OUT, 'split-float-iphone.png') });
    assert.deepStrictEqual(q.errs, []); await m.close();
  });

  // ---------- עריכה בכל סוגי החשבונות ----------
  const M = await mk('morning', '2026-11-20', { keren: 1000, rows: [{ n: 'משה', i: 10, p: 20 }] });
  const C = await mk('collectors', '2026-11-20', { entries: [{ n: 'גבייה', a: 500, c: 'טל', k: 'd' }] });
  const W = await mk('work', '2026-11-20', { entries: [{ n: 'דוד', p: '', a: 70, c: 'אבי', t: '09:00', s: '' }], expenses: [] });
  for (const [id, nm, sel, val, check] of [
    [M, 'חשבון בוקר', 'input[data-l="rows"][data-k="i"]', '55', a => a.rows[0].i === 55],
    [C, 'חשבון גובים', 'input[data-l="entries"][data-k="a"]', '650', a => a.entries[0].a === 650],
    [W, 'איסוף יומי', 'input[data-l="entries"][data-k="a"]', '85', a => a.entries[0].a === 85],
    [SP, 'פיצול', 'input[data-l="records"][data-k="t"] >> nth=1', '11:45', a => a.records.some(r => r.t === '11:45')],
  ]) {
    await step(`עריכה · ${nm}: ״שמור שינויים״ שומר ונשאר במסך; אחרי רענון הערך נשמר`, async () => {
      await p.goto(URL + '/#/acc/' + id + '?edit=1'); await p.waitForSelector('#ed-savestay');
      await p.locator(sel).first().fill(val);                     // בלי Enter / בלי לצאת מהשדה
      assert.strictEqual(await p.locator('.actionbar [data-savest]').innerText(), 'יש שינויים שטרם נשמרו');
      await p.click('#ed-savestay'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('.actionbar [data-savest]').textContent));
      assert.ok(p.url().includes('edit=1'), 'נשאר בעריכה'); assert.ok(check(await acc(id)));
      await p.reload(); await p.waitForSelector('#ed-savestay'); assert.strictEqual(await p.locator(sel).first().inputValue(), val);
    });
  }
  await step('שמירה שנכשלה: ״השמירה נכשלה — נסה שוב״, הערך נשאר במסך; ניסיון נוסף מצליח', async () => {
    await p.goto(URL + '/#/acc/' + C + '?edit=1'); await p.waitForSelector('#ed-savestay');
    await p.route('**/api/accounts/' + C, r => r.request().method() === 'PUT' ? r.abort() : r.continue());
    await p.locator('input[data-l="entries"][data-k="a"]').fill('777'); await p.click('#ed-savestay');
    await p.waitForFunction(() => /השמירה נכשלה — נסה שוב/.test(document.querySelector('.actionbar [data-savest]').textContent));
    assert.strictEqual(await p.locator('input[data-l="entries"][data-k="a"]').inputValue(), '777'); assert.strictEqual((await acc(C)).entries[0].a, 650);
    await p.unroute('**/api/accounts/' + C); await p.click('#ed-savestay'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('.actionbar [data-savest]').textContent));
    assert.strictEqual((await acc(C)).entries[0].a, 777);
  });
  await step('מעבר מסך עם שינויים: ״הישאר במסך״ / ״שמור והמשך״ / ״המשך בלי לשמור״', async () => {
    await p.locator('input[data-l="entries"][data-k="a"]').fill('801');
    await p.click('nav a[href="#/accounts"], #side a[href="#/accounts"] >> nth=0'); await p.waitForSelector('#lvsave');
    const t = await p.locator('#sheet').innerText(); assert.ok(t.includes('שמור והמשך') && t.includes('המשך בלי לשמור') && t.includes('הישאר במסך'));
    await p.click('#lvstay'); assert.ok(p.url().includes(C + '?edit=1')); assert.strictEqual(await p.locator('input[data-l="entries"][data-k="a"]').inputValue(), '801');
    await p.click('#side a[href="#/accounts"]'); await p.click('#lvsave'); await p.waitForSelector('#newday');
    assert.strictEqual((await acc(C)).entries[0].a, 801, 'נשמר לפני המעבר');
    await p.goto(URL + '/#/acc/' + C + '?edit=1'); await p.waitForSelector('#ed-savestay'); await p.locator('input[data-l="entries"][data-k="a"]').fill('999');
    await p.click('#side a[href="#/accounts"]'); await p.click('#lvgo'); await p.waitForSelector('#newday');
    assert.strictEqual((await acc(C)).entries[0].a, 801, 'בלי לשמור');
  });
  await step('שמירה שנכשלה ב״שמור והמשך״ — לא עוברים מסך', async () => {
    await p.goto(URL + '/#/acc/' + C + '?edit=1'); await p.waitForSelector('#ed-savestay'); await p.locator('input[data-l="entries"][data-k="a"]').fill('802');
    await p.route('**/api/accounts/' + C, r => r.request().method() === 'PUT' ? r.abort() : r.continue());
    await p.click('#side a[href="#/accounts"]'); await p.click('#lvsave'); await p.waitForSelector('#lverr .note.err');
    assert.ok(p.url().includes('edit=1')); await p.unroute('**/api/accounts/' + C); await p.click('#lvsave'); await p.waitForSelector('#newday');
    assert.strictEqual((await acc(C)).entries[0].a, 802);
  });
  await step('חשבון בוקר: מעבר ליום קודם רגע אחרי שינוי חלוקת הריבית — השינוי לא אובד', async () => {
    await p.goto(URL + '/#/acc/' + M); await p.waitForSelector('#m-rp-in');
    await p.fill('#m-rp-in', '30'); await p.click('#dprev'); // השינוי עדיין בהשהיה של השמירה האוטומטית
    const sheet = await p.waitForSelector('#lvsave', { timeout: 3000 }).catch(() => null);
    if (sheet) await p.click('#lvsave');
    await p.waitForTimeout(1200); assert.strictEqual((await acc(M)).rp, 30, 'חלוקת הריבית נשמרה');
  });
  await step('אין שגיאות דף', async () => { assert.deepStrictEqual(p.errs, []); });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו. צילומים: ${OUT}`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
