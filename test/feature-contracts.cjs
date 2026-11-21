// בדיקת חוזים לחתימה: בעל התוכנה יוצר חוזה, הלקוח פותח את הקישור בלי כניסה, מאמת, מעלה צילום ת״ז, חותם באצבע ושולח.
// בעל התוכנה רואה ״נחתם״ ואת הקבצים. אסימון או קוד שגויים נדחים, גובה מקבל 403.
// הרצה: BACKUP=path/to/backup.json node test/feature-contracts.cjs   (פורט 8305, אפשר לשנות ב-PORT)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 8305, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-contracts-'));
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-contracts-shots'); fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false }); console.log('✗', name, '\n   ', String(e.message).split('\n').slice(0, 8).join('\n    ')); } };

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), PUBLIC_URL: URL, COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP || '' };
  delete env.ANTHROPIC_API_KEY; delete env.CONTRACTS_GAS_URL;
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 60 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const api = async (ctx, method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null), headers: r.headers(), body: await r.body().catch(() => null) }; };

  const desk = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const p = await desk.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  let token = '', vcode = '', cid = '', png = null;

  await step('כניסת בעלים ורשימת החוזים הקיימים (2 מהגיבוי)', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
    png = await p.screenshot({ clip: { x: 0, y: 0, width: 400, height: 260 } });
    await p.goto(URL + '/#/more'); await p.click('a[href="#/contracts-manage"]');
    await p.waitForSelector('.sg-rec');
    const n = await p.locator('#sg-recs .sg-rec').count(); assert.ok(n >= 2, 'רשומות: ' + n);
    assert.ok(await p.locator('.sg-rec', { hasText: 'לאה' }).locator('a', { hasText: 'צפייה בחוזה החתום' }).count(), 'חוזה חתום ישן עם PDF');
    assert.ok(await p.locator('.sg-rec', { hasText: 'רונן' }).locator('[data-act=mklink]').count(), 'חוזה ישן בלי קישור חדש');
  });

  await step('יצירת היתר עסקה: בחירת לקוח, ת״ז ידנית אחרי 503, צילום ת״ז, שמירה', async () => {
    await p.click('#sg-new'); await p.waitForSelector('#sg-kindSeg');
    await p.click('[data-kd=h]');
    await p.fill('#sg-fName', 'היתר בדיקה');
    await p.fill('#sg-pick', 'שימרי'); await p.locator('[data-pick]', { hasText: 'שימרי מלכה' }).first().click();
    assert.strictEqual(await p.inputValue('#sg-fOperator'), 'שימרי מלכה', 'operator');
    await p.fill('#sg-fClientPhone', '050-1234567');
    await p.fill('#sg-fInvestor', 'משקיע בדיקה');
    await p.fill('#sg-fAmount', '10000'); await p.fill('#sg-fProfit', '2000'); await p.fill('#sg-fPayments', '4');
    await p.locator('#sg-fPayments').press('Tab');
    assert.strictEqual(await p.inputValue('#sg-fMonthly'), '3000', 'monthly');
    // צילום ת״ז: אין חיבור ל-Claude → הזיהוי נכשל בעדינות ונפתחת הקלדה ידנית
    await p.setInputFiles('#sg-fxFrontUp', { name: 'id.png', mimeType: 'image/png', buffer: png });
    await p.waitForSelector('#sg-fxThFront img');
    if (await p.locator('#sg-fxRead').isVisible()) await p.click('#sg-fxRead');
    await p.waitForSelector('#sg-fxForm:not([hidden])');
    const st = await p.textContent('#sg-fxIdSt'); assert.ok(/Claude|ידני/.test(st), 'הודעה: ' + st);
    await p.fill('#sg-fxFirst', 'שימרי'); await p.fill('#sg-fxLast', 'מלכה'); await p.fill('#sg-fxNum', '123456782');
    await p.click('#sg-fxOk');
    assert.strictEqual(await p.inputValue('#sg-fOpId'), '123456782', 'opid');
    assert.ok((await p.textContent('#sg-livePaper')).includes('שימרי מלכה'));
    await p.screenshot({ path: path.join(OUT, 'c1-editor.png'), fullPage: true });
    await p.click('#sg-btnSave1');
    await p.waitForSelector('.sg-sendnow');
    const L = (await api(desk, 'GET', '/api/sign/list')).json;
    const r = L.items.find(x => x.d.nm === 'היתר בדיקה'); assert.ok(r, 'נשמר');
    assert.strictEqual(r.status, 'draft'); assert.ok(/^\d{6}$/.test(r.vcode)); assert.ok(r.link.startsWith(URL + '/sign.html#'));
    assert.ok(r.files.some(f => f.field === 'idImgs[0]'), 'צילום ת״ז של בעל התוכנה נשמר'); assert.strictEqual(r.idc.idNumber, '123456782');
    token = r.link.split('#')[1]; vcode = r.vcode; cid = r.id;
    const wa = await p.locator('.sg-sendnow a.btn.wa').getAttribute('href');
    assert.ok(wa.startsWith('https://wa.me/972501234567?text=') && decodeURIComponent(wa).includes(vcode) && decodeURIComponent(wa).includes(token), 'קישור וואטסאפ');
  });

  await step('חוזה אחר (טופס הזמנה): עוזר המילוי בלי Claude ממלא את פרטי הת״ז במקומות הריקים', async () => {
    await p.goto(URL + '/#/contracts-manage/new'); await p.waitForSelector('#sg-kindSeg');
    await p.click('[data-kd=o]'); await p.fill('#sg-fName', 'טופס הזמנה בדיקה'); await p.fill('#sg-fOperator', 'לקוח אחר'); await p.fill('#sg-fClientPhone', '0521112233');
    await p.fill('#sg-fText', 'טופס הזמנה\nשם מלא:\nת.ז.:\nכמות מגשים: ______\nחתימה: ________');
    await p.click('#sg-fxManual'); await p.fill('#sg-fxFirst', 'דנה'); await p.fill('#sg-fxLast', 'כהן'); await p.fill('#sg-fxNum', '123456782'); await p.click('#sg-fxOk');
    await p.waitForSelector('#sg-fxPv:not([hidden]) .fx-f');
    const pv = await p.textContent('#sg-fxPv'); assert.ok(pv.includes('דנה כהן') && pv.includes('123456782'), pv);
    await p.click('#sg-btnSave1'); await p.waitForSelector('.sg-sendnow');
    const r = (await api(desk, 'GET', '/api/sign/list')).json.items.find(x => x.d.nm === 'טופס הזמנה בדיקה');
    assert.strictEqual(r.d.kd, 'o'); assert.ok(r.d.k.includes('שם מלא: דנה כהן'), r.d.k); assert.ok(r.fill && r.fill.slots.length >= 3, 'fill נשמר');
  });

  await step('קישור או קוד שגויים נדחים, בלי לחשוף חוזים אחרים', async () => {
    const anon = await b.newContext();
    assert.strictEqual((await api(anon, 'GET', '/api/public/sign/' + 'A'.repeat(32))).status, 404);
    assert.strictEqual((await api(anon, 'GET', '/api/public/sign/short')).status, 404);
    const info = await api(anon, 'GET', '/api/public/sign/' + token);
    assert.strictEqual(info.status, 200); assert.deepStrictEqual(Object.keys(info.json).sort(), ['kind', 'sender', 'signed', 'title']);
    const bad = await api(anon, 'POST', '/api/public/sign/' + token + '/open', { phone: '0501234567', code: vcode === '111111' ? '222222' : '111111' });
    assert.strictEqual(bad.status, 403);
    const badPh = await api(anon, 'POST', '/api/public/sign/' + token + '/open', { phone: '0509999999', code: vcode });
    assert.strictEqual(badPh.status, 403);
    const ok = await api(anon, 'POST', '/api/public/sign/' + token + '/open', { phone: '050-1234567', code: vcode });
    assert.strictEqual(ok.status, 200); assert.ok(!('vh' in ok.json.d) && !('vcode' in ok.json) && !JSON.stringify(ok.json).includes(vcode), 'לא נחשף קוד/טביעה');
    assert.strictEqual((await api(anon, 'GET', '/api/sign/list')).status, 401);
    assert.strictEqual((await api(anon, 'GET', '/api/files/x')).status, 401);
    const sub = await api(anon, 'POST', '/api/public/sign/' + token + '/submit', { phone: '0501234567', code: '000000', name: 'x' });
    assert.strictEqual(sub.status, 403);
    await anon.close();
  });

  await step('הלקוח חותם בדף החתימה בלי כניסה: אימות, צילום ת״ז, חתימה באצבע', async () => {
    const cl = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    const c = await cl.newPage(); const cerr = []; c.on('pageerror', e => cerr.push(e.message));
    await c.goto(URL + '/sign.html#' + token);
    await c.waitForSelector('#v-verify:not([hidden])');
    assert.strictEqual(await c.textContent('#c-title'), 'היתר בדיקה');
    await c.fill('#s-phone', '0501234567'); await c.fill('#s-code', vcode === '123123' ? '321321' : '123123'); await c.click('#b-verify');
    await c.waitForSelector('#ver-err:not([hidden])'); assert.ok((await c.textContent('#ver-err')).includes('שגוי'));
    await c.fill('#s-code', vcode); await c.click('#b-verify');
    await c.waitForSelector('#v-sign:not([hidden])');
    assert.ok((await c.textContent('#c-paper')).includes('שימרי מלכה'));
    assert.strictEqual(await c.inputValue('#s-id'), '123456782');
    assert.ok(await c.isDisabled('#b-sign'));
    await c.setInputFiles('#in-front', { name: 'id.png', mimeType: 'image/png', buffer: png });
    await c.waitForSelector('#img-front:not([hidden])');
    await c.locator('#pad').scrollIntoViewIfNeeded(); const box = await c.locator('#pad').boundingBox();
    await c.mouse.move(box.x + 20, box.y + box.height / 2); await c.mouse.down();
    for (let i = 1; i <= 20; i++) await c.mouse.move(box.x + 20 + i * (box.width - 40) / 20, box.y + box.height / 2 + Math.sin(i) * 30);
    await c.mouse.up();
    await c.check('#s-agree');
    await c.waitForFunction(() => !document.getElementById('b-sign').disabled, null, { timeout: 8000 }).catch(async () => { throw new Error('לא מוכן לחתימה: ' + await c.textContent('#sign-hint')); });
    await c.screenshot({ path: path.join(OUT, 'c2-client-sign.png'), fullPage: true });
    await c.click('#b-sign');
    await c.waitForSelector('#v-done:not([hidden])', { timeout: 60000 });
    assert.ok((await c.textContent('#done-fp')).match(/[0-9A-F]{10}/));
    await c.screenshot({ path: path.join(OUT, 'c3-client-done.png') });
    assert.deepStrictEqual(cerr, []);
    // חתימה שנייה על אותו קישור נדחית
    const again = await api(cl, 'POST', '/api/public/sign/' + token + '/submit', { phone: '0501234567', code: vcode, name: 'שימרי', id: '123456782', agree: true, sig: 'data:image/png;base64,' + png.toString('base64'), ids: ['data:image/png;base64,' + png.toString('base64')], pdf: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64') });
    assert.strictEqual(again.status, 409);
    await cl.close();
  });

  await step('בעל התוכנה רואה ״נחתם״ ואת הקבצים: PDF, חתימה וצילום ת״ז', async () => {
    const r = (await api(desk, 'GET', '/api/sign/item/' + cid)).json;
    assert.strictEqual(r.status, 'signed'); assert.strictEqual(r.signer.name, 'שימרי מלכה'); assert.strictEqual(r.signer.id, '123456782'); assert.ok(/^[0-9A-F]{10}$/.test(r.signer.fp));
    for (const k of ['pdf', 'sig', 'id1']) assert.ok(r.files.some(f => f.field === k), 'חסר ' + k);
    const pdf = r.files.find(f => f.field === 'pdf');
    const f = await api(desk, 'GET', '/api/files/' + pdf.id);
    assert.strictEqual(f.status, 200); assert.strictEqual(f.headers['content-type'], 'application/pdf'); assert.ok(f.body.slice(0, 4).toString() === '%PDF');
    assert.ok(f.body.toString('latin1').includes('YHSIGN1:'), 'פרטי החתימה בתוך ה-PDF');
    await p.goto(URL + '/#/contracts-manage'); await p.waitForSelector('.sg-rec');
    const card = p.locator('#sg-recs .sg-rec:not(.sg-sendnow)[data-id="' + cid + '"]');
    assert.ok((await card.textContent()).includes('נחתם'));
    await card.locator('[data-act=files]').click();
    await card.locator('.sg-files img').nth(2).waitFor();
    const n = await card.locator('.sg-files img').count(); assert.ok(n >= 3, 'תמונות: ' + n);
    await p.screenshot({ path: path.join(OUT, 'c4-owner-signed.png'), fullPage: true });
  });

  await step('ניסיונות קוד שגויים ננעלים (429)', async () => {
    const r = (await api(desk, 'GET', '/api/sign/list')).json.items.find(x => x.d.nm === 'טופס הזמנה בדיקה');
    const tk = r.link.split('#')[1]; const anon = await b.newContext(); let last = 0;
    for (let i = 0; i < 9; i++) last = (await api(anon, 'POST', '/api/public/sign/' + tk + '/open', { phone: '0521112233', code: r.vcode === '999999' ? '888888' : '999999' })).status;
    assert.strictEqual(last, 429);
    assert.strictEqual((await api(anon, 'POST', '/api/public/sign/' + tk + '/open', { phone: '0521112233', code: r.vcode })).status, 429, 'גם קוד נכון נחסם בזמן הנעילה');
    await anon.close();
  });

  await step('קישור חדש לחוזה ישן, קישור חדש מבטל את הקודם', async () => {
    const l = await api(desk, 'POST', '/api/sign/EKbZJam5kcT9OZ0cmwmbh5hg/link', {});
    assert.strictEqual(l.status, 200); assert.strictEqual(l.json.vcode, '970728', 'קוד האימות המקורי נשמר');
    const t1 = l.json.link.split('#')[1];
    const l2 = await api(desk, 'POST', '/api/sign/EKbZJam5kcT9OZ0cmwmbh5hg/link', { regen: true });
    const anon = await b.newContext();
    assert.strictEqual((await api(anon, 'GET', '/api/public/sign/' + t1)).status, 404);
    assert.strictEqual((await api(anon, 'GET', '/api/public/sign/' + l2.json.link.split('#')[1])).status, 200);
    await anon.close();
  });

  await step('גובה מקבל 403 על כל נתיבי החוזים', async () => {
    await api(desk, 'POST', '/api/users', { username: 'gov', password: 'Gov-pass-123', role: 'collector', name: 'גובה', collector_name: 'בן' });
    const g = await b.newContext(); await api(g, 'POST', '/api/login', { username: 'gov', password: 'Gov-pass-123' });
    for (const [m, u, body] of [['GET', '/api/sign/list'], ['GET', '/api/sign/item/' + cid], ['GET', '/api/sign/clients'], ['GET', '/api/sign/settings'], ['POST', '/api/sign/save', { d: { nm: 'x' } }], ['POST', '/api/sign/' + cid + '/status', { status: 'draft' }], ['POST', '/api/sign/' + cid + '/link', {}], ['DELETE', '/api/sign/' + cid], ['POST', '/api/sign/' + cid + '/idimg', {}], ['GET', '/api/docs/contracts']])
      assert.strictEqual((await api(g, m, u, body)).status, 403, m + ' ' + u);
    await g.close();
  });

  await step('מחיקה לצמיתות (בעלים): הקבצים נמחקים והקישור מפסיק לעבוד', async () => {
    const r = (await api(desk, 'GET', '/api/sign/list')).json.items.find(x => x.d.nm === 'טופס הזמנה בדיקה');
    assert.strictEqual((await api(desk, 'DELETE', '/api/sign/' + r.id)).status, 200);
    const anon = await b.newContext(); assert.strictEqual((await api(anon, 'GET', '/api/public/sign/' + r.link.split('#')[1])).status, 404); await anon.close();
  });

  await step('אין שגיאות בדפדפן', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} עברו. צילומי מסך: ${OUT}`);
  if (failed.length) console.log(slog.split('\n').slice(-20).join('\n'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
