// בדיקת ״פתיחת יום חדש״ ו״ניקוי הדף הנוכחי״ בכל הטאבים היומיים, על נתוני בדיקה (מסד ריק), באייפון.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8340, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-day-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).split('\n')[0]); } };
const D1 = '2026-11-20', D2 = '2026-11-21';
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const acc = (id) => api('GET', '/api/accounts/' + id);
  const mk = async (kind, date, fill) => { const { id } = await api('POST', '/api/accounts', { kind, date, opId: 'mk-' + kind + date }); const a = await acc(id); const data = { ...a, ...fill }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: 'fill-' + id }); return id; };
  // נתוני בדיקה ליום 20.11
  const W1 = await mk('work', D1, { entries: [{ n: 'דני בדיקה', p: '0500000001', a: 300, c: 'יוסי', t: '09:00', s: 'נאסף', ga: 300 }, { n: 'רונית בדיקה', p: '0500000002', a: 200, c: 'יוסי', t: '10:00', s: '' }, { n: 'משה בדיקה', p: '0500000003', a: 150, c: 'אבי', t: '11:00', s: '' }], expenses: [{ n: 'דלק', a: 50, c: 'יוסי' }] });
  const S1 = await mk('split', D1, { records: [{ n: 'אורי בדיקה', fn: 'אורי', ln: 'בדיקה', ph: '0500000004', a: 400, c: 'יוסי', t: '09:30', cnt: 1 }, { n: 'נועה בדיקה', fn: 'נועה', ln: 'בדיקה', ph: '0500000005', a: 250, c: 'אבי', t: '12:00', cnt: 1 }] });
  const C1 = await mk('collectors', D1, { entries: [{ n: 'גבייה א', a: 500, c: 'יוסי', k: 'd' }, { n: 'דלק', a: 40, c: 'יוסי', k: 'e' }] });
  const M1 = await mk('morning', D1, { keren: 10000, courier: 30, rows: [{ n: 'לקוח א', i: 100, p: 200 }], loans: [{ n: 'הלוואה א', a: 1000 }] });
  const W1before = JSON.stringify((await acc(W1)).entries);
  const kpi = async (i) => (await p.locator('.kpis .kpi .v').nth(i).innerText()).trim();

  let W2;
  await step('איסוף יום: ״פתיחת יום חדש״ לתאריך חדש פותח דף נקי עם סכומים 0', async () => {
    await p.goto(URL + '/#/acc/' + W1); await p.waitForSelector('#dnew');
    assert.ok(/650/.test(await kpi(0)), 'צפוי של 20.11 = 650');
    await p.click('#dnew'); await p.fill('#dd', D2); await p.click('#ddgo');
    await p.waitForFunction(id => /#\/acc\//.test(location.hash) && !location.hash.includes(id) && !location.hash.includes('edit'), W1); await p.waitForSelector('.kpis .kpi');
    W2 = p.url().split('#/acc/')[1];
    for (let i = 0; i < 3; i++) assert.ok(/^₪?\s*0(\.00)?\s*₪?$/.test(await kpi(i)), 'סכום ' + i + ': ' + await kpi(i));
    assert.ok((await p.locator('.band .eyebrow').innerText()).includes('איסוף יום'));
  });
  await step('רענון המסך — הדף החדש נשאר נקי, והאיסוף של אתמול לא השתנה', async () => {
    await p.reload(); await p.waitForSelector('.kpis .kpi'); assert.ok(/^₪?\s*0/.test(await kpi(0)));
    assert.strictEqual(JSON.stringify((await acc(W1)).entries), W1before);
  });
  await step('״‹ יום קודם״ מחזיר לאיסוף של 20.11 עם כל הנתונים', async () => {
    await p.click('#dprev'); await p.waitForFunction(id => location.hash.includes(id), W1); await p.waitForSelector('.kpis .kpi');
    assert.ok(/650/.test(await kpi(0))); assert.ok(/300/.test(await kpi(1)), 'נגבה 300');
    await p.click('#dnext'); await p.waitForFunction(id => location.hash.includes(id), W2);
  });
  await step('״פתיחת יום חדש״ לתאריך שכבר קיים פותח את הדף הקיים ולא יוצר כפילות', async () => {
    await p.click('#dnew'); await p.fill('#dd', D1); await p.dispatchEvent('#dd', 'change'); await p.waitForFunction(() => /יש כבר דף/.test(document.querySelector('#ddinfo').textContent));
    await p.click('#ddgo'); await p.waitForFunction(id => location.hash.includes(id), W1);
    const L = (await api('GET', '/api/accounts?kind=work')); assert.strictEqual(L.length, 2, 'שני ימים בלבד');
    await p.click('#dnew'); await p.fill('#dd', D2); await p.click('#ddgo'); await p.waitForFunction(id => location.hash.includes(id), W2);
    assert.strictEqual((await api('GET', '/api/accounts?kind=work')).length, 2);
  });
  await step('פיצול: ״ניקוי הדף הנוכחי״ מציג טאב, תאריך ומה יימחק; ״ביטול״ לא משנה כלום', async () => {
    await p.goto(URL + '/#/acc/' + S1); await p.waitForSelector('#dclear'); await p.click('#dclear'); await p.waitForSelector('#clgo');
    const t = await p.locator('#clbody').innerText();
    assert.ok(t.includes('טאב: פיצול') && t.includes('20.11.2026') && t.includes('2 לקוחות ברשימת הפיצול'), t);
    assert.ok(t.includes('רשימת האיסוף היומי לא משתנה'));
    await p.click('#clno'); await p.waitForTimeout(300); assert.strictEqual((await acc(S1)).records.length, 2);
  });
  await step('פיצול: אישור ניקוי מנקה רק את הפיצול של 20.11 — האיסוף, התשלומים והימים האחרים נשארים', async () => {
    await p.click('#dclear'); await p.click('#clgo'); await p.waitForSelector('#undogo');
    assert.strictEqual((await acc(S1)).records.length, 0);
    assert.strictEqual(JSON.stringify((await acc(W1)).entries), W1before, 'איסוף יום לא השתנה');
    assert.strictEqual((await acc(C1)).entries.length, 2); assert.strictEqual((await acc(M1)).rows.length, 1);
    await p.reload(); await p.waitForSelector('.band'); assert.strictEqual((await acc(S1)).records.length, 0, 'אחרי רענון');
  });
  await step('״בטל ניקוי״ מחזיר את הדף', async () => {
    await p.click('#dclear'); await p.click('#clgo'); await p.waitForSelector('#undogo');
    await p.click('#undogo'); await p.waitForFunction(() => !document.querySelector('#undoclr'));
    // הניקוי הראשון כבר רוקן; הביטול השני מחזיר את המצב הריק. לכן בודקים ביטול על דף מלא:
    const S3 = await mk('split', '2026-11-19', { records: [{ n: 'x', fn: 'x', ph: '0500000009', a: 10, c: 'יוסי', cnt: 1 }] });
    await p.goto(URL + '/#/acc/' + S3); await p.waitForSelector('#dclear'); await p.click('#dclear'); await p.click('#clgo'); await p.waitForSelector('#undogo');
    assert.strictEqual((await acc(S3)).records.length, 0); await p.click('#undogo'); await p.waitForFunction(() => !document.querySelector('#undoclr'));
    assert.strictEqual((await acc(S3)).records.length, 1);
  });
  await step('איסוף יום: ניקוי משאיר כברירת מחדל שורות שכבר סומנו ״נאסף״', async () => {
    await p.goto(URL + '/#/acc/' + W1); await p.waitForSelector('#dclear'); await p.click('#dclear'); await p.waitForSelector('#clkeep');
    const t = await p.locator('#clbody').innerText(); assert.ok(t.includes('טאב: איסוף יום') && t.includes('2 שורות איסוף שעדיין לא סומנו') && t.includes('1 הוצאות'), t);
    await p.click('#clgo'); await p.waitForSelector('#undogo');
    const a = await acc(W1); assert.strictEqual(a.entries.length, 1); assert.strictEqual(a.entries[0].s, 'נאסף'); assert.strictEqual(a.expenses.length, 0);
  });
  await step('חשבון גובים: ניקוי הדף הנוכחי', async () => {
    await p.goto(URL + '/#/acc/' + C1); await p.waitForSelector('#dclear'); await p.click('#dclear');
    assert.ok((await p.locator('#clbody').innerText()).includes('טאב: חשבון גובים')); await p.click('#clgo'); await p.waitForSelector('#undogo');
    assert.strictEqual((await acc(C1)).entries.length, 0);
  });
  await step('חשבון בוקר: יום חדש מקבל קרן מהיום הקודם; ניקוי מחזיר את הקרן לקרן הסופית הקודמת', async () => {
    await p.goto(URL + '/#/acc/' + M1); await p.waitForSelector('#dnew'); const fin1 = (await acc(M1)).finalKeren;
    await p.click('#dnew'); await p.fill('#dd', D2); await p.click('#ddgo'); await p.waitForFunction(id => /#\/acc\//.test(location.hash) && !location.hash.includes(id), M1);
    const M2 = p.url().split('#/acc/')[1].split('?')[0]; const m2 = await acc(M2); assert.strictEqual(+m2.keren, fin1); assert.strictEqual(m2.rows.length, 0);
    const data = { ...m2, rows: [{ n: 'טעות', i: 5, p: 5 }], keren: 1 }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]);
    await api('PUT', '/api/accounts/' + M2, { data, baseVersion: m2._version, opId: 'm2fill' });
    await p.reload(); await p.waitForSelector('#dclear'); await p.click('#dclear'); assert.ok((await p.locator('#clbody').innerText()).includes('טאב: חשבון בוקר'));
    await p.click('#clgo'); await p.waitForSelector('#undogo'); const m3 = await acc(M2); assert.strictEqual(m3.rows.length, 0); assert.strictEqual(+m3.keren, fin1);
    assert.strictEqual((await acc(M1)).rows.length, 1, 'חשבון הבוקר של אתמול לא נגע');
  });
  await step('מסך ״חשבונות״: כפתור ״פתיחת יום חדש״ עם בחירת טאב', async () => {
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('#newday'); await p.click('#newday'); await p.click('[data-dk="split"]');
    await p.waitForSelector('#dd'); assert.ok((await p.locator('#sheet h2').innerText()).includes('פיצול'));
    await p.click('[data-dn="1"]'); await p.click('#ddgo'); await p.waitForSelector('#dclear');
    assert.strictEqual((await api('GET', '/api/accounts?kind=split')).length, 3);
  });
  await step('הכפתורים נראים בטלפון בלי גלילה הצידה, ואין שגיאות דף', async () => {
    const bx = await p.locator('#dclear').boundingBox(); const vw = p.viewportSize().width; assert.ok(bx && bx.x >= 0 && bx.x + bx.width <= vw, JSON.stringify(bx));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await p.screenshot({ path: path.join(os.tmpdir(), 'day-tools.png') });
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
