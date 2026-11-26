// בדיקת קבלה: ״פיצול / תשלום חלקי״ באיסוף יום (אייפון) — ליאור גושן 11,200 ₪ אצל רפי.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8569, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-pp-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const numOf = (t) => +String(t).replace(/[^\d.-]/g, '');
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) { const e = new Error(u + ': ' + JSON.stringify(j)); throw e; } return j; };
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-26', opId: 'w' });
  const E = [{ _k: 'L', n: 'ליאור גושן', a: 11200, c: 'רפי', t: '16:30', p: '0504098173' }, { _k: 'D', n: 'דנה לוי', a: 11200, c: 'רפי', t: '17:00' }, { _k: 'M', n: 'משה כץ', a: 5000, c: 'רפי', t: '18:00' }, { _k: 'O', n: 'אורי טל', a: 3000, c: 'אושר', t: '12:00' }, { _k: 'R', n: 'רון בר', a: 1500, c: 'רובי', t: '11:00' }];
  { const a = await api('GET', '/api/accounts/' + W); const d = { ...a, entries: E }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); await api('PUT', '/api/accounts/' + W, { data: d, baseVersion: a._version, opId: 'f' }); }
  const TOTAL = 11200 + 11200 + 5000 + 3000 + 1500;
  const kpi = async () => { const v = await p.locator('.kpis .kpi .v').allInnerTexts(); return { exp: numOf(v[0]), got: numOf(v[1]), left: numOf(v[2]) }; };
  // חשבון הגובה מהנתונים השמורים (בחיפוש פעיל כרטיס של גובה בלי תוצאות לא מוצג)
  const grp = async (g) => { const es = (await (await ctx.request.get(URL + '/api/accounts/' + W)).json()).entries.filter(e => e.c === g); const exp = es.reduce((s, e) => s + e.a, 0), got = es.filter(e => e.s === 'נאסף').reduce((s, e) => s + (e.ga ?? e.a), 0); return { exp, got, left: exp - got }; };
  const grpUI = async (g) => { const t = await p.locator(`.wgcard[data-wg="${g}"] .grid > div b`).allInnerTexts(); return { exp: numOf(t[0]), got: numOf(t[1]), left: numOf(t[2]) }; };
  const row = (k) => p.locator(`.li[data-key="${k}"]`);
  const ents = async () => (await api('GET', '/api/accounts/' + W)).entries;
  const pp = () => p.locator('[data-pp]');
  let calls = 0; await p.route('**/api/accounts/*/part', async (r) => { calls++; await new Promise(x => setTimeout(x, 400)); await r.continue(); });
  await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-key="L"]');

  await step('חיפוש ״ליאור״ → ״פיצול / תשלום חלקי״ ליד הסכום פותח באותה שורה; בזמן ההקלדה: ״יישאר לגבייה״; מעל היתרה — חסום', async () => {
    await p.fill('#fq', 'ליאור'); await p.waitForTimeout(400);
    await row('L').locator('[data-part]').click(); await pp().waitFor();
    assert.strictEqual(await p.locator('[data-pp]').count(), 1); assert.strictEqual(await row('L').locator('[data-pp]').count(), 1, 'בתוך השורה');
    assert.strictEqual(await pp().locator('[data-pv="by"]').inputValue(), 'רפי');
    await pp().locator('[data-pv="amount"]').pressSequentially('12000');
    assert.match(await pp().locator('.pp-calc').first().innerText(), /גבוה מהיתרה/); assert.ok(await pp().locator('[data-psave="pay"]').isDisabled());
    await pp().locator('[data-pv="amount"]').fill(''); await pp().locator('[data-pv="amount"]').pressSequentially('5500');
    assert.match(await pp().locator('.pp-calc').first().innerText(), /יישאר לגבייה:\s*5,700/);
    assert.ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.pv === 'amount'), 'המקלדת נשארת בשדה');
  });
  await step('שמירה (לחיצה כפולה): ״חוב מקורי 11,200 | נגבה 5,500 | נשאר 5,700 | שולם חלקית״; בקשה אחת; צפוי לא השתנה, נגבה ונשאר מתעדכנים; החיפוש נשאר', async () => {
    const k0 = await kpi(); calls = 0;
    await pp().locator('[data-psave="pay"]').dblclick(); await p.waitForFunction(() => !document.querySelector('[data-pp]'));
    assert.strictEqual(calls, 1, 'בקשה אחת');
    const dl = await row('L').locator('.dgline').innerText();
    assert.ok(/ליאור גושן[\s\S]*חוב מקורי\s*11,200[\s\S]*נגבה\s*5,500[\s\S]*נשאר\s*5,700[\s\S]*שולם חלקית/.test(dl), dl);
    assert.match(await row('L').locator('.a').innerText(), /5,700/);
    if (process.env.SHOT) { await row('L').scrollIntoViewIfNeeded(); await row('L').screenshot({ path: process.env.SHOT }); }
    assert.strictEqual(await p.inputValue('#fq'), 'ליאור', 'החיפוש נשאר');
    const k1 = await kpi(); assert.deepStrictEqual(k1, { exp: k0.exp, got: k0.got + 5500, left: k0.left - 5500 });
    assert.strictEqual(k1.exp, TOTAL);
    const L = (await ents()).filter(e => e.n === 'ליאור גושן'); assert.strictEqual(L.length, 2);
    const paid = L.find(e => e.pay), open = L.find(e => !e.pay); assert.strictEqual(paid.a, 5500); assert.strictEqual(paid.c, 'רפי'); assert.strictEqual(paid.s, 'נאסף'); assert.strictEqual(open.a, 5700); assert.strictEqual(open.c, 'רפי'); assert.strictEqual(paid.dg, open.dg);
  });
  await step('תשלום נוסף של 5,700 סוגר: ״נאסף במלואו״; נגבה 11,200, נשאר 0; תשלום נוסף חסום (אין יתרה)', async () => {
    await row('L').locator('[data-part]').click(); await pp().waitFor();
    await pp().locator('[data-pv="amount"]').pressSequentially('5700'); assert.match(await pp().locator('.pp-calc').first().innerText(), /סוגר את החוב/);
    await pp().locator('[data-psave="pay"]').click(); await p.waitForFunction(() => !document.querySelector('[data-pp]'));
    const dl = await row('L').locator('.dgline').innerText(); assert.ok(/נגבה\s*11,200[\s\S]*נשאר\s*0[\s\S]*נאסף במלואו/.test(dl), dl);
    assert.strictEqual(await row('L').locator('[data-part]').count(), 0);
    let e = null; try { await api('POST', `/api/accounts/${W}/part`, { op: 'pay', key: 'L', amount: 1, by: 'רפי', opId: 'x' }); } catch (x) { e = x; } assert.ok(e && /כבר סומן/.test(e.message));
  });
  await step('פיצול דנה לוי (לא שילמה) בין רפי (5,500) לאושר — השאר (5,700) מתמלא אוטומטית; נגבה 0; כל גובה רואה את החלק שלו; צפוי נספר פעם אחת', async () => {
    await p.fill('#fq', 'דנה'); await p.waitForTimeout(400); const k0 = await kpi(); const r0 = await grp('רפי'), o0 = await grp('אושר');
    await row('D').locator('[data-part]').click(); await pp().waitFor();
    await pp().locator('[data-pv="a1"]').pressSequentially('5500'); await pp().locator('[data-pv="c2"]').selectOption('אושר');
    assert.strictEqual(await pp().locator('[data-pp2]').inputValue(), '5,700');
    await pp().locator('[data-psave="split"]').click(); await p.waitForFunction(() => !document.querySelector('[data-pp]'));
    const D = (await ents()).filter(e => e.n === 'דנה לוי'); assert.deepStrictEqual(D.map(e => e.c + ':' + e.a).sort(), ['אושר:5700', 'רפי:5500']); assert.ok(D.every(e => !e.s));
    const k1 = await kpi(); assert.deepStrictEqual(k1, k0, 'צפוי / נגבה / נשאר לא השתנו');
    const r1 = await grp('רפי'), o1 = await grp('אושר'); assert.strictEqual(r1.exp, r0.exp - 5700); assert.strictEqual(o1.exp, o0.exp + 5700); assert.strictEqual(o1.got, 0);
    assert.match(await p.locator('.li[data-row]', { hasText: 'דנה לוי' }).first().locator('.dgline').innerText(), /חוב מקורי\s*11,200[\s\S]*נגבה\s*0[\s\S]*פוצל בין גובים/);
  });
  await step('אושר רושם תשלום חלקי על החלק שלו (2,000): רק החלק שלו מתעדכן; היתרה אצל אושר', async () => {
    const ok = (await ents()).find(e => e.n === 'דנה לוי' && e.c === 'אושר')._k;
    await row(ok).locator('[data-part]').click(); await pp().waitFor();
    assert.strictEqual(await pp().locator('[data-pv="by"]').inputValue(), 'אושר');
    await pp().locator('[data-pv="amount"]').pressSequentially('2000'); await pp().locator('[data-psave="pay"]').click(); await p.waitForFunction(() => !document.querySelector('[data-pp]'));
    const D = (await ents()).filter(e => e.n === 'דנה לוי'); assert.strictEqual(D.length, 3); assert.strictEqual(D.reduce((s, e) => s + e.a, 0), 11200);
    const o = await grp('אושר'); assert.strictEqual(o.got, 2000);
    assert.match(await row(ok).locator('.dgline').innerText(), /נגבה\s*2,000[\s\S]*נשאר\s*9,200[\s\S]*שולם חלקית/);
  });
  await step('תשלום חלקי עם העברת היתרה לגובה אחר: משה כץ — רפי גבה 1,000, היתרה 4,000 אצל אושר; ה-1,000 נשארים אצל רפי', async () => {
    await p.fill('#fq', 'משה'); await p.waitForTimeout(400); const r0 = await grp('רפי'), o0 = await grp('אושר');
    await row('M').locator('[data-part]').click(); await pp().waitFor();
    await pp().locator('[data-pv="amount"]').pressSequentially('1000'); await pp().locator('[data-pv="rest"]').selectOption('אושר');
    await pp().locator('[data-psave="pay"]').click(); await p.waitForFunction(() => !document.querySelector('[data-pp]'));
    const M = (await ents()).filter(e => e.n === 'משה כץ'); assert.deepStrictEqual(M.map(e => e.c + ':' + e.a + ':' + (e.s || '')).sort(), ['אושר:4000:', 'רפי:1000:נאסף']);
    const r1 = await grp('רפי'), o1 = await grp('אושר'); assert.strictEqual(r1.got, r0.got + 1000); assert.strictEqual(r1.exp, r0.exp - 4000); assert.strictEqual(o1.exp, o0.exp + 4000);
  });
  await step('שמירה שנכשלה: הודעה, ואז ״שמור״ שוב — נרשם פעם אחת', async () => {
    await p.fill('#fq', 'אורי'); await p.waitForTimeout(400);
    await p.unroute('**/api/accounts/*/part'); let fail = true; await p.route('**/api/accounts/*/part', async (r) => { if (fail) { fail = false; await r.fetch(); return r.abort('connectionreset'); } return r.continue(); });
    await row('O').locator('[data-part]').click(); await pp().waitFor(); await pp().locator('[data-pv="amount"]').pressSequentially('1000');
    await pp().locator('[data-psave="pay"]').click(); await pp().locator('.note.err').waitFor(); assert.match(await pp().locator('.note.err').innerText(), /לא נשמר/);
    await pp().locator('[data-psave="pay"]').click(); await p.waitForFunction(() => !document.querySelector('[data-pp]'));
    const O = (await ents()).filter(e => e.n === 'אורי טל'); assert.strictEqual(O.length, 2); assert.strictEqual(O.reduce((s, e) => s + e.a, 0), 3000);
  });
  await step('אחרי רענון: הכל נשמר, צפוי = 31,900 (כל חוב פעם אחת), נגבה = 11,200 + 2,000 + 1,000 + 1,000; אין שגיאות דף', async () => {
    await p.fill('#fq', ''); await p.waitForTimeout(500); await p.reload(); await p.waitForSelector('.kpis');
    assert.deepStrictEqual(await kpi(), { exp: TOTAL, got: 15200, left: TOTAL - 15200 });
    for (const g of ['רפי', 'אושר', 'רובי']) assert.deepStrictEqual(await grpUI(g), await grp(g), 'חשבון ' + g + ' במסך = בנתונים');
    assert.match(await p.locator('.li[data-row]', { hasText: 'ליאור גושן' }).first().locator('.dgline').innerText(), /נאסף במלואו/);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
