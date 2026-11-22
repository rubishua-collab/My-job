// בדיקת מזעור/פתיחה של חלון ״וואטסאפ פרטי״ בתחתית רשימת הגבייה (אייפון).
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8480, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-wm-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const names = ['אבי', 'בני', 'גלי', 'דנה', 'הדס', 'ורד', 'זיו', 'חן', 'טל', 'יעל', 'כרמל', 'לי', 'מור', 'נוי', 'סהר', 'עדי'];
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-22', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + W); const data = { ...a, entries: names.map((n, i) => ({ n: n + ' כהן', p: '05' + String(20000000 + i).padStart(8, '0'), a: 100 + i, c: i % 2 ? 'בן' : 'טל', t: '10:' + String(10 + i), s: '' })), expenses: [] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + W, { data, baseVersion: a._version, opId: 'f' }); }
  const tap = async (sel) => { const bb = await p.locator(sel).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  const topAt = (sel) => p.evaluate((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!x && (x === el || el.contains(x)); }, sel);
  let y0;

  await step('הכנה: סימון 2 לקוחות, סינון ״כהן״ וגלילה לאמצע הרשימה', async () => {
    try { await p.evaluate(() => localStorage.removeItem('yh:wamin')); } catch { /* */ }
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#sendbar');
    await p.fill('#fq', 'כהן'); await p.waitForTimeout(500);
    await p.locator('.li[data-row] input.ck').nth(0).check(); await p.locator('.li[data-row] input.ck').nth(1).check();
    await p.evaluate(() => scrollTo(0, 700)); await p.waitForTimeout(100); y0 = await p.evaluate(() => scrollY);
    assert.ok(await p.locator('#wamin').isVisible()); assert.ok((await p.locator('#wamin').innerText()).includes('מזער'));
  });
  await step('״מזער ⌄״ — לחיצה אחת: נשארת לשונית ״וואטסאפ פרטי ⌃״; הבחירה, הסינון והגלילה נשמרים', async () => {
    await tap('#wamin'); await p.waitForTimeout(260);
    assert.ok(await p.locator('#watab').isVisible()); assert.ok(!(await p.locator('#sendpriv').isVisible()));
    assert.ok((await p.locator('#watab').innerText()).includes('וואטסאפ פרטי') && (await p.locator('#watab').innerText()).includes('2 נבחרו'));
    assert.strictEqual(await p.inputValue('#fq'), 'כהן'); assert.ok(Math.abs((await p.evaluate(() => scrollY)) - y0) < 4, 'הגלילה נשמרה');
    const bb = await p.locator('#watab').boundingBox(); const tb = await p.locator('#tabbar').boundingBox(); assert.ok(bb.height >= 40 && bb.y + bb.height <= tb.y + 2, 'הלשונית מעל סרגל הניווט');
  });
  await step('כשהלשונית מוצגת: גלילה עד הלקוח האחרון, והכפתורים שלו לא מכוסים', async () => {
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(150);
    await p.evaluate(() => { [...document.querySelectorAll('.li[data-row]')].pop().id = 'lastrow'; }); const last = '#lastrow'; await p.locator(last).scrollIntoViewIfNeeded(); await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(150);
    for (const s of [`${last} .st button[data-s="נאסף"]`, `${last} [data-delent]`, `${last} input.ck`]) { await p.locator(s).scrollIntoViewIfNeeded(); await p.waitForTimeout(80); assert.ok(await topAt(s), 'מכוסה: ' + s); }
    await p.locator(`${last} input.ck`).check(); assert.ok((await p.locator('#watab').innerText()).includes('3 נבחרו'));
  });
  await step('לחיצה אחת על הלשונית פותחת את החלון המלא; הבחירה (3) נשמרת; גם בלי בחירה הכפתורים עובדים', async () => {
    await tap('#watab'); await p.waitForTimeout(260);
    assert.ok(await p.locator('#sendpriv').isVisible()); assert.ok((await p.locator('#sendpriv').innerText()).includes('3 שורות'));
    await p.click('#selnone'); await p.waitForTimeout(150); assert.ok((await p.locator('#sendpriv').innerText()).includes('0'));
    await tap('#wamin'); await p.waitForTimeout(260); assert.ok(await p.locator('#watab').isVisible());
    await tap('#watab'); await p.waitForTimeout(260); assert.ok(await p.locator('#wamin').isVisible());
  });
  await step('סרגל הניווט עובד בשני המצבים, והמצב (ממוזער) נשמר כשחוזרים', async () => {
    await tap('#wamin'); await p.waitForTimeout(260);
    await p.click('#tabbar a[href="#/accounts"]'); await p.waitForSelector('#newday');
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#sendbar'); assert.ok(await p.locator('#watab').isVisible(), 'נשאר ממוזער');
    await tap('#watab'); await p.waitForTimeout(260);
    await p.click('#tabbar a[href="#/today"]'); await p.waitForSelector('.kpis');
    await p.screenshot({ path: path.join(os.tmpdir(), 'wa-min-iphone.png') }); assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
