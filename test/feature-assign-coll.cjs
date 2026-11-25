// בדיקת קבלה: ״שייך לגובה״ / ״העבר לגובה אחר״ באיסוף יום (אייפון) — דמיטרי גלמן 20:00, 7,450 ₪ → בן.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8563, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-as-'));
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
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-25', opId: 'w' });
  const E = [
    { _k: 'd1', n: 'דמיטרי גלמן', a: 7450, c: '', t: '20:00', p: '0501111111', by: 'בן' }, // ״אסף בפועל: בן״ — אבל גובה אחראי ריק
    { _k: 'd2', n: 'דמיטרי גלמן', a: 1200, c: '', t: '21:30', p: '0501111111' },
    { _k: 'n1', n: 'שושנה לוי', a: 800, c: '', t: '09:00' },
    { _k: 'b1', n: 'רון בר', a: 3000, c: 'בן', t: '10:00', s: 'נאסף' }, { _k: 'b2', n: 'גיל אור', a: 1000, c: 'בן', t: '11:00' },
    { _k: 't1', n: 'מאיר טל', a: 2500, c: 'טל', t: '12:00' },
  ];
  { const a = await api('GET', '/api/accounts/' + W); const d = { ...a, entries: E }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); await api('PUT', '/api/accounts/' + W, { data: d, baseVersion: a._version, opId: 'f' }); }
  const grp = (g) => p.locator(`.wgcard[data-wg="${g}"]`);
  const expOf = async (g) => numOf(await grp(g).locator('.grid > div').first().locator('b').innerText());
  const cntOf = async (g) => numOf(await grp(g).locator('.row.sp .muted').innerText());
  const keysIn = (g) => grp(g).locator('.li[data-key]').evaluateAll(els => els.map(e => e.dataset.key));
  const fresh = async () => { await p.goto(URL + '/#/acc/' + W); await p.reload(); await p.waitForSelector('.wgcard'); };
  let before;

  await fresh();
  await step('כפתור ״שייך לגובה״ בכל כרטיס בקבוצת ״ללא גובה״, ו״העבר לגובה אחר״ בכרטיס של לקוח משויך', async () => {
    for (const k of ['d1', 'd2', 'n1']) assert.match(await p.locator(`[data-assign="${k}"]`).innerText(), /שייך לגובה/);
    for (const k of ['b1', 'b2', 't1']) assert.match(await p.locator(`[data-assign="${k}"]`).innerText(), /העבר לגובה אחר/);
    before = { noc: await expOf('ללא גובה'), ben: await expOf('בן'), nocN: await cntOf('ללא גובה'), benN: await cntOf('בן'), all: numOf(await p.locator('.kpi').first().locator('.v').innerText()) };
    assert.deepStrictEqual(before, { noc: 9450, ben: 4000, nocN: 3, benN: 2, all: 15950 });
  });
  await step('חיפוש ״דמיט״ → פתיחת השורה של 20:00 → ״שייך לגובה״ → בן → ״שמור שיוך״: מיד אצל בן, פעם אחת, ונעלמת מ״ללא גובה״; 7,450 ₪ עברו בלי כפילות', async () => {
    await p.fill('#fq', 'דמיט'); await p.waitForTimeout(500);
    assert.deepStrictEqual((await keysIn('ללא גובה')).sort(), ['d1', 'd2']);
    const y0 = await p.evaluate(() => scrollY);
    await p.locator('.li[data-key="d1"] .t').click(); await p.waitForSelector('#rassign'); // פתיחת השורה
    assert.match(await p.locator('#sheet').innerText(), /גובה אחראי\s*ללא גובה/);
    await p.click('#rassign'); await p.waitForSelector('#asel');
    assert.ok(await p.locator('#asave').isDisabled(), 'נעול עד בחירה');
    await p.selectOption('#asel', 'בן'); await p.click('#asave');
    await p.waitForSelector('#sheet', { state: 'hidden' });
    assert.strictEqual(await p.inputValue('#fq'), 'דמיט', 'החיפוש נשאר'); assert.ok(p.url().includes(W));
    assert.deepStrictEqual(await keysIn('בן'), ['d1']); assert.deepStrictEqual(await keysIn('ללא גובה'), ['d2']);
    assert.strictEqual(await p.locator('.li[data-key="d1"]').count(), 1);
    assert.strictEqual(await expOf('בן'), before.ben + 7450); assert.strictEqual(await expOf('ללא גובה'), before.noc - 7450);
    assert.strictEqual(await cntOf('בן'), before.benN + 1); assert.strictEqual(await cntOf('ללא גובה'), before.nocN - 1);
    assert.strictEqual(numOf(await p.locator('.kpi').first().locator('.v').innerText()), before.all, 'הסה״כ לא השתנה');
    assert.match(await p.locator('[data-assign="d1"]').innerText(), /העבר לגובה אחר/);
  });
  await step('הסינון ״בן״ מציג את דמיטרי; ״אסף בפועל״, הסטטוס והסכום שנגבה לא השתנו', async () => {
    await p.fill('#fq', ''); await p.waitForTimeout(400);
    await p.click('.chip[data-c="בן"]'); await p.waitForTimeout(200);
    assert.ok((await p.locator('.li[data-row]').evaluateAll(els => els.map(e => e.dataset.key))).includes('d1'));
    await p.click('.chip[data-c=""]');
    const a = await api('GET', '/api/accounts/' + W); const e = a.entries.find(x => x._k === 'd1');
    assert.strictEqual(e.c, 'בן'); assert.strictEqual(e.by, 'בן'); assert.ok(!e.s); assert.ok(e.ga === undefined);
    assert.strictEqual(a.entries.length, 6); assert.strictEqual(a.entries.filter(x => x.n === 'דמיטרי גלמן' && x.t === '20:00').length, 1);
  });
  await step('אחרי יציאה וכניסה מחדש: בן מוצג כגובה האחראי, הסכומים זהים; ההיסטוריה של השורה מתעדת את השיוך', async () => {
    const now = { ben: await expOf('בן'), noc: await expOf('ללא גובה') };
    await p.goto(URL + '/#/today'); await p.waitForSelector('.kpis'); await fresh();
    assert.ok((await keysIn('בן')).includes('d1')); assert.ok(!(await keysIn('ללא גובה')).includes('d1'));
    assert.deepStrictEqual({ ben: await expOf('בן'), noc: await expOf('ללא גובה') }, now);
    await p.locator('.li[data-key="d1"] .t').click(); await p.waitForSelector('#rassign');
    assert.match(await p.locator('#sheet').innerText(), /גובה אחראי\s*בן/);
    await p.waitForFunction(() => /גובה אחראי: ללא גובה ← בן/.test(document.querySelector('#rh')?.textContent || ''));
    await p.click('#sheet [data-close]');
  });
  await step('שמירה שנכשלה: הודעה בחלון, הכרטיס לא זז; ״שמור שיוך״ שוב — נשמר פעם אחת', async () => {
    let fail = true; await p.route('**/api/accounts/*/assign', r => fail ? r.abort('internetdisconnected') : r.continue());
    await p.click('[data-assign="n1"]'); await p.selectOption('#asel', 'טל'); await p.click('#asave');
    await p.locator('#aerr .note.err').waitFor(); assert.match(await p.locator('#aerr').innerText(), /לא נשמר/);
    assert.ok((await keysIn('ללא גובה')).includes('n1'));
    fail = false; await p.click('#asave'); await p.waitForSelector('#sheet', { state: 'hidden' });
    assert.ok((await keysIn('טל')).includes('n1')); assert.strictEqual(await expOf('טל'), 3300);
    const h = (await api('GET', `/api/accounts/${W}/history`)).filter(x => x.item === 'n1'); assert.strictEqual(h.length, 1);
    await p.unroute('**/api/accounts/*/assign');
  });
  await step('״העבר לגובה אחר״ מבן לטל כשמסוננים לפי בן: הכרטיס עובר והמסך עובר לסינון ״טל״; אין שגיאות דף', async () => {
    await p.click('.chip[data-c="בן"]'); await p.waitForTimeout(200);
    await p.click('[data-assign="b2"]'); await p.selectOption('#asel', 'טל'); await p.click('#asave'); await p.waitForSelector('#sheet', { state: 'hidden' });
    assert.strictEqual(await p.getAttribute('.chip[data-c="טל"]', 'aria-pressed'), 'true');
    assert.ok((await keysIn('טל')).includes('b2'));
    await p.click('.chip[data-c=""]');
    assert.strictEqual(await expOf('בן'), 3000 + 7450);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
