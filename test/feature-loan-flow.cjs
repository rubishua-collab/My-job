// בדיקת קבלה: בקשה להלוואה ← פיצול ← איסוף יום ← אישור מסירה והוצאת ״מתן הלוואה״ (אייפון).
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8562, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-lf-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const numOf = (t) => +String(t).replace(/[^\d.-]/g, '');
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await wait(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }); // תאריך העבודה (ברירת המחדל בטופס — היום)
  const strip = (a) => { const d = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); return d; };
  // איסוף יום עם גביות לאושר ולטל, חשבון גובים ופיצול לאותו תאריך
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'w' });
  { const a = await api('GET', '/api/accounts/' + W); await api('PUT', '/api/accounts/' + W, { data: { ...strip(a), entries: [{ _k: 'e1', n: 'לקוח א', a: 2000, c: 'אושר', t: '10:00', s: 'נאסף' }, { _k: 'e2', n: 'לקוח ב', a: 1500, c: 'אושר', t: '11:00', s: 'נאסף' }, { _k: 'e3', n: 'לקוח ג', a: 900, c: 'טל', t: '12:00', s: 'נאסף' }] }, baseVersion: a._version, opId: 'wf' }); }
  const { id: C } = await api('POST', '/api/accounts', { kind: 'collectors', date: DATE, opId: 'c' });
  const { id: S } = await api('POST', '/api/accounts', { kind: 'split', date: DATE, opId: 's' });
  { const a = await api('GET', '/api/accounts/' + S); await api('PUT', '/api/accounts/' + S, { data: { ...strip(a), records: [{ _k: 'r1', n: 'דני כהן', a: 1000, c: 'טל', t: '10:00', cnt: 1 }] }, baseVersion: a._version, opId: 'sf' }); }
  const REQ = { name: 'איציק לחמני', amount: 6000, date: '2026-11-25', phone: '', note: '2500 כפול 3', created: new Date().toISOString(), updated: new Date().toISOString() };
  await api('POST', '/api/docs/loan_requests', { id: 'Qitzik', data: REQ, opId: 'q1' });
  await api('POST', '/api/docs/loan_requests', { id: 'Qliot', data: { ...REQ, name: 'ליאור נבא', amount: 10000, note: '1650 כפול 10' }, opId: 'q2' });
  const card = (name) => p.locator('.rq-item', { hasText: name });
  const wg = (g, cls) => p.locator(`.wgcard[data-wg="${g}"] ${cls}`).innerText().then(numOf);
  const loanExp = async () => { const a = await api('GET', '/api/accounts/' + W); return (a.expenses || []).filter(x => x.lr === 'Qitzik'); };
  const collExp = async () => (await api('GET', '/api/accounts/' + C)).entries.filter(e => e.xk === 'xLQitzik');
  let netBefore, gotBefore, splitBefore;

  await step('בקשות להלוואה: ״העבר ללשונית פיצול״ ליד עריכה ומחיקה, גם בבקשה שכבר שמורה; אחרי ההעברה — ״הועברה לפיצול״ ותאריך העבודה', async () => {
    splitBefore = JSON.stringify((await api('GET', '/api/accounts/' + S)).records);
    await p.goto(URL + '/#/requests-manage'); await card('איציק לחמני').waitFor();
    const acts = await card('איציק לחמני').locator('.rq-act button').allInnerTexts();
    assert.deepStrictEqual(acts.map(s => s.trim()), ['העבר ללשונית פיצול', 'עריכה', 'מחיקה']);
    await card('איציק לחמני').locator('[data-rq-xfer]').click();
    await p.waitForSelector('#rq-xd'); assert.strictEqual(await p.inputValue('#rq-xd'), DATE);
    await p.waitForFunction((S) => [...document.querySelectorAll('#rq-xs option')].some(o => o.value === S), S);
    await card('איציק לחמני').locator('[data-rq-xgo]').dblclick();
    await card('איציק לחמני').locator('.rq-flow:not(.rq-chk)').waitFor();
    const t = await card('איציק לחמני').locator('.rq-flow:not(.rq-chk)').innerText();
    assert.ok(t.includes('הועברה לפיצול') && t.includes(DATE.split('-').reverse().join('.')) && t.includes('ממתינה למסירה'), t);
    assert.strictEqual(await card('איציק לחמני').locator('[data-rq-xfer]').count(), 0, 'הכפתור יורד אחרי ההעברה');
    const q = await api('GET', '/api/docs/loan_requests/Qitzik'); assert.strictEqual(q.xfer.splitId, S); assert.strictEqual(q.xfer.workId, W);
    assert.strictEqual(q.note, '2500 כפול 3'); assert.strictEqual(q.amount, 6000);
  });
  await step('פיצול: הבקשה פעם אחת תחת ״בקשות הלוואה״ עם השם, הסכום, תאריך הבקשה וההערה; שורות וסכומי הפיצול לא השתנו', async () => {
    await p.goto(URL + '/#/acc/' + S); await p.waitForSelector('#lrq-panel');
    assert.match(await p.locator('#lrq-panel h2').innerText(), /בקשות הלוואה/);
    const items = p.locator('#lrq-panel .lrq-item'); assert.strictEqual(await items.count(), 1);
    const t = await items.first().innerText();
    assert.ok(t.includes('איציק לחמני') && t.includes('6,000') && t.includes('25.11.2026') && t.includes('2500 כפול 3') && t.includes('ממתינה למסירה'), t);
    assert.strictEqual(JSON.stringify((await api('GET', '/api/accounts/' + S)).records), splitBefore);
  });
  await step('איסוף יום: מופיעה אוטומטית פעם אחת, ״ממתינה למסירה״, הוצאה 0 ₪ — הסכום לא בגביות ולא בהוצאות', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#lrq-panel .lrq-item');
    assert.strictEqual(await p.locator('#lrq-panel .lrq-item').count(), 1);
    const t = await p.locator('#lrq-panel .lrq-item').innerText();
    assert.ok(t.includes('איציק לחמני') && t.includes('סכום המסירה') && t.includes('6,000') && t.includes('2500 כפול 3') && t.includes('ממתינה למסירה'), t);
    assert.strictEqual(await wg('אושר', '.wg-exp'), 0); assert.strictEqual(numOf(await p.locator('.kpi', { hasText: 'הוצאות' }).locator('.v').innerText()), 0);
    gotBefore = await wg('אושר', '.wg-got'); netBefore = await wg('אושר', '.wg-net');
    assert.strictEqual(gotBefore, 3500); assert.strictEqual(netBefore, 3500);
    assert.strictEqual(numOf(await p.locator('.kpi.good .v').innerText()), 4400, 'הגביות לא כוללות את הבקשה');
    assert.strictEqual((await loanExp()).length, 0);
  });
  await step('אי אפשר לאשר לפני בחירת גובה; אחרי בחירת אושר — לחיצה כפולה רושמת הוצאה אחת של 6,000 ₪, והנטו של אושר יורד בדיוק ב-6,000 מיד', async () => {
    const it = p.locator('#lrq-panel .lrq-item');
    assert.match(await it.locator('label').first().innerText(), /איזה גובה מסר את הכסף\?/);
    await p.waitForFunction(() => [...document.querySelectorAll('[data-lrc] option')].some(o => o.textContent === 'אושר'));
    assert.ok(await it.locator('[data-lrok]').isDisabled(), 'כפתור נעול בלי גובה');
    await it.locator('[data-lrc]').selectOption('אושר');
    assert.ok(await it.locator('[data-lrok]').isEnabled());
    await it.locator('[data-lrk]').fill('3'); await it.locator('[data-lrok]').dblclick();
    await p.waitForFunction(() => document.querySelector('#lrq-panel .lrq-item')?.textContent.includes('אושרה ונמסרה ללקוח'), null, { timeout: 8000 });
    await p.waitForFunction(() => /6,000/.test(document.querySelector('.wgcard[data-wg="אושר"] .wg-exp')?.textContent || ''), null, { timeout: 8000 });
    assert.strictEqual(await wg('אושר', '.wg-exp'), 6000); assert.strictEqual(await wg('אושר', '.wg-net'), netBefore - 6000);
    assert.strictEqual(await wg('אושר', '.wg-got'), gotBefore, 'הגבייה לא השתנתה');
    assert.strictEqual(await wg('טל', '.wg-exp'), 0);
    const st = await p.locator('#lrq-panel .lrq-item').innerText(); assert.ok(st.includes('אושר') && /\d{2}:\d{2}/.test(st), st);
    assert.strictEqual(await p.locator('.wgcard[data-wg="אושר"] .wg-x .li', { hasText: 'מתן הלוואה' }).count(), 1);
    const x = await loanExp(); assert.strictEqual(x.length, 1); assert.strictEqual(x[0].a, 6000); assert.strictEqual(x[0].c, 'אושר');
    assert.strictEqual((await collExp()).length, 1);
  });
  await step('ניסיון חוזר (מזהה פעולה חדש / מכשיר אחר) אחרי האישור לא יוצר הוצאה נוספת', async () => {
    const r = await api('POST', '/api/loan-req/give', { id: 'Qitzik', c: 'טל', opId: 'again-1' });
    assert.ok(r.already); assert.strictEqual(r.given.c, 'אושר');
    assert.strictEqual((await loanExp()).length, 1); assert.strictEqual((await collExp()).length, 1);
  });
  await step('אחרי יציאה וכניסה מחדש: אותם נתונים באיסוף יום, ״אושרה ונמסרה ללקוח״ בפיצול ובבקשות', async () => {
    await p.reload(); await p.waitForSelector('#lrq-panel .lrq-item');
    assert.strictEqual(await wg('אושר', '.wg-exp'), 6000); assert.strictEqual(await wg('אושר', '.wg-net'), netBefore - 6000);
    assert.strictEqual(await p.locator('#lrq-panel .lrq-item').count(), 1); assert.strictEqual(await p.locator('[data-lrok]').count(), 0);
    await p.goto(URL + '/#/acc/' + S); await p.waitForSelector('#lrq-panel .lrq-item');
    assert.match(await p.locator('#lrq-panel .lrq-item').innerText(), /אושרה ונמסרה ללקוח[\s\S]*אושר[\s\S]*\d{2}:\d{2}/);
    await p.goto(URL + '/#/requests-manage'); await card('איציק לחמני').locator('.rq-flow:not(.rq-chk)').waitFor();
    assert.match(await card('איציק לחמני').locator('.rq-flow:not(.rq-chk)').innerText(), /אושרה ונמסרה ללקוח[\s\S]*אושר/);
  });
  await step('חשבון גובים: ״מתן הלוואה — איציק לחמני״ 6,000 ₪ על שם אושר, פעם אחת', async () => {
    await p.goto(URL + '/#/acc/' + C); await p.waitForSelector('.band');
    const cardO = p.locator('.card', { has: p.locator('h2', { hasText: /^אושר$/ }) }).first();
    assert.match(await cardO.locator('summary').innerText(), /הוצאות \(1\) · 6,000/);
    assert.strictEqual(await cardO.locator('details .li', { hasText: 'מתן הלוואה — איציק לחמני' }).count(), 1);
    const row = p.locator('table tr', { hasText: 'אושר' }); assert.match(await row.innerText(), /6,000/);
    const d = await api('GET', '/api/day-expense?date=' + DATE); assert.strictEqual(d.items.filter(x => x.key === 'xLQitzik').length, 1);
  });
  await step('אין קליטה בכלל: הודעה ברורה בשורה, הבקשה נשארת ״ממתינה למסירה״, ואז ״אשר״ שוב — הוצאה אחת', async () => {
    await api('POST', '/api/docs/loan_requests', { id: 'Qron', data: { name: 'רונן בוריסוב', amount: 3200, date: '2026-11-25', note: 'חידוש', created: '', updated: '' }, opId: 'q3' });
    await api('POST', '/api/loan-req/xfer', { id: 'Qron', date: DATE, opId: 'x3' });
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#lrq-panel .lrq-item');
    const it = p.locator('#lrq-panel .lrq-item', { hasText: 'רונן בוריסוב' });
    await p.waitForFunction(() => [...document.querySelectorAll('[data-lrc] option')].some(o => o.textContent === 'טל'));
    await it.locator('[data-lrc]').selectOption('טל');
    await p.route('**/api/loan-req/give', r => r.abort('internetdisconnected'));
    await it.locator('[data-lrk]').fill('2'); await it.locator('[data-lrok]').click();
    await it.locator('.note.err').waitFor(); assert.match(await it.locator('.note.err').innerText(), /לא נשמר/);
    assert.match(await it.innerText(), /ממתינה למסירה/); assert.strictEqual(await wg('טל', '.wg-exp'), 0);
    await p.unroute('**/api/loan-req/give');
    await it.locator('[data-lrok]').click();
    await p.waitForFunction(() => /3,200/.test(document.querySelector('.wgcard[data-wg="טל"] .wg-exp')?.textContent || ''), null, { timeout: 8000 });
    const a = await api('GET', '/api/accounts/' + W); assert.strictEqual(a.expenses.filter(x => x.lr === 'Qron').length, 1);
  });
  await step('נשמר בשרת אבל התשובה אבדה: המסך מציג את המצב האמיתי או ״נסה שוב״ — הוצאה אחת בלבד', async () => {
    await api('POST', '/api/loan-req/xfer', { id: 'Qliot', date: DATE, opId: 'x2' });
    await p.goto(URL + '/#/acc/' + W); await p.reload(); await p.waitForSelector('#lrq-panel .lrq-item');
    const it = p.locator('#lrq-panel .lrq-item', { hasText: 'ליאור נבא' });
    await p.waitForFunction(() => [...document.querySelectorAll('[data-lrc] option')].some(o => o.textContent === 'טל'));
    await it.locator('[data-lrc]').selectOption('טל');
    let lost = true;
    await p.route('**/api/loan-req/give', async (route) => { if (lost) { lost = false; await route.fetch(); return route.abort('connectionreset'); } return route.continue(); }); // נשמר בשרת, התשובה אבדה
    await it.locator('[data-lrk]').fill('10'); await it.locator('[data-lrok]').click();
    // התשובה אבדה: או שמוצגת הודעה ו״נסה שוב״, או שהמסך כבר התעדכן מהשרת שהמסירה נשמרה
    await p.waitForFunction(() => { const el = [...document.querySelectorAll('#lrq-panel .lrq-item')].find(x => x.textContent.includes('ליאור נבא')); return el && (el.querySelector('.note.err') || el.textContent.includes('אושרה ונמסרה')); });
    if (await it.locator('.note.err').count()) { assert.match(await it.locator('.note.err').innerText(), /לא נשמר/); await it.locator('[data-lrok]').click(); }
    await p.waitForFunction(() => /13,200/.test(document.querySelector('.wgcard[data-wg="טל"] .wg-exp')?.textContent || ''), null, { timeout: 8000 });
    const a = await api('GET', '/api/accounts/' + W); assert.strictEqual(a.expenses.filter(x => x.lr === 'Qliot').length, 1);
    assert.strictEqual(await wg('טל', '.wg-exp'), 13200); assert.strictEqual(await wg('אושר', '.wg-exp'), 6000);
    await p.unroute('**/api/loan-req/give');
  });
  await step('עריכת בקשה שהועברה לא מבטלת את ההעברה והמסירה; אין שגיאות דף', async () => {
    await p.goto(URL + '/#/requests-manage'); await card('איציק לחמני').locator('[data-rq-edit]').click();
    await p.fill('#rq-f-phone', '050-1234567'); await p.click('#rq-save'); await p.waitForTimeout(800);
    const q = await api('GET', '/api/docs/loan_requests/Qitzik'); assert.ok(q.xfer && q.given && q.given.c === 'אושר');
    assert.strictEqual((await loanExp()).length, 1);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
