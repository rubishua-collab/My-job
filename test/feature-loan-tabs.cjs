// בדיקת קבלה: ״העבר ללשונית״ / ״שנה לשונית״ במסך בקשות להלוואה (אייפון) — אושרי פרץ 2,000 ₪ מפיצול לאיסוף יום,
// אלירן יעקב 10,000 ₪ נשאר בפיצול; כל בקשה פעם אחת ביעד שלה; סה״כ 12,000 ₪; סטטוס ״ממתינה למסירה״ נשמר; אין רישום כספי.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8572, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-lt-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  const { id: S } = await api('POST', '/api/accounts', { kind: 'split', date: DATE, opId: 's' });
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'w' });
  const mkReq = async (id, name, amount, note, chk) => { await api('POST', '/api/docs/loan_requests', { id, data: { name, amount, date: DATE, note, phone: '', chk, created: '', updated: '' }, opId: 'q' + id }); };
  await mkReq('Qosh', 'אושרי פרץ', 2000, '1000 כפול 2', 2); await mkReq('Qeli', 'אלירן יעקב', 10000, '1000 כפול 10', 10);
  // כמו בצילום: שתי הבקשות ״הועברה לפיצול״ (העברה ישנה — בלי שדה לשונית)
  for (const id of ['Qosh', 'Qeli']) { const q = await api('GET', '/api/docs/loan_requests/' + id); const d = { ...q }; delete d.id; delete d._version; d.xfer = { date: DATE, splitId: S, workId: W, at: Date.now(), by: 'owner' }; await api('PUT', '/api/docs/loan_requests/' + id, { data: d, baseVersion: q._version, opId: 'old' + id }); }
  const card = (n) => p.locator('.rq-item', { hasText: n });
  const panelNames = async (id) => { await p.goto(URL + '/#/acc/' + id); await p.reload(); await p.waitForSelector('.band'); await p.waitForTimeout(300); return p.locator('#lrq-panel .lrq-nm').allInnerTexts(); };
  const sumTxt = () => p.locator('#rq-sum').innerText();
  let wBefore;

  await step('״שנה לשונית״ ליד ״עריכה״ (גם בבקשה שכבר ״הועברה לפיצול״); הרשימה נטענת מהתוכנה בשמות הלשוניות', async () => {
    wBefore = await api('GET', '/api/accounts/' + W);
    await p.goto(URL + '/#/requests-manage'); await card('אושרי פרץ').waitFor();
    assert.match(await card('אושרי פרץ').locator('.rq-dest').innerText(), /הועברה לפיצול/);
    const acts = (await card('אושרי פרץ').locator('.rq-act button').allInnerTexts()).map(s => s.trim()); assert.deepStrictEqual(acts.slice(0, 2), ['שנה לשונית', 'עריכה']);
    await card('אושרי פרץ').locator('[data-rq-xfer]').click(); await p.waitForFunction(() => document.querySelectorAll('#rq-xk option').length > 1);
    const opts = await p.locator('#rq-xk option').allInnerTexts(); const tg = (await api('GET', '/api/loan-req/targets')).map(t => t.name);
    assert.deepStrictEqual(opts.slice(1), tg); assert.ok(tg.includes('איסוף יום') && tg.includes('פיצול'));
    assert.strictEqual(await p.locator('[data-rq-xgo]').count(), 0, 'כפתור אישור רק אחרי בחירה');
  });
  await step('בחירת ״איסוף יום״ → ״העבר לאיסוף יום״ (לחיצה כפולה): בכרטיס ״הועברה לאיסוף יום״; הסטטוס ״ממתינה למסירה״; בלי רישום כספי', async () => {
    await p.selectOption('#rq-xk', 'work'); await p.waitForSelector('[data-rq-xgo]');
    assert.strictEqual((await p.locator('[data-rq-xgo]').innerText()).trim(), 'העבר לאיסוף יום');
    await p.locator('[data-rq-xgo]').dblclick(); await card('אושרי פרץ').locator('.rq-dest').waitFor();
    await p.waitForFunction(() => /הועברה לאיסוף יום/.test([...document.querySelectorAll('.rq-item')].find(x => x.textContent.includes('אושרי פרץ'))?.textContent || ''));
    assert.match(await card('אושרי פרץ').locator('.rq-dest').innerText(), /הועברה לאיסוף יום[\s\S]*ממתינה למסירה/);
    assert.match(await card('אלירן יעקב').locator('.rq-dest').innerText(), /הועברה לפיצול/);
    const q = await api('GET', '/api/docs/loan_requests/Qosh'); assert.strictEqual(q.xfer.kind, 'work'); assert.strictEqual(q.xfer.accId, W); assert.ok(!q.given);
    const w = await api('GET', '/api/accounts/' + W); assert.deepStrictEqual(w.expenses, wBefore.expenses); assert.deepStrictEqual(w.entries, wBefore.entries);
  });
  await step('אחרי רענון: אושרי פעם אחת ב״איסוף יום״ (לא בפיצול), אלירן פעם אחת ב״פיצול״ (לא באיסוף); עם הסכום, תאריך הבקשה, שיקים והערות', async () => {
    const sp = await panelNames(S); assert.deepStrictEqual(sp, ['אלירן יעקב']);
    const it = await p.locator('#lrq-panel .lrq-item').innerText(); assert.ok(it.includes('10,000') && it.includes('מספר שיקים: 10') && it.includes('1000 כפול 10') && it.includes('ממתינה למסירה'), it);
    const wk = await panelNames(W); assert.deepStrictEqual(wk, ['אושרי פרץ']);
    const it2 = await p.locator('#lrq-panel .lrq-item').innerText(); assert.ok(it2.includes('2,000') && it2.includes('מספר שיקים: 2') && it2.includes('1000 כפול 2'), it2);
    assert.ok(await p.locator('#lrq-panel [data-lrok]').count() === 1, 'אישור המסירה זמין ביעד');
  });
  await step('במסך הבקשות אחרי רענון: היעדים נשמרו, והסכום הכולל עדיין 12,000 ₪', async () => {
    await p.goto(URL + '/#/requests-manage'); await p.reload(); await card('אושרי פרץ').waitFor();
    assert.match(await sumTxt(), /2 בקשות \| סה״כ מבוקש 12,000/);
    assert.match(await card('אושרי פרץ').locator('.rq-dest').innerText(), /הועברה לאיסוף יום/); assert.match(await card('אלירן יעקב').locator('.rq-dest').innerText(), /הועברה לפיצול/);
  });
  await step('שינוי יעד חוזר (אושרי → חשבון גובים → איסוף יום) — תמיד ביעד אחד; אותו יעד שוב — ״כבר נמצאת״', async () => {
    await card('אושרי פרץ').locator('[data-rq-xfer]').click(); await p.waitForFunction(() => document.querySelectorAll('#rq-xk option').length > 1);
    await p.selectOption('#rq-xk', 'collectors'); await p.click('[data-rq-xgo]');
    await p.waitForFunction(() => /הועברה לחשבון גובים/.test([...document.querySelectorAll('.rq-item')].find(x => x.textContent.includes('אושרי פרץ'))?.textContent || ''));
    const C = (await api('GET', '/api/loan-req/targets')) && (await api('GET', '/api/accounts?kind=collectors')).find(a => a.date === DATE); assert.ok(C, 'חשבון גובים לתאריך');
    assert.deepStrictEqual(await panelNames(C.id), ['אושרי פרץ']); assert.deepStrictEqual(await panelNames(W), []);
    await p.goto(URL + '/#/requests-manage'); await card('אושרי פרץ').waitFor();
    await card('אושרי פרץ').locator('[data-rq-xfer]').click(); await p.waitForFunction(() => document.querySelectorAll('#rq-xk option').length > 1);
    await p.selectOption('#rq-xk', 'work'); await p.click('[data-rq-xgo]');
    await p.waitForFunction(() => /הועברה לאיסוף יום/.test([...document.querySelectorAll('.rq-item')].find(x => x.textContent.includes('אושרי פרץ'))?.textContent || ''));
    const r = await api('POST', '/api/loan-req/xfer', { id: 'Qosh', kind: 'work', date: DATE, accId: W, opId: 'again' }); assert.ok(r.already);
    assert.deepStrictEqual(await panelNames(W), ['אושרי פרץ']); assert.deepStrictEqual(await panelNames(C.id), []); assert.deepStrictEqual(await panelNames(S), ['אלירן יעקב']);
    const q = await api('GET', '/api/docs/loan_requests/Qosh'); assert.strictEqual(q.xfer.hist.length, 3);
  });
  await step('אישור המסירה ביעד (איסוף יום) — הרישום הכספי רק עכשיו, פעם אחת; אין שגיאות דף', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#lrq-panel [data-lrc]');
    await p.waitForFunction(() => [...document.querySelectorAll('[data-lrc] option')].length > 1).catch(() => {});
    const w0 = await api('GET', '/api/accounts/' + W); assert.strictEqual((w0.expenses || []).length, 0);
    await api('POST', '/api/loan-req/give', { id: 'Qosh', c: 'טל', opId: 'g' });
    const w = await api('GET', '/api/accounts/' + W); assert.strictEqual(w.expenses.filter(x => x.lr === 'Qosh').length, 1);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
