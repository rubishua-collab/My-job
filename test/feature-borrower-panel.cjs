// בדיקת ״איחוד חובות לפי לווה״ ברשימת ״שעות, גובים ופיצול סכום״: שורה אחת ללווה עם סה״כ והערות לפי גובה.
// דוגמאות: אדיר לביא — אושר 3,200 + רובי 2,200 (שתי שורות אצל רובי: 1,200 + 1,000); אור פהר — אושר 1,700 + רובי 1,300.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8420, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-bp-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (c) => { const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const desk = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'he-IL' });
  const p = await login(desk);
  const api = async (m, u, body) => { const r = await desk.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const R = (n, a, c, t, note) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t: t || '', note: note || '', cnt: 1, side: false });
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-19', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [
    R('אדיר לביא', 3200, 'אושר', '10:00', 'מזומן'), R('אור פהר', 1700, 'אושר', '11:00'), R('אדיר לביא', 1200, 'רובי', '12:30'), R('אור פהר', 1300, 'רובי'),
    R('אדיר לביא', 1000, 'רובי', '13:00', 'יתרה ישנה'), R('דני כהן', 500, 'אושר'), R('דני כהן', 400, 'אושר 2'), R('שירה לוי', 900, 'אושר') ] };
    ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'fill' }); }
  const totals = async () => { const a = await api('GET', '/api/accounts/' + SP); const t = {}; a.records.forEach(r => t[r.c] = (t[r.c] || 0) + r.a); return { t, all: a.records.reduce((s, r) => s + r.a, 0), n: a.records.length, recs: a.records }; };
  const before = await totals();
  const mgp = (nm) => p.locator('#spt-lists .mgp', { hasText: nm });

  await step('לחיצה על ״איחוד חובות לפי לווה״ → ברשימת ״שעות, גובים ופיצול סכום״ שורה אחת לכל לווה תחת ״משויכים לכמה גובים״', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#mgbtn'); await p.click('#mgbtn'); await p.waitForSelector('#mgall');
    await p.click('#mgmark'); await p.click('#mgall'); await p.waitForSelector('#spt-lists .mgp');
    assert.ok((await p.locator('#spt-lists .mgph').innerText()).includes('משויכים לכמה גובים · 3'));
    for (const nm of ['אדיר לביא', 'אור פהר', 'דני כהן']) { assert.strictEqual(await mgp(nm).count(), 1, nm); assert.strictEqual(await p.locator('#spt-lists .pl:not(.mgstub)', { hasText: nm }).count(), 0, nm + ' לא חוזר כשורה מלאה ברשימות הגובים'); assert.ok(await p.locator('#spt-lists .mgstub', { hasText: nm }).count() >= 1, nm + ' — שורה קצרה עם השם אצל הגובה'); }
  });
  await step('הדוגמאות: סה״כ והערות לפי גובה (כמה שורות אצל אותו גובה מתחברות)', async () => {
    assert.ok((await mgp('אדיר לביא').locator('.mgp-h').innerText()).includes('אדיר לביא — סה״כ 5,400 ₪'));
    assert.strictEqual((await mgp('אדיר לביא').locator('.mgp-notes').innerText()).trim(), 'אושר 3,200 ₪ | רובי 2,200 ₪');
    assert.ok((await mgp('אור פהר').locator('.mgp-h').innerText()).includes('אור פהר — סה״כ 3,000 ₪'));
    assert.strictEqual((await mgp('אור פהר').locator('.mgp-notes').innerText()).trim(), 'אושר 1,700 ₪ | רובי 1,300 ₪');
    assert.strictEqual((await mgp('דני כהן').locator('.mgp-notes').innerText()).trim(), 'אושר 500 ₪ | אושר 2 400 ₪', 'אושר ואושר 2 נפרדים');
  });
  await step('״פירוט מלא״: כל שורות המקור עם גובה, סכום, שעת איסוף, סטטוס והערה מקורית', async () => {
    await mgp('אדיר לביא').locator('[data-mgfull]').click(); await p.waitForSelector('#spt-lists .mgfull');
    const rows = mgp('אדיר לביא').locator('.mgfull tbody tr'); assert.strictEqual(await rows.count(), 3);
    const vals = []; for (let i = 0; i < 3; i++) { const r = rows.nth(i); vals.push([await r.locator('select[data-mv]').inputValue(), await r.locator('[data-mga]').inputValue(), await r.locator('[data-spt]').inputValue(), (await r.locator('td').nth(4).innerText()).trim(), await r.locator('[data-mgn]').inputValue()]); }
    assert.deepStrictEqual(vals, [['אושר', '3200', '10:00', 'לאסוף', 'מזומן'], ['רובי', '1200', '12:30', 'לאסוף', ''], ['רובי', '1000', '13:00', 'לאסוף', 'יתרה ישנה']]);
  });
  await step('עריכת סכום בשורת מקור מעדכנת מיד את הסה״כ ואת ההערות, ונשמרת', async () => {
    const inp = mgp('אדיר לביא').locator('[data-mga]').nth(2); await inp.fill('1500');
    assert.ok((await mgp('אדיר לביא').locator('.mgp-tot').innerText()).includes('5,900'));
    assert.strictEqual((await mgp('אדיר לביא').locator('.mgp-notes').innerText()).trim(), 'אושר 3,200 ₪ | רובי 2,700 ₪');
    await inp.press('Tab'); await p.waitForTimeout(800);
    const a = await totals(); assert.strictEqual(a.recs.find(r => r.n === 'אדיר לביא' && r.t === '13:00').a, 1500);
    before.t['רובי'] += 500; before.all += 500;
  });
  await step('סינון ״אושר״: אצל אדיר ״חלקו של אושר 3,200 ₪ · חוב כולל 5,900 ₪״, ובסיכום של אושר רק 3,200 עבורו', async () => {
    await p.click('.chip[data-c="אושר"]'); await p.waitForTimeout(250);
    const row = p.locator('#spt-lists .pl', { hasText: 'אדיר לביא' }); assert.strictEqual(await row.count(), 1);
    assert.ok((await row.innerText()).includes('חלקו של אושר 3,200 ₪ · חוב כולל 5,900 ₪'), await row.innerText());
    { const lt = (await p.locator('#spt-lists .sub').allInnerTexts()).join(' / '); assert.ok(lt.includes('סה״כ אושר: 6,300'), 'אושר = 3,200+1,700+500+900 משורות המקור: ' + lt); }
    await p.click('.chip[data-c="אושר 2"]'); await p.waitForTimeout(250);
    assert.ok((await p.locator('#spt-lists .pl', { hasText: 'דני כהן' }).innerText()).includes('חלקו של אושר 2 400 ₪'));
    await p.click('.chip[data-c=""]');
  });
  await step('סכומי הגובים וסך החשבון משורות המקור — כל סכום פעם אחת; לא נוצרו שורות', async () => {
    const a = await totals(); assert.deepStrictEqual(a.t, before.t); assert.strictEqual(a.all, before.all); assert.strictEqual(a.n, before.n);
  });
  await step('אחרי ״שמור שינויים״, רענון ולחיצה חוזרת על הכפתור — כל לווה פעם אחת, סכומים והערות נכונים', async () => {
    await p.click('#ssave'); await p.reload(); await p.waitForSelector('#spt-lists .mgp');
    await p.click('#mgbtn'); await p.waitForTimeout(300); assert.strictEqual(await p.locator('#sheet:not([hidden]) #mgall').count(), 0, 'אין מה לאחד שוב');
    assert.strictEqual(await p.locator('#spt-lists .mgp').count(), 3);
    assert.strictEqual((await mgp('אדיר לביא').locator('.mgp-notes').innerText()).trim(), 'אושר 3,200 ₪ | רובי 2,700 ₪');
    assert.strictEqual((await mgp('אור פהר').locator('.mgp-notes').innerText()).trim(), 'אושר 1,700 ₪ | רובי 1,300 ₪');
    const a = await totals(); assert.deepStrictEqual(a.t, before.t); assert.strictEqual(a.n, before.n);
  });
  await step('אייפון: השורה וההערות קריאות בלי גלילה הצידה', async () => {
    const m = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const q = await login(m);
    await q.goto(URL + '/#/acc/' + SP); await q.waitForSelector('#spt-lists .mgp'); await q.locator('#spt-lists .mgph').scrollIntoViewIfNeeded();
    const n = q.locator('#spt-lists .mgp', { hasText: 'אור פהר' }).locator('.mgp-notes'); const bx = await n.boundingBox(); const vw = q.viewportSize().width;
    assert.ok(bx && bx.x >= 0 && bx.x + bx.width <= vw + 1 && bx.height >= 24, JSON.stringify(bx)); assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await q.screenshot({ path: path.join(os.tmpdir(), 'borrower-panel-iphone.png') }); assert.deepStrictEqual(q.errs, []); await m.close();
  });
  await step('אין שגיאות דף', async () => { assert.deepStrictEqual(p.errs, []); });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
