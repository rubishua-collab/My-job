// בדיקת קבלה: עריכת גבייה בתוך השורה באיסוף יום (אייפון), בלי כפתור העריכה העליון.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8564, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ie-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const numOf = (t) => +String(t).replace(/[^\d.-]/g, '');
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await wait(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-26', opId: 'w' });
  const E = [{ _k: 'y1', n: 'יוסי ממן', a: 12000, c: 'בן', t: '18:00', p: '0521234567', by: 'בן' }, { _k: 'y2', n: 'יוסי ממן', a: 12000, c: 'בן', t: '18:00', p: '0521234567' }];
  for (let i = 0; i < 14; i++) E.push({ _k: 'o' + i, n: 'לקוח ' + i, a: 100 * (i + 1), c: i % 2 ? 'בן' : 'טל', t: String(9 + (i % 9)).padStart(2, '0') + ':00' });
  { const a = await api('GET', '/api/accounts/' + W); const d = { ...a, entries: E }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); await api('PUT', '/api/accounts/' + W, { data: d, baseVersion: a._version, opId: 'f' }); }
  const row = (k) => p.locator(`.li[data-key="${k}"]`);
  const ent = async (k) => (await api('GET', '/api/accounts/' + W)).entries.find(x => x._k === k);
  const topEdit = []; p.on('framenavigated', f => { if (f === p.mainFrame() && /edit=1/.test(f.url())) topEdit.push(f.url()); });
  await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-key="y2"]');

  await step('לחיצה על 18:00 בשורה השנייה פותחת בורר שעה בתוך אותה שורה; 18:30 → ״שמור״ בשורה: רק הגבייה הזו השתנתה, מיד ואחרי רענון', async () => {
    await row('y2').scrollIntoViewIfNeeded(); const y0 = await p.evaluate(() => scrollY);
    await row('y2').locator('[data-ef="t"]').click();
    const inp = row('y2').locator('.ied input[data-ei="t"]'); await inp.waitFor();
    assert.strictEqual(await inp.getAttribute('type'), 'time'); assert.strictEqual(await inp.inputValue(), '18:00');
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
    assert.strictEqual(await p.locator('.ied').count(), 1, 'רק השורה שנבחרה נפתחה'); assert.strictEqual(await p.locator('#sheet:not([hidden])').count(), 0);
    await inp.fill('18:30'); await row('y2').locator('.ied').evaluate(el => el.scrollIntoView({ block: 'center' })); const y1 = await p.evaluate(() => scrollY); const r1 = await row('y2').evaluate(el => el.getBoundingClientRect().top); await row('y2').locator('[data-esave]').click();
    await p.waitForFunction(() => !document.querySelector('.ied'));
    assert.strictEqual(await row('y2').locator('[data-ef="t"]').innerText(), '18:30'); assert.strictEqual(await row('y1').locator('[data-ef="t"]').innerText(), '18:00');
    { const y2 = await p.evaluate(() => scrollY); const r2 = await row('y2').evaluate(el => el.getBoundingClientRect().top); assert.ok(Math.abs(r2 - r1) < 5, 'השורה נשארה באותו מקום במסך'); } assert.ok(Math.abs(y1 - y0) < 400);
    assert.strictEqual((await ent('y2')).t, '18:30'); assert.strictEqual((await ent('y1')).t, '18:00');
    await p.reload(); await p.waitForSelector('.li[data-key="y2"]');
    assert.strictEqual(await row('y2').locator('[data-ef="t"]').innerText(), '18:30'); assert.strictEqual(await row('y1').locator('[data-ef="t"]').innerText(), '18:00');
    assert.deepStrictEqual(topEdit, [], 'בלי כפתור העריכה העליון');
  });
  await step('לחיצה על הסכום 12,000 ₪: מקלדת מספרית עם הסכום הקיים מסומן; שינוי ל-11,500 מעדכן את הסכומים מיד', async () => {
    const tot0 = numOf(await p.locator('.kpi').first().locator('.v').innerText());
    await row('y1').locator('[data-ef="a"]').click();
    const inp = row('y1').locator('.ied input[data-ei="a"]'); await inp.waitFor();
    assert.strictEqual(await inp.getAttribute('inputmode'), 'decimal'); assert.strictEqual(await inp.inputValue(), '12000');
    assert.ok(await inp.evaluate(el => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length), 'הסכום מסומן');
    await p.keyboard.type('11500'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => !document.querySelector('.ied'));
    assert.match(await row('y1').locator('.a').innerText(), /11,500/); assert.match(await row('y2').locator('.a').innerText(), /12,000/);
    assert.strictEqual(numOf(await p.locator('.kpi').first().locator('.v').innerText()), tot0 - 500);
    assert.strictEqual((await ent('y1')).a, 11500); assert.strictEqual((await ent('y2')).a, 12000);
  });
  await step('״ערוך גבייה״ (ליד ״העבר לגובה אחר״) מרחיב רק את הכרטיס הזה עם כל השדות; ״ביטול״ לא שומר; שינוי טלפון ושם נשמר לשורה הזו בלבד, עם סינון פעיל', async () => {
    const acts = await row('y2').locator('.delent button').allInnerTexts(); assert.ok(acts[0].includes('ערוך גבייה') && acts[1].includes('העבר לגובה אחר'), acts.join('|'));
    await p.fill('#fq', 'יוסי'); await p.waitForTimeout(500);
    await row('y2').locator('[data-edrow]').click();
    const box = row('y2').locator('.ied'); await box.waitFor();
    assert.deepStrictEqual(await box.locator('[data-ei]').evaluateAll(els => els.map(e => e.dataset.ei)), ['n', 'p', 'a', 't', 'h', 'c']);
    assert.strictEqual(await p.locator('.ied').count(), 1);
    await box.locator('[data-ei="p"]').fill('0539999999'); await box.locator('[data-ecancel]').click();
    assert.strictEqual(await p.locator('.ied').count(), 0); assert.strictEqual((await ent('y2')).p, '0521234567');
    await row('y2').locator('[data-edrow]').click();
    await row('y2').locator('[data-ei="p"]').fill('0539999999'); await row('y2').locator('[data-ei="n"]').fill('יוסי ממן (ב)');
    await row('y2').locator('[data-esave]').click(); await p.waitForFunction(() => !document.querySelector('.ied'));
    assert.strictEqual(await p.inputValue('#fq'), 'יוסי', 'הסינון נשמר');
    assert.match(await row('y2').innerText(), /יוסי ממן \(ב\)/); assert.match(await row('y2').locator('a[href^="tel:"]').getAttribute('href'), /0539999999/);
    const y1 = await ent('y1'), y2 = await ent('y2'); assert.strictEqual(y1.p, '0521234567'); assert.strictEqual(y1.n, 'יוסי ממן'); assert.strictEqual(y2.p, '0539999999');
    assert.strictEqual(y2.c, 'בן'); assert.strictEqual(y1.by, 'בן');
    await p.fill('#fq', ''); await p.waitForTimeout(400);
  });
  await step('הפרדה בין פעולות: טלפון = חיוג; ״נאסף״ / סימון / העברה / מחיקה לא פותחים עריכה', async () => {
    assert.match(await row('y1').locator('a[href^="tel:"]').getAttribute('href'), /^tel:/);
    await row('y1').locator('a[href^="tel:"]').evaluate(a => a.addEventListener('click', e => e.preventDefault(), { once: true }));
    await row('y1').locator('a[href^="tel:"]').click(); await p.waitForTimeout(200);
    assert.strictEqual(await p.locator('.ied').count(), 0); assert.strictEqual(await p.locator('#sheet:not([hidden])').count(), 0);
    await row('o1').locator('.st button[data-s="לעבור"]').click(); await p.waitForTimeout(900);
    assert.strictEqual(await p.locator('.ied').count(), 0); assert.strictEqual(await p.locator('#sheet:not([hidden])').count(), 0); assert.strictEqual((await ent('o1')).s, 'לעבור');
    await row('o2').locator('input.ck').check(); assert.strictEqual(await p.locator('.ied').count(), 0); assert.strictEqual(await p.locator('#sheet:not([hidden])').count(), 0);
    await row('o2').locator('input.ck').uncheck();
    await row('o3').locator('[data-assign]').click(); await p.waitForSelector('#asel'); assert.strictEqual(await p.locator('.ied').count(), 0); await p.click('#sheet [data-close]');
    await row('o3').locator('[data-delent]').click(); await p.waitForSelector('#delok'); assert.strictEqual(await p.locator('.ied').count(), 0); await p.click('#delno');
  });
  await step('השמירה נכשלה: השדה נשאר פתוח עם מה שהקלדתי והודעה ברורה; ״שמור״ שוב — נשמר פעם אחת', async () => {
    let fail = true; await p.route('**/api/accounts/*/entry', r => fail ? r.abort('internetdisconnected') : r.continue());
    await row('o4').locator('[data-ef="t"]').click(); const inp = row('o4').locator('[data-ei="t"]'); await inp.fill('15:45');
    await row('o4').locator('[data-esave]').click();
    await row('o4').locator('.ied .note.err').waitFor(); assert.match(await row('o4').locator('.ied .note.err').innerText(), /לא נשמר/);
    assert.strictEqual(await row('o4').locator('[data-ei="t"]').inputValue(), '15:45');
    fail = false; await row('o4').locator('[data-esave]').click(); await p.waitForFunction(() => !document.querySelector('.ied'));
    assert.strictEqual(await row('o4').locator('[data-ef="t"]').innerText(), '15:45'); assert.strictEqual((await ent('o4')).t, '15:45');
    const h = (await api('GET', `/api/accounts/${W}/history`)).filter(x => x.item === 'o4'); assert.strictEqual(h.length, 1);
    await p.unroute('**/api/accounts/*/entry');
  });
  await step('היסטוריית השורה מציגה את העריכה; אין שגיאות דף', async () => {
    await row('y2').locator('.t').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await row('y2').locator('.wnotes, .m').first().click().catch(() => {});
    if (!(await p.locator('#rh').count())) await p.evaluate(() => document.querySelector('.li[data-key="y2"]').click());
    await p.waitForFunction(() => /שעה: 18:00 ← 18:30/.test(document.querySelector('#rh')?.textContent || ''));
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
