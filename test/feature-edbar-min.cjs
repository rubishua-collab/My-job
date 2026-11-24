// בדיקת מזעור סרגל הפעולות במסך העריכה (אייפון): מזער → גלילה לשורה האחרונה → עריכה → נקודה כתומה → פתיחה → ״שמור שינויים״.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8530, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-eb-'));
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
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-24', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + W); const data = { ...a, entries: Array.from({ length: 18 }, (_, i) => ({ n: 'לקוח ' + (i + 1), p: '', a: 100 + i, c: i % 2 ? 'בן' : 'טל', t: '10:' + String(10 + i), s: '' })), expenses: [] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + W, { data, baseVersion: a._version, opId: 'f' }); }
  const tap = async (sel) => { const bb = await p.locator(sel).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  const onTop = (sel) => p.evaluate((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!x && (x === el || el.contains(x)); }, sel);
  const last = 'table tbody tr:last-child';

  await step('הסרגל פתוח: ״מזער ⌄״ בראשו; לחיצה אחת → נשארת לשונית ״פעולות ⌃״ מעל תפריט הניווט', async () => {
    await p.goto(URL + '/#/acc/' + W + '?edit=1'); await p.waitForSelector('#edmin');
    assert.ok((await p.locator('#edmin').innerText()).includes('מזער')); assert.ok(await p.locator('#ed-savestay').isVisible());
    await tap('#edmin'); await p.waitForTimeout(260);
    assert.ok(await p.locator('#edtab').isVisible()); assert.ok(!(await p.locator('#ed-savestay').isVisible())); assert.ok((await p.locator('#edtab').innerText()).includes('פעולות'));
    const t = await p.locator('#edtab').boundingBox(), nav = await p.locator('#tabbar').boundingBox(); assert.ok(t.y + t.height <= nav.y + 2 && t.height >= 40);
    assert.ok(await p.locator('#edtab [data-dirtydot]').isHidden(), 'אין נקודה כשאין שינויים');
  });
  await step('גלילה עד השורה האחרונה: השדות שלה ותפריט הניווט לא מכוסים', async () => {
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.locator(`${last} [data-k="a"]`).scrollIntoViewIfNeeded(); await p.waitForTimeout(100);
    for (const k of ['n', 'a', 't', 'c']) assert.ok(await onTop(`${last} [data-k="${k}"]`), 'מכוסה: ' + k);
    assert.ok(await onTop('#tabbar a[href="#/accounts"]'), 'תפריט הניווט מכוסה');
  });
  let y0;
  await step('עריכת סכום, שעה וגובה בשורה האחרונה: נקודה כתומה בלשונית, והסרגל נשאר ממוזער', async () => {
    y0 = await p.evaluate(() => scrollY);
    await p.locator(`${last} [data-k="a"]`).fill('999'); await p.locator(`${last} [data-k="t"]`).fill('19:45'); await p.locator(`${last} [data-k="c"]`).fill('רובי'); await p.locator(`${last} [data-k="c"]`).press('Tab');
    assert.ok(await p.locator('#edtab [data-dirtydot]').isVisible(), 'נקודה כתומה'); assert.ok(await p.locator('#edbar.is-min').count(), 'נשאר ממוזער');
  });
  await step('פתיחת הסרגל: הערכים וההגלילה נשמרים, שלושת הכפתורים ופרטי השמירה מופיעים; ״שמור שינויים״ שומר', async () => {
    await tap('#edtab'); await p.waitForTimeout(260);
    assert.ok(await p.locator('#ed-savestay').isVisible() && await p.locator('#ed-save').isVisible() && await p.locator('#edbody a:has-text("ביטול")').isVisible());
    assert.ok(await p.locator('#edbody [data-acctimes]').isVisible());
    assert.strictEqual(await p.locator(`${last} [data-k="a"]`).inputValue(), '999'); assert.ok(Math.abs((await p.evaluate(() => scrollY)) - y0) < 4, 'הגלילה נשמרה');
    assert.strictEqual((await api('GET', '/api/accounts/' + W)).entries[17].a, 117, 'לא נשמר לפני הלחיצה');
    await tap('#ed-savestay'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('#edbody [data-savest]').textContent));
    const e = (await api('GET', '/api/accounts/' + W)).entries[17]; assert.deepStrictEqual([e.a, e.t, e.c], [999, '19:45', 'רובי']);
    assert.ok(await p.locator('#edtab [data-dirtydot]').isHidden());
  });
  await step('המצב (ממוזער) נזכר בפתיחה הבאה, ואין שגיאות דף', async () => {
    await tap('#edmin'); await p.waitForTimeout(260); await p.reload(); await p.waitForSelector('#edbar'); assert.ok(await p.locator('#edtab').isVisible());
    await tap('#edtab'); await p.waitForTimeout(260); assert.ok(await p.locator('#ed-savestay').isVisible());
    await p.screenshot({ path: path.join(os.tmpdir(), 'edbar-iphone.png') }); assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
