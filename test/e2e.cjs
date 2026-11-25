// בדיקת תהליך עבודה מלא — אייפון ומחשב — על עותק של הנתונים, מול שרת וואטסאפ מדומה (לא נשלחות הודעות אמיתיות).
// הרצה: BACKUP=path/to/backup.json node test/e2e.cjs
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-e2e');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-data-'));
const PORT = +process.env.E2E_PORT || 8093, FPORT = PORT + 5, URL = 'http://localhost:' + PORT;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('✓', ...a);
const results = [];
let failShot = null;
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); log(name); } catch (e) { if (failShot) await failShot('fail-' + results.length).catch(() => {}); results.push({ name, ok: false, err: e.message }); console.log('✗', name, '\n   ', e.message.split('\n')[0]); } };

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), WA_GRAPH_URL: 'http://localhost:' + FPORT, WA_TOKEN: 'TEST_TOKEN', WA_PHONE_NUMBER_ID: 'PN1', WA_BUSINESS_ACCOUNT_ID: 'WABA1', WA_APP_SECRET: 'testsecret', WA_VERIFY_TOKEN: 'verifyme', PUBLIC_URL: URL, COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP };
  const fake = await import(path.join(ROOT, 'test/fake-graph.js')).then(m => m.startFakeGraph({ port: FPORT, appUrl: URL, appSecret: 'testsecret' }));
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 50 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  console.log(slog.trim());
  const b = await chromium.launch();
  const api = async (ctx, method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };

  // ---------- אייפון ----------
  const phone = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const p = await phone.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.png') });
  failShot = shot;

  await step('כניסה באייפון', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
  });
  await step('ייבוא חוזר של אותו גיבוי לא יוצר כפילויות', async () => {
    const r = await phone.request.post(URL + '/api/backup/import', { data: fs.readFileSync(process.env.BACKUP, 'utf8'), headers: { Origin: URL, 'Content-Type': 'application/json' } });
    const j = await r.json(); const added = Object.values(j.cols).reduce((t, c) => t + c.added, 0);
    assert.strictEqual(added, 0, 'נוספו ' + added); assert.strictEqual(j.files.added, 0); assert.ok(j.reconcile.ok, 'הפרשים: ' + JSON.stringify(j.reconcile.diffs));
  });

  let morningId;
  await step('פתיחת חשבון בוקר — הקרן הקיימת = הקרן הסופית של החשבון הקודם', async () => {
    await p.goto(URL + '/#/accounts'); await p.click('#newacc'); await p.fill('#nd', '2026-11-21'); await p.click('[data-nk=morning]');
    await p.waitForSelector('#ed-keren'); morningId = p.url().split('/acc/')[1].split('?')[0];
    assert.strictEqual(await p.inputValue('#ed-keren'), '212816.32');
    await p.click('[data-add=rows]'); const last = (sel) => p.locator(sel).last();
    await last('[data-l=rows][data-k=n]').fill('לקוח בדיקה'); await last('[data-l=rows][data-k=i]').fill('400'); await last('[data-l=rows][data-k=p]').fill('1000');
    await last('[data-l=rows][data-k=p]').press('Tab');
    await p.fill('#ed-courier', '50'); await p.press('#ed-courier', 'Tab');
    await p.click('[data-add=loans]'); await last('[data-l=loans][data-k=n]').fill('הלוואת בדיקה'); await last('[data-l=loans][data-k=a]').fill('2000'); await last('[data-l=loans][data-k=a]').press('Tab');
    await shot('01-iphone-new-morning');
    await p.click('#ed-save'); await p.waitForSelector('tr.final');
    // 212816.32 + 1000 + (400 - 100 רובי) - 50 משלוחים - 2000 הלוואה = 212066.32
    const fin = await p.locator('tr.final td.a').innerText(); assert.ok(fin.replace(/[^\d.]/g, '') === '212066.32', 'סופי: ' + fin);
    assert.ok(await p.locator('.note.ok', { hasText: 'נספרת פעם אחת' }).count());
    await shot('02-iphone-morning-report');
  });
  await step('שמירה חוזרת עם אותו מזהה פעולה לא יוצרת חשבון נוסף', async () => {
    const op = 'test-op-' + Date.now();
    const a = await api(phone, 'POST', '/api/accounts', { kind: 'work', date: '2026-11-21', opId: op });
    const c = await api(phone, 'POST', '/api/accounts', { kind: 'work', date: '2026-11-21', opId: op });
    assert.strictEqual(a.json.id, c.json.id);
    // רשימת איסוף לבדיקה עם מספרי בדיקה בלבד (שרת וואטסאפ מדומה)
    const d = await api(phone, 'GET', '/api/accounts/' + a.json.id);
    d.json.entries = [
      { n: 'בדיקה אחת', p: '050-0000010', a: 1000, c: 'בן', t: '18:30', s: '' },
      { n: 'בדיקה אחת', p: '050-0000010', a: 500, c: 'בן', t: '19:00', s: '' },
      { n: 'בדיקה שתיים', p: '050-0000011', a: 700, c: 'בן', t: '17:45', s: '' },
      { n: 'בדיקה נכשלת', p: '050-0000099', a: 300, c: 'בן', t: '20:00', s: '' },
      { n: 'בדיקה בלי טלפון', p: '', a: 200, c: 'בן', t: '18:00', s: '' },
      { n: 'בדיקה טלפון שגוי', p: '12345', a: 150, c: 'בן', t: '18:10', s: '' },
      { n: 'בדיקה משותף א', p: '050-0000022', a: 100, c: 'בן', t: '18:20', s: '' },
      { n: 'בדיקה משותף ב', p: '050-0000022', a: 100, c: 'בן', t: '18:25', s: '' },
      { n: 'לקוח של טל', p: '050-0000033', a: 900, c: 'טל', t: '18:00', s: '' },
    ];
    d.json.expenses = [{ n: 'דלק', a: 120, c: 'בן' }];
    const data = { ...d.json }; ['_version', '_updatedAt', '_updatedBy', 'id', 'prev'].forEach(k => delete data[k]);
    const s = await api(phone, 'PUT', '/api/accounts/' + a.json.id, { data, baseVersion: d.json._version, opId: 'put-' + op });
    assert.strictEqual(s.status, 200, JSON.stringify(s.json)); global.workId = a.json.id;
    const stale = await api(phone, 'PUT', '/api/accounts/' + a.json.id, { data, baseVersion: d.json._version, opId: 'put2-' + op });
    assert.strictEqual(stale.status, 409, 'עדכון מגרסה ישנה צריך להיחסם');
  });

  let batchUrl;
  await step('חיפוש גובה ״בן״, בחירת כל תוצאות הסינון, תצוגה מקדימה ושליחה', async () => {
    await p.goto(URL + '/#/acc/' + global.workId); await p.waitForSelector('#fq');
    await p.fill('#fq', 'בן'); await p.waitForTimeout(500);
    assert.strictEqual(await p.locator('.li[data-row]').count(), 8, 'צריך לראות 8 שורות של בן');
    await p.check('#selall');
    await p.waitForFunction(() => /ל־\d+ לקוחות/.test(document.querySelector('#sendwa')?.innerText || '') && !document.querySelector('#sendwa').disabled, null, { timeout: 5000 });
    const label = await p.locator('#sendwa').innerText();
    assert.ok(/ל־3 לקוחות/.test(label), 'כפתור: ' + label); // 8 שורות: 2 של אותו לקוח מאוחדות, בלי טלפון/טלפון שגוי מדולגים, מספר משותף נעצר
    await shot('03-iphone-select-filter');
    await p.click('#sendwa'); await p.waitForSelector('#wt');
    await p.selectOption('#wt', 'collection_reminder|he'); await p.waitForTimeout(600);
    assert.ok(await p.locator('.note.warn', { hasText: 'דולגו' }).count(), 'צריך רשימת מספרים לתיקון');
    assert.ok(await p.locator('.note.err', { hasText: 'אותו מספר' }).count(), 'מספר משותף צריך להיעצר');
    assert.ok(await p.locator('.pill', { hasText: '2 שורות אוחדו' }).count(), 'איחוד שורות של אותו לקוח');
    await p.locator('details summary', { hasText: 'הצג את ההודעה' }).first().click();
    const prev = await p.locator('.preview').first().innerText(); assert.ok(/בדיקה/.test(prev) && /₪/.test(prev), 'תצוגה: ' + prev);
    await shot('04-iphone-preview');
    // הסכמה מתועדת
    await p.fill('#wsrc', 'מספרי בדיקה — אושר בבדיקת המערכת'); await p.click('#woptin'); await p.waitForTimeout(700);
    const btn = await p.locator('#wgo').innerText(); assert.ok(/ל־3 לקוחות/.test(btn), 'אחרי הסכמה: ' + btn);
    // לחיצה כפולה
    await p.locator('#wgo').dblclick();
    await p.waitForURL(/#\/batch\//, { timeout: 8000 }); batchUrl = p.url();
  });
  await step('לחיצה כפולה יצרה משלוח אחד בלבד', async () => {
    const r = await api(phone, 'GET', '/api/wa/batches'); assert.strictEqual(r.json.length, 1, 'משלוחים: ' + r.json.length);
    assert.strictEqual(r.json[0].total, 3);
  });
  await step('סטטוסים לפי דיווח השירות: נשלחו, נמסרו, נכשלו', async () => {
    await p.waitForTimeout(2500); await p.reload(); await p.waitForSelector('.kpis');
    const b = (await api(phone, 'GET', '/api/wa/batches/' + batchUrl.split('/batch/')[1])).json;
    const st = Object.fromEntries(b.messages.map(m => [m.client_name, m.status]));
    assert.strictEqual(st['בדיקה נכשלת'], 'failed'); assert.ok(['delivered', 'read'].includes(st['בדיקה אחת'])); assert.ok(['delivered', 'read'].includes(st['בדיקה שתיים']));
    const msg = fake.sent.find(s => s.to === '972500000010'); assert.deepStrictEqual(msg.params.slice(0, 2), ['בדיקה אחת', '1,500 ₪']);
    assert.strictEqual(msg.params[3], '18:30', 'השעה המוקדמת של הלקוח');
    await shot('05-iphone-batch-status');
  });
  await step('ניסיון חוזר רק להודעות שנכשלו', async () => {
    const before = fake.sent.length;
    await p.click('#retry'); await p.waitForTimeout(2000);
    assert.strictEqual(fake.sent.length - before, 1, 'נשלחו מחדש: ' + (fake.sent.length - before));
  });
  await step('הודעת ״הסר״ מסירה את הלקוח מהשליחה', async () => {
    const crypto = require('crypto');
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '972500000011', id: 'in1', type: 'text', text: { body: 'הסר' } }] } }] }] });
    const r = await fetch(URL + '/webhooks/whatsapp', { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + crypto.createHmac('sha256', 'testsecret').update(body).digest('hex') } });
    assert.strictEqual(r.status, 200);
    const bad = await fetch(URL + '/webhooks/whatsapp', { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=00' } }); assert.strictEqual(bad.status, 401, 'Webhook בלי חתימה תקינה נדחה');
    const c = (await api(phone, 'GET', '/api/wa/consent')).json; assert.ok(c.find(x => x.phone === '972500000011' && x.status === 'opt_out'));
  });
  await step('שליחת הודעה לא משנה יתרה', async () => {
    const t = (await api(phone, 'GET', '/api/today?date=2026-11-21')).json; assert.strictEqual(t.got, 0);
  });

  // ---------- מחשב ----------
  const desk = await b.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const d = await desk.newPage(); d.on('pageerror', e => errs.push('desk: ' + e.message));
  await step('כניסה במחשב ועדכון חי: איסוף שסומן בטלפון מופיע במחשב', async () => {
    await d.goto(URL + '/#/login'); await d.fill('input[name=u]', 'owner'); await d.fill('input[name=p]', 'Owner-pass-1'); await d.click('form button'); await d.waitForSelector('.kpis');
    await d.goto(URL + '/#/today?date=2026-11-21'); await d.waitForSelector('.kpis');
    assert.ok((await d.locator('.kpi.good .v').first().innerText()).includes('0'));
    // רישום איסוף בטלפון, כולל שליח שאסף בפועל
    await p.goto(URL + '/#/acc/' + global.workId); await p.waitForSelector('.li[data-row]');
    await p.locator('.li[data-row]', { hasText: 'בדיקה שתיים' }).locator('.t').click(); await p.waitForSelector('#rs');
    await p.selectOption('#rs', 'נאסף'); await p.fill('#rb', 'שליח בן'); await p.click('#rsave'); await p.waitForTimeout(400);
    await d.waitForFunction(() => document.querySelector('.kpi.good .v')?.innerText.includes('700'), null, { timeout: 6000 });
    await d.screenshot({ path: path.join(OUT, '06-desktop-today-live.png') });
  });
  await step('הצגת גובה אחראי מול מי שאסף בפועל, וסדר לפי שעה', async () => {
    await d.goto(URL + '/#/acc/' + global.workId); await d.waitForSelector('.li[data-row]');
    const row = d.locator('.li[data-row]', { hasText: 'בדיקה שתיים' }); assert.ok(/גובה אחראי: בן · אסף בפועל: שליח בן/.test(await row.innerText()));
    const times = await d.locator('.card').filter({ hasText: 'גבייה ברוטו' }).first().locator('.li[data-row] .t .num').allInnerTexts();
    assert.deepStrictEqual(times, [...times].sort(), 'סדר שעות: ' + times.join(','));
  });
  await step('נטו בדוח הגובה: ברוטו, הוצאות ונטו', async () => {
    const card = d.locator('.card', { hasText: 'גבייה ברוטו' }).filter({ has: d.locator('h2', { hasText: /^בן$/ }) });
    const txt = await card.innerText();
    assert.ok(/3,050/.test(txt) && /120/.test(txt) && /2,930/.test(txt), 'בן: ' + txt.slice(0, 300)); // ברוטו 1000+500+700+300+200+150+100+100=3050, הוצאות 120, נטו 2930
  });
  await step('תיקון סימון שגוי מתועד עם מי ומתי', async () => {
    await p.goto(URL + '/#/acc/' + global.workId); await p.waitForSelector('.li[data-row]');
    p.once('dialog', dl => dl.accept('סומן בטעות'));
    await p.locator('.li[data-row]', { hasText: 'בדיקה שתיים' }).locator('button[data-s="נאסף"]').click(); await p.waitForTimeout(600);
    const h = (await api(phone, 'GET', `/api/accounts/${global.workId}/history`)).json;
    assert.ok(h.length >= 2 && h[0].user_name === 'בעל התוכנה' && JSON.parse(h[0].before).s === 'נאסף' && JSON.parse(h[0].after).s === '');
    const a = (await api(phone, 'GET', '/api/audit?limit=20')).json; assert.ok(a.find(x => x.action === 'תיקון סימון איסוף' && x.note === 'סומן בטעות'));
  });
  await step('שמירה שנכשלה בגלל קליטה: הודעה ברורה וניסיון חוזר בלי כפילות', async () => {
    await p.goto(URL + '/#/acc/' + global.workId); await p.waitForSelector('.li[data-row]');
    await phone.setOffline(true);
    await p.locator('.li[data-row]', { hasText: 'בדיקה נכשלת' }).locator('button[data-s="נאסף"]').click();
    // ההודעה מופיעה בתוך השורה עצמה, עם ״נסה שוב״
    const fr = p.locator('.li[data-row]', { hasText: 'בדיקה נכשלת' });
    await fr.locator('.mkerr').waitFor(); assert.ok(/לא נשמר/.test(await fr.locator('.mkerr').innerText()));
    await shot('07-iphone-offline');
    await phone.setOffline(false); await p.waitForTimeout(300);
    // כשהקליטה חוזרת האפליקציה מנסה שוב לבד; אם ההודעה עדיין מוצגת — לוחצים ״נסה שוב״ בשורה
    await p.waitForTimeout(1200); const r = fr.locator('[data-mkretry]'); if (await r.isVisible()) await r.click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(800);
    assert.strictEqual(await fr.locator('.mkerr').count(), 0, 'ההודעה צריכה להיעלם אחרי שמירה');
    assert.ok(await fr.evaluate(el => el.classList.contains('got')), 'השורה מסומנת ״נאסף״');
    const h = (await api(phone, 'GET', `/api/accounts/${global.workId}/history`)).json.filter(x => x.note === 'בדיקה נכשלת');
    assert.strictEqual(h.length, 1, 'נרשם ' + h.length + ' פעמים');
  });
  await step('חיפוש לקוח ושמירת הסינון ומיקום הגלילה בחזרה מכרטיס לקוח', async () => {
    await d.goto(URL + '/#/clients'); await d.fill('#cq', 'אלברט'); await d.waitForTimeout(600);
    await d.locator('#cres a').first().click(); await d.waitForSelector('h2:has-text("היסטוריה")');
    await d.screenshot({ path: path.join(OUT, '08-desktop-client-card.png') });
    await d.goBack(); await d.waitForSelector('#cq'); assert.strictEqual(await d.inputValue('#cq'), 'אלברט');
  });
  await step('הרשאות: גובה רואה רק את האיסופים שלו ולא מידע רגיש', async () => {
    await api(desk, 'POST', '/api/users', { username: 'ben', password: 'Ben-pass-12', role: 'collector', name: 'בן', collector_name: 'בן' });
    const g = await b.newContext({ ...devices['iPhone 13'] }); const gp = await g.newPage();
    await gp.goto(URL + '/#/login'); await gp.fill('input[name=u]', 'ben'); await gp.fill('input[name=p]', 'Ben-pass-12'); await gp.click('form button'); await gp.waitForSelector('.kpis');
    for (const u of ['/api/contracts', '/api/loans', '/api/backup', '/api/wa/status', '/api/files/x', '/api/audit']) assert.strictEqual((await api(g, 'GET', u)).status, 403, u);
    const w = (await api(g, 'GET', '/api/accounts/' + global.workId)).json; assert.ok(w.entries.every(e => e.c === 'בן'), 'רק שורות של בן'); assert.ok(!w.entries.some(e => e.n === 'לקוח של טל'));
    const acc = (await api(g, 'GET', '/api/accounts')).json; assert.ok(!acc.some(a => a.kind === 'morning'), 'גובה לא רואה חשבון בוקר');
    assert.strictEqual((await api(g, 'GET', '/api/accounts/' + morningId)).status, 403);
    await gp.goto(URL + '/#/today?date=2026-11-21'); await gp.waitForSelector('.kpis'); await gp.screenshot({ path: path.join(OUT, '09-iphone-collector-view.png') });
    await g.close();
  });
  await step('דוח התאמה נפתח במחשב', async () => {
    await d.goto(URL + '/#/migration'); await d.waitForSelector('.note'); await d.screenshot({ path: path.join(OUT, '10-desktop-reconcile.png'), fullPage: true });
  });
  await step('אין שגיאות בדפדפן', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill(); fake.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} עברו. צילומי מסך: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
