// בדיקת ״מחיקת רישום״ במסך ״חשבונות״: מחיקה + ביטול ההשפעה הכספית פעם אחת בלבד, על נתוני בדיקה (מסד ריק), באייפון.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8350, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-rm-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).split('\n')[0]); } };
const r2 = x => Math.round(x * 100) / 100;
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) { const e = new Error(u + ': ' + JSON.stringify(j)); e.status = r.status(); throw e; } return j; };
  const acc = (id) => api('GET', '/api/accounts/' + id);
  const gone = async (id) => { try { await acc(id); return false; } catch (e) { return e.status === 404; } };
  let n = 0;
  const mk = async (kind, date, fill) => { const { id } = await api('POST', '/api/accounts', { kind, date, opId: 'mk' + (++n) }); if (fill) await upd(id, fill); return id; };
  const upd = async (id, fill) => { const a = await acc(id); const data = { ...a, ...fill }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: 'u' + (++n) }); };
  const listRow = (id) => p.locator(`.accrow[data-id="${id}"]`);
  const count = async () => parseInt(await p.locator('#acount').innerText());

  // ---------- מצב 1: דף ריק עם קרן מועברת ----------
  const A1 = await mk('morning', '2026-11-19', { keren: 200000, courier: 16.32, rows: [{ n: 'לקוח א', i: 4000, p: 8800 }] });
  const F1 = (await acc(A1)).finalKeren;
  const A2 = await mk('morning', '2026-11-21'); // 0 שורות, הקרן הועברה מ-19.11
  const W21 = await mk('work', '2026-11-21', { entries: [{ n: 'לקוח עצמאי', p: '0500000001', a: 100, c: 'יוסי' }] });

  await step('מצב 1: בכל רישום יש כפתור ״מחיקת רישום״ נוח ללחיצה בטלפון', async () => {
    assert.strictEqual(+(await acc(A2)).keren, F1, 'הקרן הועברה');
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow');
    const bx = await listRow(A2).locator('[data-rm]').boundingBox(); assert.ok(bx.height >= 44 && bx.width >= 44, JSON.stringify(bx));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.strictEqual(await p.locator('.accrow [data-rm]').count(), 3);
  });
  await step('מצב 1: חלון האישור מציג שם, תאריך והשאלה; ״ביטול״ לא מוחק', async () => {
    const c0 = await count(); await listRow(A2).locator('[data-rm]').click(); await p.waitForSelector('#rmgo');
    const t = await p.locator('#sheet').innerText();
    assert.ok(t.includes('חשבון בוקר 21.11.2026') && t.includes('למחוק את הרישום ולבטל את השינויים שהוא יצר בחשבון?') && t.includes('הקרן שהועברה נשארת'), t);
    assert.ok(await p.locator('#rmno').isVisible()); await p.click('#rmno'); await p.waitForTimeout(200);
    assert.ok(!(await gone(A2))); assert.strictEqual(await count(), c0);
  });
  await step('מצב 1: ״מחק רישום״ מסיר מיד מהרשימה ומהמונה; שום יתרה לא משתנה', async () => {
    const c0 = await count(); await listRow(A2).locator('[data-rm]').click(); await p.click('#rmgo');
    await p.waitForFunction(id => !document.querySelector(`.accrow[data-id="${id}"]`), A2);
    assert.strictEqual(await count(), c0 - 1); assert.ok(await gone(A2));
    assert.strictEqual((await acc(A1)).finalKeren, F1); assert.strictEqual((await acc(W21)).entries.length, 1, 'רישום אחר מאותו תאריך נשאר');
  });
  await step('מצב 1: אחרי רענון ובסינון ״חשבון בוקר״ ובחיפוש — הרישום לא מופיע', async () => {
    await p.reload(); await p.waitForSelector('.accrow'); assert.strictEqual(await listRow(A2).count(), 0);
    await p.click('.chip[data-k="morning"]'); assert.strictEqual(await listRow(A2).count(), 0); assert.strictEqual(await listRow(A1).count(), 1);
    await p.fill('#aq', '21.11'); await p.waitForTimeout(100); assert.strictEqual(await listRow(A2).count(), 0);
    await p.fill('#aq', ''); await p.click('.chip[data-k=""]');
  });
  await step('מצב 1: פתיחה מחדש של חשבון בוקר ל-21.11 — דף נקי עם הקרן הנכונה', async () => {
    await p.click('#newday'); await p.click('[data-dk="morning"]'); await p.fill('#dd', '2026-11-21'); await p.dispatchEvent('#dd', 'change');
    await p.waitForFunction(() => /אין דף/.test(document.querySelector('#ddinfo').textContent));
    await p.click('#ddgo'); await p.waitForSelector('#dclear');
    const id = p.url().split('#/acc/')[1].split('?')[0]; assert.notStrictEqual(id, A2);
    const a = await acc(id); assert.strictEqual(+a.keren, F1); assert.strictEqual(a.rows.length, 0);
    await api('POST', '/api/accounts/' + id + '/remove', { opId: 'cleanup1' });
  });

  // ---------- מצב 2: דף עם תנועות, ואחריו נרשמו פעולות נוספות ----------
  const B1 = await mk('morning', '2026-11-10', { keren: 50000, rows: [] });
  const B2 = await mk('morning', '2026-11-11', { rows: [{ n: 'ריבית וקרן', i: 300, p: 700 }], courier: 20, loans: [{ n: 'הלוואה חדשה', a: 400 }] });
  const b2 = await acc(B2); const delta = r2(b2.finalKeren - b2.keren); assert.ok(delta !== 0);
  const B3 = await mk('morning', '2026-11-12'); await upd(B3, { rows: [{ n: 'פעולה מאוחרת', i: 50, p: 150 }] }); // פעולה עצמאית שנרשמה אחרי
  const B4 = await mk('morning', '2026-11-13');
  const SP11 = await mk('split', '2026-11-11', { records: [{ n: 'שורה בפיצול', fn: 'שורה', ph: '0500000002', a: 75, c: 'אבי', cnt: 1 }] });
  const COL11 = await mk('collectors', '2026-11-11', { entries: [{ n: 'גבייה ייחודית לבדיקה', a: 321, c: 'אבי', k: 'd' }] });
  const before = { b3: await acc(B3), b4: await acc(B4) };

  await step('מצב 2: החלון מפרט בדיוק איזה שינוי בקרן יבוטל ובאילו חשבונות', async () => {
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow'); await p.reload(); await p.waitForSelector(`.accrow[data-id="${B2}"]`);
    await listRow(B2).locator('[data-rm]').click(); await p.waitForSelector('#rmgo');
    const t = await p.locator('#sheet').innerText(); assert.ok(t.includes('11.11.2026') && t.includes('12.11.2026') && t.includes('13.11.2026'), t);
  });
  await step('מצב 2: לחיצה כפולה על ״מחק רישום״ — מחיקה וקיזוז פעם אחת בלבד', async () => {
    const c0 = await count(); await p.locator('#rmgo').dblclick(); await p.waitForFunction(id => !document.querySelector(`.accrow[data-id="${id}"]`), B2);
    assert.strictEqual(await count(), c0 - 1); assert.ok(await gone(B2));
    const b3 = await acc(B3), b4 = await acc(B4);
    assert.strictEqual(+b3.keren, r2(before.b3.keren - delta), 'B3 קרן קיימת'); assert.strictEqual(+b3.keren, (await acc(B1)).finalKeren, 'B3 = הקרן הסופית של 10.11');
    assert.strictEqual(b3.rows.length, 1, 'הפעולה המאוחרת נשמרה'); assert.strictEqual(b3.finalKeren, r2(before.b3.finalKeren - delta));
    assert.strictEqual(+b4.keren, b3.finalKeren, 'B4 ממשיך את השרשרת'); assert.strictEqual(b4.finalKeren, r2(before.b4.finalKeren - delta));
  });
  await step('מצב 2: ניסיון חוזר (אותו opId) ומחיקה נוספת לא מקזזים שוב', async () => {
    const r1 = await api('POST', '/api/accounts/' + B2 + '/remove', { opId: 'again-1' }); assert.ok(r1.already);
    const r2_ = await api('POST', '/api/accounts/' + B2 + '/remove', { opId: 'again-1' }); assert.ok(r2_.replay);
    const b3 = await acc(B3); assert.strictEqual(+b3.keren, r2(before.b3.keren - delta));
  });
  await step('מצב 2: רישומים אחרים מאותו תאריך נשארים; אחרי רענון הרישום לא מופיע', async () => {
    assert.strictEqual((await acc(SP11)).records.length, 1); assert.strictEqual((await acc(COL11)).entries.length, 1);
    await p.reload(); await p.waitForSelector('.accrow'); assert.strictEqual(await listRow(B2).count(), 0);
    await p.goto(URL + '/#/acc/' + B3); await p.waitForSelector('.band'); assert.ok(!(await p.locator('body').innerText()).includes('לא נמצא'));
  });
  await step('חשבון גובים: מחיקה מסירה את השורות מחיפוש הלקוחות ומהסיכומים', async () => {
    assert.ok((await api('GET', '/api/search?q=' + encodeURIComponent('גבייה ייחודית'))).length >= 1);
    await p.goto(URL + '/#/accounts'); await p.waitForSelector(`.accrow[data-id="${COL11}"]`); await listRow(COL11).locator('[data-rm]').click(); await p.click('#rmgo');
    await p.waitForFunction(id => !document.querySelector(`.accrow[data-id="${id}"]`), COL11);
    assert.strictEqual((await api('GET', '/api/search?q=' + encodeURIComponent('גבייה ייחודית'))).length, 0);
    assert.strictEqual((await acc(SP11)).records.length, 1);
  });
  await step('קרן שהוקלדה ידנית בחשבון מאוחר היא פעולה עצמאית — לא משתנה', async () => {
    const C1 = await mk('morning', '2026-10-01', { keren: 1000 });
    const C2 = await mk('morning', '2026-10-02', { rows: [{ n: 'x', i: 10, p: 90 }] });
    const C3 = await mk('morning', '2026-10-03', { keren: 7777 });
    await api('POST', '/api/accounts/' + C2 + '/remove', { opId: 'c2rm' });
    assert.strictEqual(+(await acc(C3)).keren, 7777); assert.strictEqual(+(await acc(C1)).keren, 1000);
    // ואיסוף יום / פיצול נמחקים בלי לגעת בשום דבר אחר
    await api('POST', '/api/accounts/' + SP11 + '/remove', { opId: 'sp11' }); assert.ok(await gone(SP11)); assert.strictEqual((await acc(W21)).entries.length, 1);
  });
  await step('המחיקה שמורה גם אחרי כניסה מחדש, ואין שגיאות דף', async () => {
    await ctx.clearCookies(); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow');
    for (const id of [A2, B2, COL11, SP11]) assert.strictEqual(await listRow(id).count(), 0);
    await p.screenshot({ path: path.join(os.tmpdir(), 'acc-remove.png') });
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
