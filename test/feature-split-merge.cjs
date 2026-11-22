// בדיקת ״איחוד שורות״ בעריכת הפיצול — הדוגמה מהצילום: עידן חגג 7,900 ₪ אצל טל (טלפון ״בדיקה״) + 725 ₪ אצל רובי (בלי טלפון).
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8380, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-mg-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 300)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  let n = 0;
  const mk = async (date, records) => { const { id } = await api('POST', '/api/accounts', { kind: 'split', date, opId: 'mk' + (++n) }); const a = await api('GET', '/api/accounts/' + id); const data = { ...a, records }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: 'u' + (++n) }); return id; };
  const R = (n, a, c, ph, t, note) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), a, c, ph, t: t || '', note: note || '', cnt: 1, side: false });
  const SP = await mk('2026-11-22', [R('עידן חגג', 7900, 'טל', 'בדיקה', '09:30', 'לבקש מזומן'), R('שרה לוי', 1200, 'טל', '0521111111', '10:00'), R(' עידן  חגג ', 725, 'רובי', '', '12:15', 'יבוא לבד'), R('משה כהן', 400, 'רובי', '0522222222')]);
  const blockTotals = async () => { const a = await api('GET', '/api/accounts/' + SP); const t = {}; for (const r of a.records) t[r.c] = (t[r.c] || 0) + r.a; return { t, all: a.records.reduce((s, r) => s + r.a, 0), recs: a.records }; };
  const before = await blockTotals();
  const clickMerge = async () => { await p.click('[data-eact]:has-text("איחוד שורות")'); };

  await step('לחיצה אחת על ״איחוד שורות״ — עידן חגג מופיע פעם אחת עם 8,625 ₪, וההודעה ברורה', async () => {
    await p.goto(URL + '/#/acc/' + SP + '?edit=1'); await p.waitForSelector('[data-eact]');
    assert.ok((await p.locator('#ed-h-records').innerText()).includes('(4)'));
    await clickMerge(); await p.waitForSelector('#mgmsg');
    const msg = await p.locator('#mgmsg').innerText(); assert.ok(msg.includes('אוחדו 2 שורות של עידן חגג לשורה אחת בסך 8,625 ₪'), msg);
    assert.strictEqual(await p.locator('tr.mghead').count(), 1);
    const h = await p.locator('tr.mghead').innerText(); assert.ok(h.includes('עידן חגג') && h.includes('8,625') && !h.includes('class='), h);
    assert.ok((await p.locator('#ed-h-records').innerText()).includes('(3)'), 'מספר הלקוחות עודכן ל-3');
  });
  await step('״פירוט חובות״ מציג טל — 7,900 ₪ ורובי — 725 ₪, עם השעה וההערה המקוריות', async () => {
    await p.click('[data-mgd]'); const t = await p.locator('tr.mgdet .mglines').innerText();
    assert.ok(/טל — 7,900(\.00)? ₪ · 09:30 · לבקש מזומן/.test(t), t); assert.ok(/רובי — 725(\.00)? ₪ · 12:15 · יבוא לבד/.test(t), t);
    assert.strictEqual(await p.locator('tr.mgpart').count(), 2);
  });
  await step('״שמור״ — הסכום של כל גובה וסך הפיצול זהים לפני ואחרי', async () => {
    await p.click('#ed-save'); await p.waitForFunction(() => !location.hash.includes('edit')); await p.waitForSelector('.card');
    const after = await blockTotals(); assert.deepStrictEqual(after.t, before.t); assert.strictEqual(after.all, before.all);
    const id = after.recs.filter(r => r.n.includes('עידן')); assert.strictEqual(id.length, 2); assert.ok(id[0].mg && id[0].mg === id[1].mg);
    assert.deepStrictEqual(id.map(r => [r.c, r.a, r.t, r.note]).sort(), [['טל', 7900, '09:30', 'לבקש מזומן'], ['רובי', 725, '12:15', 'יבוא לבד']].sort());
  });
  await step('מסך הפיצול אחרי רענון: בחשבון של טל 7,900 ובחשבון של רובי 725; בסיכום עידן חגג פעם אחת עם 8,625 ופירוט', async () => {
    await p.reload(); await p.waitForSelector('.card h2');
    const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });
    assert.ok((await card('טל').innerText()).includes('7,900')); assert.ok(!(await card('טל').innerText()).includes('725'));
    assert.ok((await card('רובי').innerText()).includes('725')); assert.ok(!(await card('רובי').innerText()).includes('7,900'));
    const sumTxt = await p.locator('.card', { hasText: 'סיכום' }).last().innerText(); assert.ok(/לקוחות\s*3/.test(sumTxt), sumTxt);
    await p.click('details.mgview summary'); const t = await p.locator('details.mgview').innerText();
    assert.ok(t.includes('עידן חגג') && t.includes('8,625') && t.includes('טל — 7,900') && t.includes('רובי — 725'), t);
    assert.strictEqual(await p.locator('.pill', { hasText: 'חוב מאוחד · סה״כ 8,625' }).count(), 2);
  });
  await step('פתיחה מחדש של העריכה ולחיצה נוספת — לא מתווסף שום חוב, הסכומים לא משתנים', async () => {
    await p.goto(URL + '/#/acc/' + SP + '?edit=1'); await p.waitForSelector('tr.mghead');
    assert.ok((await p.locator('tr.mghead').innerText()).includes('8,625'));
    await clickMerge(); await p.waitForTimeout(400); assert.strictEqual(await p.locator('#mgmsg').count(), 0);
    assert.ok((await p.locator('#toast, .toast').last().innerText()).includes('כבר מאוחדות'));
    await p.click('#ed-save'); await p.waitForFunction(() => !location.hash.includes('edit'));
    const after = await blockTotals(); assert.deepStrictEqual(after.t, before.t); assert.strictEqual(after.recs.length, 4);
  });
  await step('צורות כתיבה של גרש מאוחדות; שם זהה עם שני טלפונים תקינים ושונים — שואלים, ו״אנשים שונים״ לא מאחד', async () => {
    const S2 = await mk('2026-11-23', [R("מוטי ג'ורג'", 300, 'טל', ''), R('מוטי ג׳ורג׳', 200, 'אבי', 'בדיקה'), R('יוסי כהן', 100, 'טל', '0523333333'), R('יוסי כהן', 50, 'רובי', '0524444444')]);
    await p.goto(URL + '/#/acc/' + S2 + '?edit=1'); await p.waitForSelector('[data-eact]'); await clickMerge();
    await p.waitForSelector('#mgok'); const t = await p.locator('#sheet').innerText(); assert.ok(t.includes('יוסי כהן') && t.includes('0523333333') && t.includes('0524444444') && !t.includes('ג׳ורג׳'), t);
    await p.click('#mgok'); await p.waitForSelector('#mgmsg');
    const msg = await p.locator('#mgmsg').innerText(); assert.ok(msg.includes('אוחדו 2 שורות של') && msg.includes('500') && msg.includes('לא אוחדו (אנשים שונים): יוסי כהן'), msg);
    assert.strictEqual(await p.locator('tr.mghead').count(), 1);
    await clickMerge(); await p.waitForTimeout(300); assert.strictEqual(await p.locator('#sheet:not([hidden]) #mgok').count(), 0, 'לא שואל שוב');
    // אישור ״אותו אדם״ מאחד
    await p.evaluate(() => {}); await p.click('#ed-save'); await p.waitForFunction(() => !location.hash.includes('edit'));
    const a = await api('GET', '/api/accounts/' + S2); assert.ok(a.mgDiff && a.mgDiff.length === 1); assert.ok(!a.records.filter(r => r.n === 'יוסי כהן').some(r => r.mg));
  });
  await step('אייפון: השורה המאוחדת ו״פירוט חובות״ נוחים בטלפון, ואין שגיאות דף', async () => {
    const m = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.goto(URL + '/#/login'); await q.fill('input[name=u]', 'owner'); await q.fill('input[name=p]', 'Owner-pass-1'); await q.click('form button'); await q.waitForSelector('.kpis');
    await q.goto(URL + '/#/acc/' + SP + '?edit=1'); await q.waitForSelector('tr.mghead'); await q.click('[data-mgd]'); await q.waitForSelector('tr.mgdet');
    await q.locator('tr.mghead').scrollIntoViewIfNeeded(); await q.screenshot({ path: path.join(os.tmpdir(), 'split-merge-iphone.png') });
    await m.close(); assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
