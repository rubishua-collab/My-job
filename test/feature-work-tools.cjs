// בדיקת יכולת work-tools: טקסט/PDF לכל גובה, הוצאה מהירה, עמלת שליח מקושרת, העברה לחשבון גובים,
// כלי עורך (מילוי טלפונים, כפילויות, טקסט, צילום), מאגר לקוחות והקמת לקוח מתוך פיצול.
// הרצה: BACKUP=path/to/backup.json node test/feature-work-tools.cjs   (פורט 8303)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-work-tools');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-wt-'));
const PORT = +process.env.WT_PORT || 8303, URL = 'http://localhost:' + PORT;
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let onFail = null;
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false, err: e.message }); console.log('✗', name, '\n   ', e.message.split('\n').slice(0, 3).join('\n    ')); if (onFail) await onFail(results.length).catch(() => {}); } };
const clean = (d) => { const x = { ...d }; ['_version', '_updatedAt', '_updatedBy', 'id', 'prev'].forEach(k => delete x[k]); return x; };

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP || '' };
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 50 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const desk = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const d = await desk.newPage(); const errs = []; d.on('pageerror', e => errs.push(e.message)); d.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  d.on('dialog', dl => dl.accept());
  const api = async (method, url, body, ctx = desk) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const acc = async (id) => (await api('GET', '/api/accounts/' + id)).json;
  const put = async (id, mut) => { const a = await acc(id); mut(a); const r = await api('PUT', '/api/accounts/' + id, { data: clean(a), baseVersion: a._version, opId: 'p' + Math.random() }); assert.strictEqual(r.status, 200, JSON.stringify(r.json)); };
  const shot = (n) => d.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  d.setDefaultTimeout(10000);
  onFail = async (i) => { await shot('fail-' + i); console.log('    sheet:', (await d.locator('#sheet').innerText().catch(() => '')).slice(0, 300).replace(/\n/g, ' | '), '| toast:', await d.locator('#toast').innerText().catch(() => '')); await d.evaluate(() => { const s = document.querySelector('#sheet'); s.hidden = true; s.innerHTML = ''; document.documentElement.style.overflow = ''; }); };

  await d.goto(URL + '/#/login'); await d.fill('input[name=u]', 'owner'); await d.fill('input[name=p]', 'Owner-pass-1'); await d.click('form button'); await d.waitForSelector('.kpis');

  // נתוני לוי: פיצול עם לקוח עם טלפון, ורשימת איסוף עם שני גובים והוצאה
  const sp = (await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-21', opId: 'wt-sp' })).json.id;
  await put(sp, a => { a.records = [{ n: 'פלוני בדיקתי', fn: 'פלוני', ln: 'בדיקתי', ph: '050-0000077', a: 900, c: 'טל', h: 'קשה', side: false, cnt: 1 }, { n: 'שורה בלי כרטיס', ph: '', a: 400, c: 'בן', side: false, cnt: 1 }]; });
  const wid = (await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-21', opId: 'wt-w' })).json.id;
  await put(wid, a => {
    a.entries = [
      { n: 'אלף לוי', p: '050-0000101', a: 1000, c: 'בן', t: '18:30', s: '' },
      { n: 'בית לוי', p: '050-0000102', a: 500, c: 'בן', t: '17:00', s: 'נאסף', ga: 450 },
      { n: 'גימל לוי', p: '', a: 300, c: 'טל', t: '', s: 'לעבור' },
    ];
    a.expenses = [{ n: 'דלק', a: 120, c: 'בן' }];
  });

  await step('לוח ״PDF או העתקה לכל גובה״: הטקסט של גובה אחד זהה לנוסח המקורי', async () => {
    await d.goto(URL + '/#/acc/' + wid); await d.waitForSelector('#wt-per-panel');
    assert.strictEqual(await d.locator('#wt-per-panel [data-wper]').count(), 2);
    await d.click('#wt-per-panel [data-wcp="בן"]'); await d.waitForTimeout(200);
    const t = await d.evaluate(() => navigator.clipboard.readText());
    const lines = t.split('\n');
    assert.ok(/^איסוף יומי – .+ 21\.11\.2026$/.test(lines[0]), lines[0]);
    assert.strictEqual(lines[1], 'בן (2)');
    assert.strictEqual(lines[2], '1. אלף לוי – 1,000 ₪ – 18:30 – 050-0000101');
    assert.strictEqual(lines[3], '2. בית לוי – 500 ₪ – נאסף 450 ₪ (חלקי) – 050-0000102');
    assert.ok(t.includes('סה״כ בן: 1,500 ₪') && t.includes('נאסף: 450 ₪ (1)') && t.includes('נותר לאסוף: 1,050 ₪ (1)'), t);
    assert.ok(t.includes('הוצאות בן:\n• דלק – 120 ₪\nסה״כ הוצאות: 120 ₪\nנטו בן: 1,380 ₪'), t);
    assert.ok(!t.includes('גימל'), 'רק הבלוק של בן');
    const href = await d.locator('#wt-per-panel a.btn.wa').first().getAttribute('href');
    assert.ok(decodeURIComponent(href.split('text=')[1]).startsWith('איסוף יומי'), href);
    await shot('wt-01-per-collector');
  });
  await step('PDF לגובה אחד נוצר ונשמר (html2canvas + jsPDF מקומיים)', async () => {
    const [dl] = await Promise.all([d.waitForEvent('download', { timeout: 20000 }), d.click('#wt-per-panel [data-wper="טל"]')]);
    // Chromium בלי ממשק לא שומר שם קובץ בעברית (מחזיר download), ולכן בודקים את השם בהודעה שליד הכפתור
    await d.waitForSelector('#wt-share .note.ok'); assert.ok((await d.locator('#wt-share .note.ok').innerText()).includes('איסוף-יומי-טל-21.11.2026.pdf'));
    const f = path.join(OUT, 'wt.pdf'); await dl.saveAs(f); const buf = fs.readFileSync(f); assert.ok(buf.slice(0, 4).toString() === '%PDF' && buf.length > 5000, 'גודל ' + buf.length);
    await d.waitForSelector('#wt-share a.btn.wa');
  });
  await step('הוצאה מהירה לגובה: נשמרת ומורידה מהנטו שלו', async () => {
    await d.click('button:has-text("הוצאות של גובה")'); await d.waitForSelector('#w-x-new');
    await d.click('#w-x-new'); await d.waitForSelector('#xf-save');
    await d.click('#xf-save'); assert.ok(/בחר גובה/.test(await d.locator('#xf-err').innerText()));
    await d.fill('#xf-c', 'טל'); await d.fill('#xf-n', 'חניה'); await d.fill('#xf-a', '30'); await d.click('#xf-save');
    await d.waitForFunction(() => document.querySelector('#sheet').hidden);
    await d.waitForFunction(() => [...document.querySelectorAll('.card')].some(c => /חניה/.test(c.innerText)));
    const a = await acc(wid); assert.ok(a.expenses.some(x => x.n === 'חניה' && x.a === 30 && x.c === 'טל'));
    const card = d.locator('.card').filter({ has: d.locator('h2', { hasText: /^טל$/ }) });
    assert.ok(/270/.test(await card.innerText()), 'נטו טל 300-30');
  });
  await step('עמלת שליח מקושרת לאיסוף (lk): נוצרת, מתעדכנת ומוסרת', async () => {
    const key = (await acc(wid)).entries.find(e => e.n === 'אלף לוי')._k;
    await d.click('button:has-text("עמלת שליח")'); await d.waitForSelector('#fe-e');
    await d.selectOption('#fe-e', key); await d.fill('#fe-a', '50'); await d.click('#fe-save'); await d.waitForTimeout(700);
    let a = await acc(wid); const e = a.entries.find(x => x._k === key); const x = a.expenses.find(v => v.lk && v.lk === e.lk);
    assert.ok(e.lk && x && x.a === 50 && x.n === 'עמלת שליח' && x.c === 'בן' && !x.nf, JSON.stringify(a.expenses));
    await d.click('button:has-text("עמלת שליח")'); await d.selectOption('#fe-e', key);
    assert.strictEqual(await d.inputValue('#fe-a'), '50');
    await d.fill('#fe-a', '60'); await d.uncheck('#fe-f'); await d.click('#fe-save'); await d.waitForTimeout(700);
    a = await acc(wid); assert.ok(a.expenses.filter(v => v.lk === e.lk).length === 1 && a.expenses.find(v => v.lk === e.lk).a === 60 && a.expenses.find(v => v.lk === e.lk).nf === 1);
    await d.click('button:has-text("עמלת שליח")'); await d.selectOption('#fe-e', key); await d.fill('#fe-a', '0'); await d.click('#fe-save'); await d.waitForTimeout(700);
    a = await acc(wid); assert.ok(!a.expenses.some(v => v.lk) && !a.entries.find(x => x._k === key).lk);
  });
  await step('סיום יום: העברה לחשבון גובים (חובות לפי נגבה, הוצאות)', async () => {
    await d.goto(URL + '/#/acc/' + wid); await d.waitForSelector('#wt-per-panel');
    await d.click('button:has-text("העבר לחשבון גובים")'); await d.waitForSelector('#w-toc');
    assert.ok(/3 חובות · 1,750 ₪ · 2 הוצאות/.test(await d.locator('#w-toc-n').innerText()), await d.locator('#w-toc-n').innerText());
    await d.check('#w-toc-got'); assert.ok(/1 חובות · 450 ₪/.test(await d.locator('#w-toc-n').innerText()));
    await d.uncheck('#w-toc-got');
    await d.click('#w-toc'); await d.waitForURL(/#\/acc\/.+\?edit=1/);
    const cid = d.url().split('/acc/')[1].split('?')[0]; const c = await acc(cid);
    assert.strictEqual(c.kind, 'collectors');
    const part = c.entries.find(e => e.n === 'בית לוי'); assert.ok(part.k === 'd' && part.a === 450 && part.due === 500 && part.t === '17:00', JSON.stringify(part));
    assert.strictEqual(c.entries.filter(e => e.k === 'e').length, 2);
  });
  await step('עורך: הוספה מטקסט, מילוי טלפון/גובה/קשה מהפיצול, ניקוי כפילויות', async () => {
    await d.goto(URL + '/#/acc/' + wid + '?edit=1'); await d.waitForSelector('[data-eact]');
    const n0 = await d.locator('[data-l=entries][data-k=n]').count();
    await d.click('[data-eact]:has-text("הוספה מטקסט")'); await d.fill('#w-text', 'פלוני בדיקתי – 700 ₪ – 10:30\nאלף לוי – 1,000 – 18:30\nסה״כ 1700');
    await d.click('#w-parse'); await d.waitForTimeout(300);
    assert.strictEqual(await d.locator('[data-l=entries][data-k=n]').count(), n0 + 2);
    const ph = await d.locator('[data-l=entries][data-k=p]').nth(n0).inputValue(); assert.strictEqual(ph, '050-0000077', 'טלפון מהפיצול');
    assert.strictEqual(await d.locator('[data-l=entries][data-k=c]').nth(n0).inputValue(), 'טל');
    await d.click('[data-eact]:has-text("בדיקת כפילויות")'); await d.waitForSelector('#w-dedupe');
    assert.ok(/אלף לוי/.test(await d.locator('#wf').innerText()));
    await d.click('#w-dedupe'); await d.waitForTimeout(200); await d.click('#sheet [data-close]');
    assert.strictEqual(await d.locator('[data-l=entries][data-k=n]').count(), n0 + 1);
    await d.click('#ed-save'); await d.waitForURL(u => !String(u).includes('edit=1'));
    const a = await acc(wid); const e = a.entries.find(x => x.n === 'פלוני בדיקתי'); assert.ok(e && e.h === 'קשה' && e.t === '10:30' && e.a === 700, JSON.stringify(e));
  });
  await step('קריאת צילום בלי חיבור ל-Claude: הודעה ברורה', async () => {
    await d.goto(URL + '/#/acc/' + wid + '?edit=1'); await d.waitForSelector('[data-eact]');
    await d.click('[data-eact]:has-text("קריאת צילום")');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await d.setInputFiles('#w-img', { name: 'a.png', mimeType: 'image/png', buffer: png });
    await d.waitForSelector('#w-img-st .note.err, #w-img-st div', { timeout: 10000 }); await d.waitForTimeout(800);
    const t = await d.locator('#w-img-st').innerText(); assert.ok(/Claude|נקרא/.test(t), t);
    await d.click('#sheet [data-close]');
  });
  let newClientId;
  await step('מאגר לקוחות: רשימה, אזהרת טלפון כפול, אישור ״לקוח אחר״ ושמירה', async () => {
    await d.goto(URL + '/#/more'); await d.click('a:has-text("מאגר לקוחות")'); await d.waitForSelector('#dbres .li');
    const n0 = await d.locator('#dbres .li').count(); assert.ok(n0 >= 4, 'כרטיסים: ' + n0);
    await d.click('#dbnew'); await d.fill('#nc-name', 'לקוח לוי חדש'); await d.fill('#nc-ph', '054-4330387'); await d.waitForTimeout(400);
    assert.ok(/כבר יש לקוח עם מספר הטלפון הזה/.test(await d.locator('#nc-dups').innerText()));
    await d.click('#nc-save'); assert.ok(/סמן ״זה לקוח אחר״/.test(await d.locator('#nc-msg').innerText()));
    await d.fill('#nc-ph', '12'); await d.waitForTimeout(300); assert.ok(/לא תקין/.test(await d.locator('#nc-ph-msg').innerText()));
    await d.fill('#nc-ph', '054-4330387'); await d.waitForTimeout(300); await d.check('#nc-ack'); await d.fill('#nc-coll', 'טל'); await d.selectOption('#nc-hard', 'לא קשה');
    await shot('wt-02-new-client');
    await d.click('#nc-save'); await d.waitForTimeout(800);
    const L = (await api('GET', '/api/docs/clients')).json; const c = L.find(x => x.name === 'לקוח לוי חדש');
    assert.ok(c && c.phone === '054-4330387' && c.coll === 'טל' && c.hard === 'לא קשה' && c.created && /^C/.test(c.id), JSON.stringify(c)); newClientId = c.id;
    assert.strictEqual(await d.locator('#dbres .li').count(), n0 + 1);
  });
  await step('מאגר לקוחות: עריכת כרטיס (בלי התרעה על עצמו)', async () => {
    await d.goto(URL + '/#/clients-db/' + newClientId); await d.waitForSelector('#nc-note');
    assert.ok(!(await d.locator('#nc-dups').innerText()).includes('בשם הזה'), 'לא מתריע על עצמו');
    await d.fill('#nc-note', 'הערת לוי'); await d.click('#nc-save'); await d.waitForTimeout(700);
    const c = (await api('GET', '/api/docs/clients/' + newClientId)).json; assert.strictEqual(c.note, 'הערת לוי'); assert.strictEqual(c._version, 2);
  });
  await step('פיצול: הקמת לקוח לשורה קיימת ולשם חדש, ובחירת לקוח קיים', async () => {
    await d.goto(URL + '/#/acc/' + sp); await d.click('button:has-text("הקמת לקוח חדש")'); await d.waitForSelector('#ncq');
    await d.fill('#ncq', 'שורה בלי'); await d.waitForSelector('[data-nc-row]'); await d.click('[data-nc-row]');
    await d.waitForSelector('#nc-name'); assert.strictEqual(await d.inputValue('#nc-name'), 'שורה בלי כרטיס');
    await d.fill('#nc-ph', '050-0000088'); await d.click('#nc-save'); await d.waitForTimeout(1200);
    let a = await acc(sp); assert.strictEqual(a.records.length, 2); assert.strictEqual(a.records.find(r => r.n === 'שורה בלי כרטיס').ph, '050-0000088');
    await d.click('button:has-text("הקמת לקוח חדש")'); await d.fill('#ncq', 'לקוח חדש לגמרי'); await d.waitForSelector('[data-nc-q]'); await d.click('[data-nc-q]');
    assert.strictEqual(await d.inputValue('#nc-name'), 'לקוח חדש לגמרי'); await d.dblclick('#nc-save'); await d.waitForTimeout(1200);
    a = await acc(sp); assert.strictEqual(a.records.length, 3); const r = a.records.find(x => x.n === 'לקוח חדש לגמרי'); assert.ok(r && r.a === 0 && r.fn === 'לקוח' && r.cnt === 1, JSON.stringify(r));
    const L = (await api('GET', '/api/docs/clients')).json; assert.strictEqual(L.filter(x => x.name === 'לקוח חדש לגמרי').length, 1, 'לחיצה כפולה לא יוצרת כפילות');
    await d.click('button:has-text("הקמת לקוח חדש")'); await d.fill('#ncq', 'שימי'); await d.waitForSelector('[data-nc-add]'); await d.click('[data-nc-add]'); await d.waitForTimeout(1200);
    a = await acc(sp); assert.ok(a.records.some(x => x.n === 'שימי דוידוב' && x.ph === '054-4330387'));
  });
  await step('הרשאות: גובה לא מקבל את ספר הטלפונים', async () => {
    await api('POST', '/api/users', { username: 'tal', password: 'Tal-pass-123', role: 'collector', name: 'טל', collector_name: 'טל' });
    const g = await b.newContext({ ...devices['iPhone 13'] }); const gp = await g.newPage();
    await gp.goto(URL + '/#/login'); await gp.fill('input[name=u]', 'tal'); await gp.fill('input[name=p]', 'Tal-pass-123'); await gp.click('form button'); await gp.waitForSelector('.kpis');
    assert.strictEqual((await api('GET', '/api/work-tools/book', null, g)).status, 403);
    await gp.goto(URL + '/#/acc/' + wid); await gp.waitForSelector('.kpis'); assert.strictEqual(await gp.locator('#wt-per-panel').count(), 0);
    assert.strictEqual(await gp.locator('button:has-text("עמלת שליח")').count(), 0);
    await g.close();
  });
  await step('אייפון: הלוח נפתח בלי גלילה אופקית', async () => {
    const ph = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); const pp = await ph.newPage(); pp.on('pageerror', e => errs.push('iphone: ' + e.message));
    await pp.goto(URL + '/#/login'); await pp.fill('input[name=u]', 'owner'); await pp.fill('input[name=p]', 'Owner-pass-1'); await pp.click('form button'); await pp.waitForSelector('.kpis');
    await pp.goto(URL + '/#/acc/' + wid); await pp.waitForSelector('#wt-per-panel');
    const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 1, 'גלילה אופקית ' + over);
    await pp.screenshot({ path: path.join(OUT, 'wt-03-iphone.png'), fullPage: true }); await ph.close();
  });
  await step('אין שגיאות בדפדפן', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} עברו. צילומי מסך: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
