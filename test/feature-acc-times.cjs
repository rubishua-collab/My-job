// בדיקת ״עדכון אחרון״ ו״שמירה אחרונה״ במסך ״חשבונות״ ובתוך החשבון. נתוני בדיקה במסד ריק.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8400, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-times-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
const F = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const il = (ts) => { const p = Object.fromEntries(F.formatToParts(new Date(ts)).map(x => [x.type, x.value])); return `${p.day}.${p.month}.${p.year} בשעה ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await sleep(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-22', opId: 'mk1' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [{ n: 'אורי א', fn: 'אורי', ln: 'א', ph: '', a: 100, c: 'טל', t: '', cnt: 1, side: false }] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'f1' }); }
  // חשבונות ״ישנים״ מהתוכנה המקורית: אחד עם updatedAt, ואחד בלי שום מועד
  const OLD_T = Date.UTC(2026, 10, 18, 8, 15, 30);
  const bk = { format: 'yoman-boker-full-backup', collections: { accounts: [
    { id: 'oldA', data: { kind: 'collectors', date: '2026-11-18', title: 'חשבון גובים 18.11.2026', createdAt: OLD_T - 3600e3, updatedAt: OLD_T, v: 1, entries: [{ n: 'x', a: 5, c: 'טל', k: 'd' }] } },
    { id: 'oldB', data: { kind: 'collectors', date: '2026-11-17', title: 'חשבון גובים 17.11.2026', v: 1, entries: [] } },
  ] }, files: [] };
  { const r = await ctx.request.fetch(URL + '/api/backup/import', { method: 'POST', data: JSON.stringify(bk), headers: { 'Content-Type': 'application/json' } }); assert.ok(r.ok(), await r.text()); }
  const rowTimes = async (id) => (await p.locator(`.accrow[data-id="${id}"] .acctimes`).innerText()).split('\n').map(s => s.trim()).filter(Boolean);
  let T1, T2;

  await step('עריכת סכום ב-T1 ו״שמור שינויים״ ב-T2 — שתי שעות נפרדות, ורואים אותן ברשימה בלי לפתוח', async () => {
    await p.goto(URL + '/#/acc/' + SP + '?edit=1'); await p.waitForSelector('#ed-savestay');
    T1 = Date.now(); await p.locator('input[data-l="records"][data-k="a"]').fill('250');
    await sleep(2300); T2 = Date.now(); await p.click('#ed-savestay');
    await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('.actionbar [data-savest]').textContent));
    const a = await api('GET', '/api/accounts/' + SP);
    assert.ok(Math.abs(a._times.changedAt - T1) < 1500, 'changedAt≈T1'); assert.ok(a._times.savedAt >= T2 - 200, 'savedAt≈T2'); assert.ok(a._times.savedAt - a._times.changedAt >= 1500);
    // גם בתוך החשבון, ליד כפתור השמירה
    const inner = await p.locator('.actionbar [data-acctimes]').innerText(); assert.ok(inner.includes(il(a._times.changedAt)) && inner.includes(il(a._times.savedAt)), inner);
    await p.goto(URL + '/#/accounts'); await p.waitForSelector(`.accrow[data-id="${SP}"]`);
    const L = await rowTimes(SP);
    assert.strictEqual(L[0], `עדכון אחרון: ${il(a._times.changedAt)} | עודכן על ידי בעל התוכנה`); assert.strictEqual(L[1], `שמירה אחרונה: ${il(a._times.savedAt)}`);
    assert.ok((await p.locator(`.accrow[data-id="${SP}"] .t`).innerText()).startsWith('פיצול 22.11.2026'), 'הכותרת לפי תאריך החשבון');
    assert.ok(L[1].includes(il(Date.now()).slice(0, 10)), 'שורת השמירה מציגה את התאריך בפועל, לא את תאריך החשבון');
  });
  let before;
  await step('״שמור שינויים״ שוב בלי לערוך — רק שעת השמירה מתעדכנת (גם בתוך החשבון)', async () => {
    before = (await api('GET', '/api/accounts/' + SP));
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#hsave'); await sleep(1200);
    await p.click('#hsave'); await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('#hsave + [data-savest]').textContent));
    const a = await api('GET', '/api/accounts/' + SP);
    assert.strictEqual(a._times.changedAt, before._times.changedAt); assert.ok(a._times.savedAt > before._times.savedAt + 1000);
    assert.strictEqual(a._version, before._version, 'הנתונים לא השתנו'); assert.strictEqual(a.records[0].a, 250);
    await p.waitForFunction((s) => document.querySelector('[data-acctimes]').textContent.includes(s), il(a._times.savedAt));
    before = a;
  });
  await step('אחרי רענון ובמסך ״חשבונות״ — אותם מועדים, והחשבון מופיע פעם אחת', async () => {
    await p.reload(); await p.waitForSelector('[data-acctimes]'); assert.ok((await p.locator('[data-acctimes]').innerText()).includes(il(before._times.savedAt)));
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow'); await p.reload(); await p.waitForSelector(`.accrow[data-id="${SP}"]`);
    assert.strictEqual(await p.locator(`.accrow[data-id="${SP}"]`).count(), 1); assert.strictEqual(await p.locator('.accrow .t', { hasText: 'פיצול 22.11.2026' }).count(), 1);
    const L = await rowTimes(SP); assert.ok(L[0].includes(il(before._times.changedAt)) && L[1].includes(il(before._times.savedAt)), L.join(' / '));
  });
  await step('שמירה שנכשלה — נשארים המועדים של השמירה המוצלחת הקודמת, ומוצגת שגיאה', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#hsave');
    await p.route('**/api/accounts/*/saved', r => r.abort());
    await p.click('#hsave'); await p.waitForFunction(() => /השמירה נכשלה — נסה שוב/.test(document.querySelector('#hsave + [data-savest]').textContent));
    assert.ok((await p.locator('[data-acctimes]').innerText()).includes(il(before._times.savedAt)));
    await p.unroute('**/api/accounts/*/saved');
    const a = await api('GET', '/api/accounts/' + SP); assert.strictEqual(a._times.savedAt, before._times.savedAt);
  });
  await step('מכשיר אחר (אייפון) רואה את אותם מועדים', async () => {
    const m = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.goto(URL + '/#/login'); await q.fill('input[name=u]', 'owner'); await q.fill('input[name=p]', 'Owner-pass-1'); await q.click('form button'); await q.waitForSelector('.kpis');
    await q.goto(URL + '/#/accounts'); await q.waitForSelector(`.accrow[data-id="${SP}"]`);
    const t = await q.locator(`.accrow[data-id="${SP}"] .acctimes`).innerText(); assert.ok(t.includes(il(before._times.changedAt)) && t.includes(il(before._times.savedAt)));
    assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await q.screenshot({ path: path.join(os.tmpdir(), 'acc-times-iphone.png') }); await m.close();
  });
  await step('חשבונות ישנים: מועד שתועד מוצג; מועד חסר — ״לא תועד״', async () => {
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow[data-id="oldA"]');
    const A = await rowTimes('oldA'); assert.strictEqual(A[0], `עדכון אחרון: ${il(OLD_T)} | עודכן על ידי לא תועד`); assert.strictEqual(A[1], `שמירה אחרונה: ${il(OLD_T)}`);
    const B = await rowTimes('oldB'); assert.strictEqual(B[0], 'עדכון אחרון: לא תועד'); assert.strictEqual(B[1], 'שמירה אחרונה: לא תועד');
  });
  await step('כל סוגי החשבונות: סימון איסוף (איסוף יומי) מעדכן את שני המועדים', async () => {
    const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-22', opId: 'w1' });
    const a0 = await api('GET', '/api/accounts/' + W); const data = { ...a0, entries: [{ n: 'דוד', p: '', a: 70, c: 'אבי', t: '09:00', s: '' }] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]);
    await api('PUT', '/api/accounts/' + W, { data, baseVersion: a0._version, opId: 'w2' }); const a1 = await api('GET', '/api/accounts/' + W); await sleep(1100);
    await api('POST', `/api/accounts/${W}/mark`, { key: a1.entries[0]._k, s: 'נאסף', opId: 'mk-w' }); const a2 = await api('GET', '/api/accounts/' + W);
    assert.ok(a2._times.changedAt > a1._times.changedAt && a2._times.savedAt >= a2._times.changedAt);
    const L = await api('GET', '/api/accounts'); for (const k of ['split', 'work', 'collectors']) assert.ok(L.filter(x => x.kind === k).every(x => x.times && 'savedAt' in x.times), k);
  });
  await step('אין שגיאות דף', async () => { assert.deepStrictEqual(errs, []); });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
