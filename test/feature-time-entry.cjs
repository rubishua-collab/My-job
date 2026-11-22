// בדיקת הזנת שעות ברצף בפיצול (אייפון): 18:00→18:30, נגיעה אחת בשדה השני + 1845, ״הבא״ לשלישי + 1900.
// בודקים שהשדה נשאר בפוקוס (המקלדת לא נסגרת), שהרשימה לא מצוירת מחדש ולא קופצת, ושאחרי סיום ורענון השעות נכונות.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8460, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-te-'));
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
  const R = (n, a, t) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c: 'בן', t: t || '', cnt: 1, side: false });
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-22', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [R('אבי ראשון', 500, '18:00'), R('בני שני', 600), R('גלי שלישי', 700), R('דנה רביעית', 800)] }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'f' }); }
  const recs = (await api('GET', '/api/accounts/' + SP)).records; const K = Object.fromEntries(recs.map(r => [r.n.split(' ')[0], r._k]));
  const tf = (who) => p.locator(`#spt-lists [data-spt="${K[who]}"]`);
  const touch = async (who) => { const bb = await tf(who).boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  const active = () => p.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.spt || '' : '');
  let y0;

  await step('הכנה: רשימת ״שעות, גובים ופיצול סכום״ באייפון; מסמנים את השדות כדי לזהות ציור מחדש', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#spt-lists [data-spt]');
    await tf('אבי').scrollIntoViewIfNeeded(); y0 = (await tf('אבי').boundingBox()).y; // המיקום של השורה על המסך
    await p.evaluate(() => document.querySelectorAll('#spt-lists [data-spt]').forEach(el => { el.__mark = 1; }));
    assert.strictEqual(await tf('אבי').inputValue(), '18:00');
  });
  await step('לווה 1: שינוי 18:00 ל-18:30 (מחיקת שתי ספרות והקלדת 30)', async () => {
    await touch('אבי'); await p.keyboard.press('End'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
    await p.keyboard.type('30'); assert.strictEqual(await tf('אבי').inputValue(), '18:30');
  });
  await step('נגיעה אחת בשדה של לווה 2 → הסמן עובר מיד; הקלדת 18 ואז השמירה של לווה 1 מסתיימת — הסמן והספרות נשארים', async () => {
    await touch('בני'); assert.strictEqual(await active(), K['בני'], 'הסמן בשדה של לווה 2 אחרי נגיעה אחת');
    await p.keyboard.type('18'); await p.waitForTimeout(1800); // השמירה האוטומטית של לווה 1 מסתיימת בזמן הזה
    assert.strictEqual((await api('GET', '/api/accounts/' + SP)).records.find(r => r._k === K['אבי']).t, '18:30', 'לווה 1 נשמר');
    assert.strictEqual(await active(), K['בני'], 'הסמן לא זז'); assert.strictEqual(await tf('בני').inputValue(), '18');
    await p.keyboard.type('45'); assert.strictEqual(await tf('בני').inputValue(), '18:45', '1845 → 18:45');
  });
  await step('״הבא״ → שדה השעה של לווה 3 (לא בחירת הגובה), הקלדת 1900', async () => {
    await p.keyboard.press('Enter'); assert.strictEqual(await active(), K['גלי']);
    await p.keyboard.type('1900'); assert.strictEqual(await tf('גלי').inputValue(), '19:00');
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#spt-lists select[data-mv]')].every(s => s.tabIndex === -1)); assert.ok(tabs, 'בחירת הגובה לא ברצף ״הבא״');
  });
  await step('לאורך כל הרצף: אותם שדות (בלי ציור מחדש — המקלדת לא נסגרת) ובלי קפיצה ברשימה', async () => {
    assert.ok(await p.evaluate(() => [...document.querySelectorAll('#spt-lists [data-spt]')].every(el => el.__mark === 1)), 'הרשימה צוירה מחדש באמצע');
    const y = (await tf('אבי').boundingBox()).y; assert.ok(Math.abs(y - y0) < 160, `השורה קפצה על המסך: ${y0} → ${y}`); // עד שורה אחת — הגלילה המינימלית כדי להראות את הלווה הבא
  });
  await step('״סיום״ שומר את השעה האחרונה; אחרי רענון 18:30 / 18:45 / 19:00 אצל הלווים הנכונים', async () => {
    await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(2200);
    const a = await api('GET', '/api/accounts/' + SP); const t = Object.fromEntries(a.records.map(r => [r.n.split(' ')[0], r.t]));
    assert.deepStrictEqual([t['אבי'], t['בני'], t['גלי'], t['דנה']], ['18:30', '18:45', '19:00', '']);
    await p.reload(); await p.waitForSelector('#spt-lists [data-spt]');
    assert.deepStrictEqual([await tf('אבי').inputValue(), await tf('בני').inputValue(), await tf('גלי').inputValue()], ['18:30', '18:45', '19:00']);
  });
  await step('שעה לא תקינה לא נשמרת; ספרות בלבד (930) הופכות ל-9:30 ונשמרות כ-09:30', async () => {
    await tf('דנה').scrollIntoViewIfNeeded(); await touch('דנה'); await p.keyboard.type('930'); assert.strictEqual(await tf('דנה').inputValue(), '9:30');
    await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(2200);
    assert.strictEqual((await api('GET', '/api/accounts/' + SP)).records.find(r => r._k === K['דנה']).t, '09:30');
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
