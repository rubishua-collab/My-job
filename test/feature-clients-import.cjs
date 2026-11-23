// בדיקת ״ייבוא ועדכון לקוחות מקובץ״ בלשונית ״לקוחות״ — דוח ״טבלת לקוחות״ מתוכנת המחשב.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8510, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ci-')), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ci-x-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 500)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  // מאגר קיים: לקוח שנוצר ידנית בלי מס׳ לקוח
  await api('POST', '/api/docs/clients', { id: 'c-moshe', data: { name: 'משה כהן', phone: '0541234567', created: new Date().toISOString() }, opId: 'cm' });
  const makeXlsx = async (name, aoa) => {
    const b64 = await p.evaluate(async (aoa) => {
      if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map(() => ({ wch: 4 })); // עמודות צרות — הערך המלא חייב להיקרא בכל זאת
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'טבלת לקוחות'); return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    }, aoa);
    const f = path.join(TMP, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };
  const H = ["מס' לקוח", 'שם הלקוח', 'ת.ז', 'טלפון', 'טלפון נייד', 'כתובת', 'עיר', 'מייל', 'פקס', 'הערה', 'קבוצה'];
  const V1 = [['טבלת לקוחות'], H,
    [1001, 'אבי לוי', 12345678, '03-1234567', '0501234567', 'הרצל 1', 'תל אביב', 'avi@x.co', '', 'לקוח ותיק', 'א'],
    [1002, 'בני כהן', '', '', 521234567, '', 'חיפה', '', '', '', 'ב'],
    [1003, 'משה כהן', '', '', '0541234567', '', '', '', '', '', ''],
    [1004, 'דנה פרץ', '', '', '', '', 'אילת', '', '', '', '']];
  const importFile = async (f) => {
    await p.goto(URL + '/#/clients'); await p.waitForSelector('.cimp-bar');
    await p.setInputFiles('.cimp-bar [data-cimp-file]', f); await p.waitForSelector('#ci-go');
  };
  const cnt = async (g) => +(await p.locator(`.ci-g[data-g="${g}"] summary .pill`).innerText());
  const clients = async () => api('GET', '/api/docs/clients');
  const byExt = async (x) => (await clients()).find(c => c.extId === x);

  await step('לפני הקליטה: כפתור ״ייבוא ועדכון לקוחות מקובץ״ מעל החיפוש, ותזכורת חודשית', async () => {
    await p.goto(URL + '/#/clients'); await p.waitForSelector('.cimp-bar');
    const order = await p.evaluate(() => { const a = document.querySelector('.cimp-bar'), s = document.querySelector('.search'); return !!(a.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); }); assert.ok(order, 'הכפתור מעל החיפוש');
    assert.ok((await p.locator('.cimp-bar').innerText()).includes('ייבוא ועדכון לקוחות מקובץ'));
    assert.ok((await p.locator('.cimp-remind').innerText()).includes('הגיע הזמן לעדכן את טבלת הלקוחות'));
    assert.ok(await p.locator('.cimp-remind [data-cimp-file]').count());
    assert.ok((await p.locator('#cimp-last').innerText()).includes('עוד לא נקלט'));
  });
  await step('קליטה ראשונה: 3 חדשים, משה כהן ממתין להכרעה (שם זהה לכרטיס קיים), דנה ״חסר טלפון״; ערכים מלאים ואפסים נשמרים', async () => {
    await importFile(await makeXlsx('לקוחות-11.xlsx', V1));
    assert.strictEqual(await cnt('news'), 3); assert.strictEqual(await cnt('pending'), 1); assert.strictEqual(await cnt('phones'), 1);
    assert.ok((await p.locator('.ci-p').innerText()).includes('שם זהה לכרטיס קיים'));
    assert.ok((await p.locator('.ci-g[data-g="phones"]').innerText()).includes('חסר טלפון'));
    await p.click('.ci-p [data-dec*="|link|"]'); assert.ok((await p.locator('.ci-p').innerText()).includes('יקושר ללקוח הקיים'));
    await p.click('#ci-go'); await p.waitForSelector('.note.ok');
    assert.ok((await p.locator('.note.ok').innerText()).includes('נוספו 3') && (await p.locator('.note.ok').innerText()).includes('קושרו 1'));
    const avi = await byExt('1001'); assert.strictEqual(avi.tz, '012345678'); assert.strictEqual(avi.city, 'תל אביב'); assert.strictEqual(avi.extra['קבוצה'], 'א'); assert.strictEqual(avi.srcNote, 'לקוח ותיק');
    assert.deepStrictEqual(avi.phones.map(x => [x.local, x.type]), [['031234567', 'קווי'], ['0501234567', 'נייד']]);
    assert.strictEqual((await byExt('1002')).phone, '0521234567', 'האפס שאקסל מחק הוחזר');
    const moshe = (await clients()).filter(c => c.name === 'משה כהן'); assert.strictEqual(moshe.length, 1); assert.strictEqual(moshe[0].extId, '1003');
  });
  await step('קליטה שנייה של אותו דוח: נוספו 0, הכול ״ללא שינוי״, אין הכרעות; התזכורת נעלמת והקליטה האחרונה מוצגת', async () => {
    await importFile(await makeXlsx('לקוחות-11.xlsx', V1));
    assert.strictEqual(await cnt('news'), 0); assert.strictEqual(await cnt('pending'), 0); assert.strictEqual(await cnt('changed'), 0); assert.strictEqual(await cnt('same'), 4);
    await p.click('#ci-go'); await p.waitForSelector('.note.ok'); assert.ok((await p.locator('.note.ok').innerText()).includes('נוספו 0'));
    assert.strictEqual((await clients()).length, 4);
    await p.goto(URL + '/#/clients'); await p.waitForSelector('.cimp-bar'); assert.strictEqual(await p.locator('.cimp-remind').count(), 0);
    assert.ok((await p.locator('#cimp-last').innerText()).includes('לקוחות-11.xlsx'));
  });
  await step('״טלפונים לטיפול״: דנה עם ״חסר טלפון״ → ״הוסף מספר״ → נבדק מחדש והסימון מתעדכן מיד', async () => {
    await p.click('#cimp-ph'); await p.waitForSelector('#cimp-issues .li');
    assert.ok((await p.locator('#cimp-issues').innerText()).includes('דנה פרץ')); assert.ok(await p.locator('#cres').isHidden());
    await p.click('#cimp-issues [data-pfix]'); await p.fill('#cimp-issues .ci-fix input', '050-9999999'); await p.click('#cimp-issues .ci-fix button');
    await p.waitForFunction(() => !document.querySelector('#cimp-issues').innerText.includes('דנה פרץ'));
    const d = await byExt('1004'); assert.strictEqual(d.phone, '0509999999'); assert.ok(d.manual.phones);
  });
  const V2 = [['טבלת לקוחות'], H,
    [1001, 'אבי לוי', 12345678, '03-1234567', '050123456789', 'הרצל 1', 'תל אביב', 'avi@x.co', '', 'לקוח ותיק', 'א'],   // מספר ארוך מדי
    [1002, 'בני כהן', '', '', '052-7777777', '', 'חיפה', '', '', '', 'ב'],                                              // החליף מספר
    [1003, 'משה כהן', '', '', '0541234567', '', '', '', '', '', ''],
    [1004, 'דנה פרץ', '', '', '0508888888', '', '', '', '', '', ''],                                                    // שונה ממה שתוקן ידנית; עיר ריקה לא מוחקת
    [1005, 'רון חדש', '', '', '', '', 'נתניה', '', '', '', '']];                                                         // חדש ללא טלפון
  await step('דוח מעודכן: רק רון חדש נוסף; שינוי המספר של בני מוצג (ישן מול חדש); שתי אזהרות טלפון', async () => {
    await importFile(await makeXlsx('לקוחות-12.xlsx', V2));
    assert.strictEqual(await cnt('news'), 1); assert.ok((await p.locator('.ci-g[data-g="news"]').innerText()).includes('רון חדש'));
    const ch = await p.locator('.ci-g[data-g="changed"]').innerText(); assert.ok(/בני כהן[\s\S]*טלפונים:\s*0521234567\s*←\s*0527777777/.test(ch), ch);
    const ph = await p.locator('.ci-g[data-g="phones"]').innerText(); assert.ok(ph.includes('רון חדש') && ph.includes('חסר טלפון') && ph.includes('אבי לוי') && ph.includes('ארוך מדי — 12 ספרות במקום 10'), ph);
    assert.ok(ch.includes('דנה פרץ') && ch.includes('הערך הנוכחי תוקן ידנית'), 'הבדל מול תיקון ידני מוצג לבחירה: ' + ch);
  });
  await step('״המשך בייבוא״ עם האזהרות: רון נוסף פעם אחת, בני עודכן בכרטיס הנכון, דנה שמרה את המספר שתיקנתי והעיר לא נמחקה', async () => {
    await p.click('#ci-go'); await p.waitForSelector('.note.ok'); const t = await p.locator('.note.ok').innerText(); assert.ok(t.includes('נוספו 1'), t);
    const all = await clients(); assert.strictEqual(all.length, 5); assert.strictEqual(all.filter(c => c.name === 'רון חדש').length, 1);
    assert.strictEqual((await byExt('1002')).phone, '0527777777'); assert.strictEqual((await byExt('1002')).name, 'בני כהן');
    const d = await byExt('1004'); assert.strictEqual(d.phone, '0509999999'); assert.strictEqual(d.city, 'אילת');
    const avi = await byExt('1001'); assert.ok(avi.phones.some(x => !x.ok && x.raw === '050123456789'));
    assert.strictEqual((await api('GET', '/api/accounts')).length, 0, 'לא נוצר חוב / גבייה / חשבון');
  });
  await step('״טלפונים לטיפול״ אחרי הקליטה: רון (חסר) ואבי (ארוך מדי) עם הערך המקורי והסיבה; כרטיס הלקוח מציג את הפרטים', async () => {
    await p.goto(URL + '/#/clients?phones=1'); await p.waitForSelector('#cimp-issues .li');
    const t = await p.locator('#cimp-issues').innerText(); assert.ok(t.includes('רון חדש') && t.includes('אבי לוי') && t.includes('050123456789') && t.includes('ארוך מדי'), t);
    await p.goto(URL + '/#/client/' + encodeURIComponent('אבי לוי')); await p.waitForSelector('.card');
    const c = await p.locator('#view').innerText(); assert.ok(c.includes('מס׳ לקוח 1001') && c.includes('012345678') && c.includes('הרצל 1') && c.includes('קבוצה'), c.slice(0, 600));
  });
  await step('CSV: אפסים בתחילת ת.ז וטלפון נשמרים; באייפון מסך הייבוא בלי גלילה הצידה', async () => {
    const csv = path.join(TMP, 'clients.csv');
    fs.writeFileSync(csv, '﻿' + ["מס' לקוח,שם הלקוח,ת.ז,טלפון נייד,עיר", '1006,שרה מזרחי,012345679,0523334444,רמלה', '1001,אבי לוי,,,'].join('\r\n'));
    const m = await b.newContext({ ...require('playwright').devices['iPhone 13'], locale: 'he-IL' }); const q = await m.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.goto(URL + '/#/login'); await q.fill('input[name=u]', 'owner'); await q.fill('input[name=p]', 'Owner-pass-1'); await q.click('form button'); await q.waitForSelector('.kpis');
    await q.goto(URL + '/#/clients'); await q.waitForSelector('.cimp-bar'); await q.setInputFiles('.cimp-bar [data-cimp-file]', csv); await q.waitForSelector('#ci-go');
    assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await q.screenshot({ path: path.join(os.tmpdir(), 'clients-import-iphone.png') });
    await q.click('#ci-go'); await q.waitForSelector('.note.ok');
    const s = (await clients()).find(c => c.extId === '1006'); assert.strictEqual(s.tz, '012345679'); assert.strictEqual(s.phone, '0523334444');
    assert.strictEqual((await byExt('1001')).city, 'תל אביב', 'תא ריק לא מחק'); await m.close();
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
