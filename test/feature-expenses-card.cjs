// בדיקת כרטיס ״הוצאות של גובה״: כמה שורות, שמירה בלי לצאת, ״הוצאות לתאריך הנבחר״ — זהה בכל הלשוניות.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8550, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-xc-'));
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
  const DATE = '2026-11-23'; // יום קודם
  const mk = async (kind, fill, op) => { const { id } = await api('POST', '/api/accounts', { kind, date: DATE, opId: op }); const a = await api('GET', '/api/accounts/' + id); const data = { ...a, ...fill }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: op + 'f' }); return id; };
  const C = await mk('collectors', { entries: [{ n: 'גבייה', a: 1000, c: 'בן', k: 'd' }, { n: 'גבייה ב', a: 500, c: 'אביחי', k: 'd' }] }, 'c');
  const W = await mk('work', { entries: [{ n: 'דני', p: '', a: 1000, c: 'בן', t: '10:00', s: 'נאסף', ga: 1000 }, { n: 'רון', p: '', a: 500, c: 'אביחי', t: '11:00', s: 'נאסף', ga: 500 }], expenses: [] }, 'w');
  const S = await mk('split', { records: [{ n: 'דני', fn: 'דני', ph: '', a: 1000, c: 'בן', cnt: 1 }, { n: 'רון', fn: 'רון', ph: '', a: 500, c: 'אביחי', cnt: 1 }] }, 's');
  const row = (i) => p.locator('.xc-row').nth(i);
  const fillRow = async (i, c, a, n) => { await row(i).locator('[data-xf="c"]').fill(c); await row(i).locator('[data-xf="a"]').fill(a); await row(i).locator('[data-xf="n"]').fill(n); };
  const groupTotal = async (c) => (await p.locator(`.xc-g[data-xg="${c}"] .xc-gt`).innerText()).trim();

  await step('חשבון גובים → ״הוצאות של גובה״: שלוש שורות (דלק 100 בן, חניה 40 בן, שליחות 80 אביחי)', async () => {
    await p.goto(URL + '/#/acc/' + C); await p.waitForSelector('.band'); await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('#xc-add');
    assert.ok((await p.locator('#xc-list').innerText()).includes('אין עדיין הוצאות'));
    await fillRow(0, 'בן', '100', 'דלק'); await p.click('#xc-add'); await fillRow(1, 'בן', '40', 'חניה'); await p.click('#xc-add'); await fillRow(2, 'אביחי', '80', 'שליחות');
    assert.strictEqual(await p.locator('.xc-row').count(), 3); assert.strictEqual(await row(0).locator('[data-xf="n"]').inputValue(), 'דלק', 'השורות הקודמות נשמרו');
  });
  await step('״שמור הוצאה״ רק בשורת הדלק: הכרטיס נשאר פתוח, שתי השורות האחרות מלאות כפי שהוקלדו, והדלק ברשימה', async () => {
    await row(0).locator('[data-xsave]').click(); await p.waitForSelector('.xc-g[data-xg="בן"]');
    assert.ok(await p.locator('#xc-done').isVisible(), 'הכרטיס פתוח'); assert.strictEqual(await p.locator('.xc-row').count(), 2);
    assert.deepStrictEqual([await row(0).locator('[data-xf="n"]').inputValue(), await row(0).locator('[data-xf="a"]').inputValue(), await row(1).locator('[data-xf="c"]').inputValue(), await row(1).locator('[data-xf="n"]').inputValue()], ['חניה', '40', 'אביחי', 'שליחות']);
    assert.strictEqual(await groupTotal('בן'), '100 ₪');
  });
  await step('שורה חסרה מסומנת במקום והטקסט נשמר', async () => {
    await p.click('#xc-add'); await row(2).locator('[data-xf="n"]').fill('קפה'); await row(2).locator('[data-xsave]').click(); await p.waitForTimeout(200);
    assert.ok(await row(2).locator('label.bad').count() >= 2); assert.strictEqual(await row(2).locator('[data-xf="n"]').inputValue(), 'קפה');
    await row(2).locator('[data-xrm]').click(); assert.strictEqual(await p.locator('.xc-row').count(), 2);
  });
  await step('״שמור את כל ההוצאות״: שלוש הוצאות, בן 140, אביחי 80, סה״כ 220; הכרטיס נשאר פתוח עם שורה ריקה להוצאה הבאה', async () => {
    await p.locator('#xc-all').dblclick(); await p.waitForFunction(() => (document.querySelector('.xc-tot')?.textContent || '').includes('220'));
    assert.strictEqual(await groupTotal('בן'), '140 ₪'); assert.strictEqual(await groupTotal('אביחי'), '80 ₪');
    assert.ok((await p.locator('.xc-tot').innerText()).includes('סה״כ הוצאות לכל הגובים: 220 ₪'));
    assert.strictEqual(await p.locator('#xc-list .li').count(), 3, 'בלי כפילות גם בלחיצה כפולה'); assert.strictEqual(await p.locator('.xc-row').count(), 1); assert.strictEqual(await row(0).locator('[data-xf="a"]').inputValue(), '');
    const w = await api('GET', '/api/accounts/' + W); assert.strictEqual(w.expenses.length, 3); assert.strictEqual(w.date, DATE);
  });
  await step('״סיום״ עם שורה שלא נשמרה שואל קודם; אפשר לחזור לכרטיס', async () => {
    await fillRow(0, 'בן', '5', 'מים'); let asked = ''; p.once('dialog', d => { asked = d.message(); d.dismiss(); }); await p.click('#xc-done');
    assert.ok(asked.includes('שלא נשמרו')); assert.ok(await p.locator('#xc-done').isVisible(), 'חזרנו לכרטיס'); assert.strictEqual(await row(0).locator('[data-xf="n"]').inputValue(), 'מים');
    p.once('dialog', d => d.accept()); await p.click('#xc-done'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
  });
  await step('חשבון גובים: נטו של בן ירד ב-140 ושל אביחי ב-80 — פעם אחת', async () => {
    const a = await api('GET', '/api/accounts/' + C); const ex = (c) => a.entries.filter(e => e.k === 'e' && e.c === c).reduce((s, e) => s + e.a, 0);
    assert.strictEqual(ex('בן'), 140); assert.strictEqual(ex('אביחי'), 80); assert.strictEqual(a.entries.filter(e => e.k === 'e').length, 3);
  });
  for (const [nm, id] of [['איסוף יום', W], ['פיצול', S]]) {
    await step(`פתיחת הכרטיס מ״${nm}״ באותו תאריך: אותו פירוט וסכומים (בן 140, אביחי 80, סה״כ 220)`, async () => {
      await p.goto(URL + '/#/acc/' + id); await p.waitForSelector('.band'); await p.click('.band button:has-text("הוצאות של גובה")'); await p.waitForSelector('.xc-tot');
      assert.strictEqual(await groupTotal('בן'), '140 ₪'); assert.strictEqual(await groupTotal('אביחי'), '80 ₪'); assert.ok((await p.locator('.xc-tot').innerText()).includes('220'));
      const t = await p.locator('#xc-list').innerText(); for (const w of ['דלק', 'חניה', 'שליחות']) assert.ok(t.includes(w), w);
      await p.click('#xc-done'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
    });
  }
  await step('איסוף יום: נטו למסירה של בן 1,000 − 140 = 860; אין שגיאות דף', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.wgcard');
    const c = p.locator('.wgcard[data-wg="בן"]'); assert.ok((await c.locator('.wg-net').innerText()).includes('860'));
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
