// בדיקת הערות מהפיצול באיסוף יום וברשימה לגובה (אייפון).
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8560, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-sn-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 500)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = '2026-11-24';
  const R = (n, a, c, t, x = {}) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t, cnt: 1, side: false, ...x });
  const N2 = 'להתקשר לפני הגעה\nלבקש מזומן בלבד, לא צ׳קים';
  const { id: S } = await api('POST', '/api/accounts', { kind: 'split', date: DATE, opId: 'mk' });
  const putSplit = async (records, op) => { const a = await api('GET', '/api/accounts/' + S); const data = { ...a, records: records(a.records) }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + S, { data, baseVersion: a._version, opId: op }); };
  await putSplit(() => [
    R('דני כהן', 1000, 'טל', '10:00', { note: N2 }),
    R('רון לוי', 500, 'בן', '10:30'),
    R('עידן חגג', 300, 'טל', '11:00', { note: 'גר בקומה 3', mg: 'gA' }), R('עידן חגג', 200, 'בן', '11:30', { note: 'לא בשבת', mg: 'gA' }),
    R('שרה מור', 400, 'טל', '12:00', { pg: 'p1', pp: '1/2', gnote: 'כללי: הכלב בחצר', note: 'רק לטל: לגבות 400' }), R('שרה מור', 600, 'בן', '12:30', { pg: 'p1', pp: '2/2', gnote: 'כללי: הכלב בחצר' }),
  ], 'f');
  // העברה לאיסוף יום (כמו כפתור ״העברה לאיסוף יומי״)
  { const a = await api('GET', '/api/accounts/' + S); await api('POST', '/api/split-tools/xfer', { splitId: S, date: DATE, baseVersion: a._version, entries: a.records.map(r => ({ sid: r._k, n: r.n, a: r.a, c: r.c, t: r.t, pg: r.pg, pp: r.pp })), opId: 'x1' }); }
  const W = (await api('GET', '/api/accounts?kind=work'))[0].id;
  const notesOf = async (name, amt) => { const row = p.locator('.li[data-row]', { hasText: name }).filter({ hasText: amt }); return (await row.locator('.wnote').allInnerTexts()).map(t => t.replace(/^✎\s*/, '')); };
  const collText = (name) => p.evaluate(async ([id, nm]) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return m.wCollText(a, nm); }, [W, name]);
  const pdfHtml = () => p.evaluate(async (id) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return m.workHTML(a); }, W);
  let before;

  await step('איסוף יום: שתי ההערות של דני מתחת לשמו, בנוסח המלא ועם מעבר השורה; לקוח בלי הערה — בלי שורת הערה', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-row]');
    const n = await notesOf('דני כהן', '1,000'); assert.deepStrictEqual(n, [N2]);
    const pre = await p.locator('.li[data-row]', { hasText: 'דני כהן' }).locator('.wnote').evaluate(el => getComputedStyle(el).whiteSpace); assert.strictEqual(pre, 'pre-line');
    const lines = await p.locator('.li[data-row]', { hasText: 'דני כהן' }).locator('.wnote').evaluate(el => el.getClientRects().length && el.innerText.split('\n').length); assert.ok(lines >= 2, 'שתי שורות');
    assert.strictEqual(await p.locator('.li[data-row]', { hasText: 'רון לוי' }).locator('.wnote').count(), 0);
    const a = await api('GET', '/api/accounts/' + W); before = { n: a.entries.length, sum: a.entries.reduce((s, e) => s + e.a, 0) };
  });
  await step('רשימה לגובה טל (וואטסאפ / העתקה) ו-PDF: ההערות מתחת לשם ולסכום של הלקוח המתאים', async () => {
    const t = await collText('טל'); const i = t.indexOf('דני כהן');
    assert.ok(i >= 0 && t.indexOf('✎ להתקשר לפני הגעה', i) > i && t.indexOf('✎ לבקש מזומן בלבד, לא צ׳קים', i) > i, t);
    const h = await pdfHtml(); assert.ok(h.includes('class="rnotes"') && h.includes('להתקשר לפני הגעה<br>לבקש מזומן בלבד'), 'PDF');
  });
  await step('חוב מאוחד (עידן): כל הערות הלקוח, כל אחת פעם אחת, אצל שני הגובים', async () => {
    for (const amt of ['300', '200']) { const n = await notesOf('עידן חגג', amt); assert.deepStrictEqual(n.sort(), ['גר בקומה 3', 'לא בשבת'].sort(), amt); }
  });
  await step('חוב שפוצל (שרה): ההערה הכללית לשני הגובים; ההערה לחלק — רק אצל טל', async () => {
    assert.deepStrictEqual(await notesOf('שרה מור', '400'), ['כללי: הכלב בחצר', 'רק לטל: לגבות 400']);
    assert.deepStrictEqual(await notesOf('שרה מור', '600'), ['כללי: הכלב בחצר']);
    const tb = await collText('בן'); assert.ok(tb.includes('כללי: הכלב בחצר') && !tb.includes('רק לטל'), tb);
  });
  const editMoved = async (name, text) => {
    await p.goto(URL + '/#/acc/' + S); await p.waitForSelector('#spt-moved'); if (!(await p.locator('#spt-moved').getAttribute('open') !== null)) await p.click('#spt-moved summary');
    const ta = p.locator('#spt-moved .li', { hasText: name }).locator('textarea[data-xsn]'); await ta.fill(text); await ta.press('Tab');
    await p.waitForTimeout(1800); // שמירה אוטומטית
  };
  await step('עריכת הערה בפיצול אחרי ההעברה (״שורות שהועברו לאיסוף״): הנוסח המעודכן באותה שורה וברשימה — בלי להעביר שוב; מספר הלקוחות והסכום זהים', async () => {
    await editMoved('דני כהן', 'להתקשר לפני הגעה\nלבקש מזומן או העברה');
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-row]');
    assert.deepStrictEqual(await notesOf('דני כהן', '1,000'), ['להתקשר לפני הגעה\nלבקש מזומן או העברה']);
    const t = await collText('טל'); assert.ok(t.includes('✎ לבקש מזומן או העברה') && !t.includes('לא צ׳קים'), t);
    const a = await api('GET', '/api/accounts/' + W); assert.strictEqual(a.entries.length, before.n); assert.strictEqual(a.entries.reduce((s, e) => s + e.a, 0), before.sum);
    assert.strictEqual(a.entries.filter(e => e.n === 'דני כהן').length, 1);
  });
  await step('הוספה ומחיקה של הערה בפיצול מתעדכנות באיסוף; ההערות לא נכתבות לתוך האיסוף', async () => {
    await editMoved('רון לוי', 'חדש: לצלצל פעמיים'); await editMoved('דני כהן', '');
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-row]');
    assert.deepStrictEqual(await notesOf('דני כהן', '1,000'), []); assert.deepStrictEqual(await notesOf('רון לוי', '500'), ['חדש: לצלצל פעמיים']);
    const work = await api('GET', '/api/accounts/' + W); const d = { ...work }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete d[k]);
    await api('PUT', '/api/accounts/' + W, { data: d, baseVersion: work._version, opId: 'sv' });
    await editMoved('רון לוי', 'עודכן שוב');
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('.li[data-row]'); assert.deepStrictEqual(await notesOf('רון לוי', '500'), ['עודכן שוב'], 'ההערה לא ״ננעלה״ באיסוף');
  });
  await step('לקוח שחזר לרשימת הפיצול (אותו שם וסכום) — ההערה שלו שם היא הנוסח המוצג; אין שגיאות דף', async () => {
    await putSplit(recs => recs.concat([R('שרה מור', 600, 'בן', '12:30', { note: 'חזר לפיצול: לבוא אחרי 13:00' })]), 'back');
    await p.goto(URL + '/#/acc/' + W); await p.reload(); await p.waitForSelector('.li[data-row]');
    assert.deepStrictEqual(await notesOf('שרה מור', '600'), ['חזר לפיצול: לבוא אחרי 13:00']);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
