// בדיקת קבלה: ניהול גובים מתוך מסך הבחירה (אייפון) — הוספה מתוך שורת גבייה, זמינות בכל הלשוניות בלי רענון,
// תיקון שם בכל המקומות, כפילות, לא פעיל (עם העברת גביות פתוחות) וחזרה לפעילות.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8570, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ca-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const login = async () => { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const p = await login();
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const strip = (a) => { const d = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); return d; };
  const DATE = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  const mk = async (kind, f, op) => { const { id } = await api('POST', '/api/accounts', { kind, date: DATE, opId: op }); const a = await api('GET', '/api/accounts/' + id); await api('PUT', '/api/accounts/' + id, { data: { ...strip(a), ...f }, baseVersion: a._version, opId: op + 'f' }); return id; };
  const W = await mk('work', { entries: [{ _k: 'R', n: 'רונה אליה', a: 1050, c: 'סנטה', t: '18:00', p: '0523737989' }, { _k: 'A', n: 'אלירן גבסו', a: 400, c: 'סנטה', t: '18:00' }, { _k: 'B', n: 'בני רובין', a: 700, c: 'רובי', t: '10:00' }] }, 'w');
  const S = await mk('split', { records: [{ _k: 's1', n: 'שי לוי', fn: 'שי', ln: 'לוי', a: 900, c: 'רובי', t: '', cnt: 1 }] }, 's');
  await mk('collectors', { entries: [{ _k: 'c1', n: 'יוסי', a: 100, c: 'סנטה', k: 'd' }] }, 'c');
  const ent = async (k) => (await api('GET', '/api/accounts/' + W)).entries.find(e => e._k === k);
  const NEW = 'נועם החדש';
  // לשונית שנייה פתוחה על הפיצול — לבדוק שהרשימה מתעדכנת בה בלי רענון
  const p2 = await login(); await p2.goto(URL + '/#/acc/' + S); await p2.waitForSelector('#spt-lists', { state: 'attached' });
  const optsIn = (pg, sel) => pg.locator(sel).first().evaluate(s => [...s.options].map(o => o.value));

  await step('מתוך שורת גבייה (״ערוך גבייה״): משנים שעה וסכום, מקלידים שם גובה חדש → ״הוסף את ״נועם החדש״ כגובה חדש״ → נבחר בשורה, ושאר הפרטים נשמרים', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-key="R"]');
    await p.locator('.li[data-key="R"] [data-edrow]').click(); const box = p.locator('.li[data-key="R"] .ied'); await box.waitFor();
    await box.locator('[data-ei="t"]').fill('18:30'); await box.locator('[data-ei="a"]').fill('1100'); await box.locator('[data-ei="p"]').fill('0529999999');
    await box.locator('.cpk-q').fill(NEW);
    await box.locator('.cpk-addq').waitFor(); assert.match(await box.locator('.cpk-addq').innerText(), /הוסף את ״נועם החדש״ כגובה חדש/);
    await box.locator('.cpk-addq').click(); await box.locator('.cpk-msg .ok-t').waitFor();
    assert.strictEqual(await box.locator('[data-ei="c"]').inputValue(), NEW, 'נבחר בשורה');
    assert.strictEqual(await box.locator('[data-ei="t"]').inputValue(), '18:30'); assert.strictEqual(await box.locator('[data-ei="a"]').inputValue(), '1100'); assert.strictEqual(await box.locator('[data-ei="p"]').inputValue(), '0529999999');
    await box.locator('[data-esave]').click(); await p.waitForFunction(() => !document.querySelector('.ied'));
    const e = await ent('R'); assert.deepStrictEqual([e.c, e.t, e.a, e.p], [NEW, '18:30', 1100, '0529999999']);
    assert.ok(await p.locator(`.wgcard[data-wg="${NEW}"] .li[data-key="R"]`).count() === 1, 'בקבוצה של הגובה החדש');
  });
  await step('זמין מיד בכל הלשוניות: בפיצול שפתוח בלשונית אחרת (בלי רענון), ב״העבר לגובה אחר״, ברשימת השרת', async () => {
    await p2.waitForFunction((n) => [...document.querySelectorAll('#spt-lists [data-mv] option')].some(o => o.value === n), NEW, { timeout: 10000 });
    assert.ok((await api('GET', '/api/collectors')).includes(NEW));
    await p.locator('.li[data-key="A"] [data-assign]').click(); await p.waitForSelector('#asel');
    assert.ok((await optsIn(p, '#asel')).includes(NEW));
    // ״+ הוסף גובה״ בלי חיפוש: שדה לשם, שמירה — נבחר בחלון
    await p.click('#sheet .cpk-add'); await p.fill('#sheet .cpk-nn', 'דנה מחליפה'); await p.click('#sheet .cpk-nok'); await p.locator('#sheet .cpk-msg .ok-t').waitFor();
    assert.strictEqual(await p.inputValue('#asel'), 'דנה מחליפה'); assert.ok(!(await p.locator('#asave').isDisabled()));
    await p.click('#asave'); await p.waitForSelector('#sheet', { state: 'hidden' }); assert.strictEqual((await ent('A')).c, 'דנה מחליפה');
  });
  await step('הוספת שם שכבר קיים (״סנטה ״ עם רווח) — לא נוצרת כפילות, הקיים נבחר', async () => {
    await p.locator('.li[data-key="B"] [data-assign]').click(); await p.waitForSelector('#asel');
    await p.click('#sheet .cpk-add'); await p.fill('#sheet .cpk-nn', 'סנטה '); await p.click('#sheet .cpk-nok'); await p.locator('#sheet .cpk-msg .ok-t').waitFor();
    assert.match(await p.innerText('#sheet .cpk-msg'), /כבר ברשימה/); assert.strictEqual(await p.inputValue('#asel'), 'סנטה');
    assert.strictEqual((await api('GET', '/api/collectors')).filter(c => c.trim() === 'סנטה').length, 1);
    await p.click('#sheet [data-close]');
  });
  await step('״ניהול גובים״ — תיקון שם: ״נועם החדש״ ← ״נועם כהן״ בכל המקומות; שם שכבר קיים — הצעה לבחור בקיים', async () => {
    await p.locator('.li[data-key="B"] [data-assign]').click(); await p.waitForSelector('#asel');
    await p.click('#sheet .cpk-mng'); await p.waitForSelector(`#sheet [data-cn="${NEW}"]`);
    await p.click(`#sheet [data-cn="${NEW}"] [data-cren]`); await p.fill(`#sheet [data-cn="${NEW}"] .cmg-to`, 'סנטה'); await p.click(`#sheet [data-cn="${NEW}"] [data-crok]`);
    await p.waitForSelector('#sheet [data-cuse]'); assert.match(await p.innerText(`#sheet [data-cn="${NEW}"] .cmg-m`), /כבר קיים/);
    await p.fill(`#sheet [data-cn="${NEW}"] .cmg-to`, 'נועם כהן'); await p.click(`#sheet [data-cn="${NEW}"] [data-crok]`);
    await p.waitForSelector('#sheet [data-cn="נועם כהן"]');
    assert.strictEqual((await ent('R')).c, 'נועם כהן'); const cl = await api('GET', '/api/collectors'); assert.ok(cl.includes('נועם כהן') && !cl.includes(NEW));
    await p.click('#sheet [data-close]');
    await p2.waitForFunction(() => [...document.querySelectorAll('#spt-lists [data-mv] option')].some(o => o.value === 'נועם כהן'), null, { timeout: 10000 });
  });
  await step('סימון ״נועם כהן״ כלא פעיל: הגבייה שכבר נרשמה נשארת על שמו; גבייה פתוחה מוצגת ומועברת לרובי; לא מוצע לשיוכים חדשים', async () => {
    // הוספת עוד גבייה אצל נועם וסימון ״נאסף״ על רונה (גבייה שנרשמה)
    { const a = await api('GET', '/api/accounts/' + W); await api('PUT', '/api/accounts/' + W, { data: { ...strip(a), entries: a.entries.concat([{ _k: 'N2', n: 'גיל אור', a: 300, c: 'נועם כהן', t: '19:00' }]) }, baseVersion: a._version, opId: 'add2' }); }
    await api('POST', `/api/accounts/${W}/mark`, { key: 'R', s: 'נאסף', opId: 'm1' });
    await p.goto(URL + '/#/acc/' + W); await p.reload(); await p.waitForSelector('button[data-xact]');
    await p.click('button[data-xact]:has-text("ניהול גובים")'); await p.waitForSelector('#sheet [data-cn="נועם כהן"]');
    await p.click('#sheet [data-cn="נועם כהן"] [data-coff]'); await p.waitForSelector('#sheet .cmg-open');
    const lst = await p.innerText('#sheet .cmg-open'); assert.ok(lst.includes('גיל אור') && !lst.includes('רונה אליה'), lst);
    await p.selectOption('#sheet .cmg-tosel', 'רובי'); await p.click('#sheet [data-coffmv]');
    await p.waitForSelector('#sheet [data-cn="נועם כהן"] [data-con]');
    assert.strictEqual((await ent('R')).c, 'נועם כהן', 'הגבייה שנרשמה נשארת על שמו'); assert.strictEqual((await ent('R')).s, 'נאסף');
    assert.strictEqual((await ent('N2')).c, 'רובי', 'הפתוחה הועברה');
    assert.ok(!(await api('GET', '/api/collectors')).includes('נועם כהן'));
    await p.click('#sheet [data-close]');
    await p.waitForSelector(`.wgcard[data-wg="נועם כהן"] .li[data-key="R"]`); // ההיסטוריה עדיין מוצגת על שמו
    await p.locator('.li[data-key="B"] [data-assign]').click(); await p.waitForSelector('#asel');
    assert.ok(!(await optsIn(p, '#asel')).includes('נועם כהן'), 'לא מוצע לשיוך חדש'); await p.click('#sheet [data-close]');
    await p2.waitForFunction(() => ![...document.querySelectorAll('#spt-lists [data-mv] option')].some(o => o.value === 'נועם כהן'), null, { timeout: 10000 });
  });
  await step('החזרה לפעילות — שוב זמין בבחירה; אין שגיאות דף', async () => {
    await p.click('button[data-xact]:has-text("ניהול גובים")'); await p.waitForSelector('#sheet [data-cn="נועם כהן"] [data-con]');
    await p.click('#sheet [data-cn="נועם כהן"] [data-con]'); await p.waitForSelector('#sheet [data-cn="נועם כהן"] [data-coff]');
    assert.ok((await api('GET', '/api/collectors')).includes('נועם כהן')); await p.click('#sheet [data-close]');
    assert.deepStrictEqual(p.errs, []); assert.deepStrictEqual(p2.errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
