// בדיקת ״חיפוש לפי שם הלקוח״ בעריכת ״איסוף יום״ (אייפון): סינון מיידי, עריכה מתוך התוצאות ושמירה של כל הרשימה.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8470, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-es-'));
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
  const E = (n, a, c, t) => ({ n, p: '', a, c, t, s: '' });
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-22', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + W); const data = { ...a, entries: [E('אבי כהן', 1000, 'טל', '09:00'), E('עידן חגג', 7900, 'טל', '10:00'), E('שירה לוי', 400, 'רובי', '11:00'), E('עידן חגג', 725, 'רובי', '12:00'), E('דנה עידני', 300, 'טל', '13:00')], expenses: [{ n: 'דלק', a: 50, c: 'טל' }] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + W, { data, baseVersion: a._version, opId: 'f' }); }
  const rows = () => p.locator('table[data-tl="entries"] tbody tr:not([hidden])');
  const names = async () => { const out = []; const r = rows(); for (let i = 0; i < await r.count(); i++) out.push((await r.nth(i).locator('[data-k="n"]').inputValue()) + '|' + (await r.nth(i).locator('[data-k="a"]').inputValue())); return out; };

  await step('שורת החיפוש מתחת לכותרת ״שורות״ ולכפתורים ״הדבקה מאקסל״ ו״+ שורה״, מעל הטבלה', async () => {
    await p.goto(URL + '/#/acc/' + W + '?edit=1'); await p.waitForSelector('[data-edq="entries"]');
    const inp = p.locator('[data-edq="entries"]'); assert.strictEqual(await inp.getAttribute('placeholder'), 'חיפוש לפי שם הלקוח');
    const order = await p.evaluate(() => { const c = document.querySelector('[data-edq="entries"]').closest('.card'); const kids = [...c.querySelectorAll('h2, [data-paste], [data-add], [data-edq], table')]; return kids.map(k => k.tagName === 'TABLE' ? 'table' : k.dataset.edq ? 'search' : k.dataset.paste ? 'paste' : k.dataset.add ? 'add' : 'h2'); });
    assert.deepStrictEqual(order, ['h2', 'paste', 'add', 'search', 'table']);
  });
  await step('עריכה לפני החיפוש (סכום של שירה) — תישמר בסוף', async () => {
    const r = p.locator('table[data-tl="entries"] tbody tr', { has: p.locator('[data-k="n"][value="שירה לוי"]') }); await r.locator('[data-k="a"]').fill('450'); await r.locator('[data-k="a"]').press('Tab');
  });
  await step('הקלדה ברצף ״עידן״: הסמן נשאר בשדה, הטבלה לא מצוירת מחדש; מופיעות שתי השורות (7,900 ו-725) בסדר המקורי', async () => {
    await p.evaluate(() => document.querySelectorAll('table[data-tl="entries"] tbody tr').forEach(tr => { tr.__m = 1; }));
    await p.locator('[data-edq="entries"]').tap();
    for (const ch of 'עידן') { await p.keyboard.type(ch); assert.ok(await p.evaluate(() => document.activeElement && document.activeElement.dataset.edq === 'entries'), 'הסמן יצא מהשדה'); }
    assert.ok(await p.evaluate(() => [...document.querySelectorAll('table[data-tl="entries"] tbody tr')].every(tr => tr.__m === 1)), 'הטבלה צוירה מחדש');
    assert.deepStrictEqual(await names(), ['עידן חגג|7900', 'עידן חגג|725', 'דנה עידני|300']);
  });
  await step('חיפוש לפי שם משפחה וחלק מהשם; ״לא נמצאו שורות בשם הזה״; ״נקה חיפוש״ מחזיר הכול', async () => {
    await p.fill('[data-edq="entries"]', 'חגג'); assert.deepStrictEqual(await names(), ['עידן חגג|7900', 'עידן חגג|725']);
    await p.fill('[data-edq="entries"]', 'לוי'); assert.deepStrictEqual(await names(), ['שירה לוי|450']);
    await p.fill('[data-edq="entries"]', 'xyz'); assert.strictEqual(await rows().count(), 0); assert.ok(await p.locator('[data-edqe="entries"]').isVisible()); assert.strictEqual((await p.locator('[data-edqe="entries"]').innerText()).trim(), 'לא נמצאו שורות בשם הזה');
    await p.click('[data-edqx="entries"]'); assert.strictEqual(await rows().count(), 5); assert.strictEqual(await p.inputValue('[data-edq="entries"]'), '');
  });
  await step('חיפוש ״עידן״, שינוי שעה רק בשורה של 725 ₪, ״שמור שינויים״ כשהחיפוש פעיל', async () => {
    await p.fill('[data-edq="entries"]', 'עידן חגג');
    const r725 = rows().filter({ has: p.locator('[data-k="a"][value="725"]') }); await r725.locator('[data-k="t"]').fill('16:30');
    await p.click('#ed-savestay'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('.actionbar [data-savest]').textContent));
    assert.strictEqual(await rows().count(), 2, 'החיפוש נשאר פעיל אחרי השמירה');
  });
  await step('פתיחה מחדש: השעה נשמרה בשורה הנכונה, כל שורות היום מופיעות, והעריכה מלפני החיפוש נשמרה', async () => {
    const a = await api('GET', '/api/accounts/' + W); assert.strictEqual(a.entries.length, 5);
    const by = a.entries.map(e => e.n + '|' + e.a + '|' + e.t);
    assert.deepStrictEqual(by, ['אבי כהן|1000|09:00', 'עידן חגג|7900|10:00', 'שירה לוי|450|11:00', 'עידן חגג|725|16:30', 'דנה עידני|300|13:00']);
    assert.strictEqual(a.expenses.length, 1);
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.wgcard'); await p.goto(URL + '/#/acc/' + W + '?edit=1'); await p.waitForSelector('[data-edq="entries"]');
    assert.strictEqual(await rows().count(), 5); assert.strictEqual(await p.inputValue('[data-edq="entries"]'), '');
    const s = await p.locator('#ed-sum').innerText(); assert.ok(s.includes('10,375') && s.includes('50'), 'הסיכומים לכל היום: ' + s);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
