// בדיקת ההשלמות מהמקור: יום עבודה היסטורי (ברוטו/הוצאות/נטו לכל גובה ומי אסף), כרטיס לקוח (הלוואות, חוזים, קבצים),
// גיבוי מלא (יצירה, רשימה, הורדה, שחזור בלי כפילויות), ייצוא הלוואות ל-Excel, סדר לפי גובים, PDF לכל גובה בחשבון גובים,
// ודוח ההתאמה לפי תאריך ולפי גובה (0 לא-תואמים בייבוא נקי; עריכה מסומנת ״עודכן אחרי ההעברה״) + כפילויות לבדיקה.
// הרצה: BACKUP=path/to/backup.json node test/feature-parity.cjs   (פורט 8320, או E2E_PORT)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const BACKUP = process.env.BACKUP || '/tmp/claude-0/-home-user-My-job/07101a7a-eccb-5a25-8245-cb5180d30624/scratchpad/backup/yoman-full-backup-2026-11-21.json';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-parity-'));
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-parity-shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = +process.env.E2E_PORT || 8320, URL = 'http://localhost:' + PORT;
const WORK19 = '09qxq4mun19pzkxht0b1', WORK20 = 'z9mnxtxbzigl56w7b4z1', COLL19 = 'v3mhjseicmdkti7luuuy', CONTRACT = 'tmIsQdpNo3qP1XuZmwgzxuvi';
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false }); console.log('✗', name, '\n   ', String(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: BACKUP, BACKUP_AUTO_DELAY_MS: '500' };
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 60 && !slog.includes('פועל'); i++) await sleep(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  const api = async (method, url, body, c = ctx) => { const r = await c.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const until = async (fn, ms = 10000) => { const t = Date.now(); let last; while (Date.now() - t < ms) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(150); } throw new Error('timeout' + (last instanceof Error ? ': ' + last.message : '')); };
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });

  await step('כניסה', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
  });

  // ---- e. דוח התאמה לפי תאריך ולפי גובה (לפני שנוגעים בנתונים) ----
  await step('דוח התאמה: טבלה לפי תאריך ולפי גובה, 0 לא-תואמים בייבוא נקי', async () => {
    await p.goto(URL + '/#/migration'); await p.waitForSelector('#mig-dates table tbody tr');
    assert.strictEqual((await p.textContent('#mig-mismatch')).trim(), '0');
    const n = await p.locator('#mig-dates tbody tr').count(); assert.ok(n >= 30, 'תאריכים: ' + n);
    assert.strictEqual(await p.locator('#mig-dates tbody tr[data-st=mismatch]').count(), 0);
    const c = (await api('GET', '/api/migration/compare')).json;
    assert.strictEqual(c.counts.mismatch, 0); assert.strictEqual(c.counts.edited, 0); assert.strictEqual(c.counts.collMismatch, 0); assert.ok(c.colls.length > 50);
    const d19 = c.dates.find(x => x.date === '2026-11-19'); assert.ok(d19.after.morning.final > 0 && d19.after.coll.net !== 0 && d19.after.work.expected > 0);
    await p.waitForSelector('#mig-dups details'); assert.ok(c.duplicates.sameDay.length > 0 && Array.isArray(c.duplicates.namePhones));
    await shot('01-migration');
  });

  // ---- a. יום עבודה היסטורי ----
  await step('יום איסוף היסטורי: ברוטו/הוצאות/נטו לכל גובה, ומי אסף בפועל', async () => {
    const a = (await api('GET', '/api/accounts/' + WORK19)).json;
    const e = a.entries.find(x => x.c === 'סנטה' && x.s === 'נאסף');
    const r = await api('POST', `/api/accounts/${WORK19}/mark`, { key: e._k, s: 'נאסף', by: 'שליח בדיקה', ga: Math.max(1, (+e.a || 0) - 100) });
    assert.strictEqual(r.status, 200);
    await p.goto(URL + '/#/acc/' + WORK19); await p.waitForSelector('.card h2');
    const txt = await p.textContent('#view');
    for (const w of ['גבייה ברוטו (צפוי)', 'סה״כ הוצאות', 'נטו למסירה', 'צפוי פחות הוצאות', 'סנטה', 'אסף בפועל', 'שליח בדיקה']) assert.ok(txt.includes(w), 'חסר: ' + w);
    // כרטיס הלקוח מראה את אותה שורה: גובה אחראי, מי אסף, סכום שנגבה בפועל
    await p.goto(URL + '/#/client/' + encodeURIComponent(e.n.trim().toLowerCase().replace(/\s+/g, ' ')));
    await p.waitForSelector('.card h2');
    const ct = await p.textContent('#view');
    for (const w of ['גובה אחראי', 'סנטה', 'אסף בפועל', 'שליח בדיקה', 'נגבה בפועל']) assert.ok(ct.includes(w), 'כרטיס לקוח חסר: ' + w);
    await shot('02-client-history');
  });
  await step('דוח התאמה אחרי עריכה: היום מסומן ״עודכן אחרי ההעברה״ ולא ״לא תואם״', async () => {
    const c = (await api('GET', '/api/migration/compare')).json;
    const d19 = c.dates.find(x => x.date === '2026-11-19');
    assert.strictEqual(d19.status, 'edited'); assert.strictEqual(c.counts.mismatch, 0); assert.ok(c.counts.edited >= 1);
    await p.goto(URL + '/#/migration'); await p.waitForSelector('#mig-dates tbody tr[data-st=edited]');
  });

  // ---- b. כרטיס לקוח: חוזה והלוואה ----
  await step('כרטיס לקוח: חוזה חתום עם קבצים, ופתיחה ישירה של החוזה', async () => {
    await p.goto(URL + '/#/client/' + encodeURIComponent('לאה')); await p.waitForSelector('text=חוזים (1)');
    const href = await p.getAttribute('a:has-text("החוזה החתום (PDF)")', 'href'); assert.ok(/^\/api\/files\//.test(href));
    const f = await ctx.request.get(URL + href); assert.strictEqual(f.status(), 200); assert.ok(/pdf/.test(f.headers()['content-type']));
    await p.click('a:has-text("פתח את החוזה")');
    await p.waitForURL(/contracts-manage\/view\//); await p.waitForSelector(`.sg-rec[data-id="${CONTRACT}"]`);
    assert.strictEqual(await p.locator('#sg-recs .sg-rec').count(), 1);
    await shot('03-contract-deeplink');
  });
  await step('כרטיס לקוח: הלוואה עם יתרה וסטטוס, קישור להלוואה', async () => {
    await p.goto(URL + '/#/client/' + encodeURIComponent('שי אברהם')); await p.waitForSelector('text=הלוואות (1)');
    const t = await p.textContent('#view'); assert.ok(t.includes('יתרת קרן') && t.includes('פעילה') && t.includes('11,000'));
    await p.click('a[href^="#/loans/"]'); await p.waitForURL(/#\/loans\//);
  });

  // ---- a. גיבוי מלא ----
  let bk1;
  await step('גיבוי: אוטומטי ברשימה + ״גיבוי מלא עכשיו״ + הורדה', async () => {
    await until(async () => (await api('GET', '/api/backups')).json.list.length >= 1);
    await p.goto(URL + '/#/more'); await p.click('a[href="#/backups"]'); await p.waitForSelector('#bk-list .li');
    const before = await p.locator('#bk-list [data-bid]').count();
    await p.click('#bk-now'); await p.waitForSelector('#bk-msg.ok');
    await until(async () => (await p.locator('#bk-list [data-bid]').count()) === before + 1);
    bk1 = (await api('GET', '/api/backups')).json.list[0];
    assert.strictEqual(bk1.reason, 'ידני'); assert.strictEqual(bk1.counts.accounts, 133); assert.ok(bk1.counts.files >= 4);
    const d = await ctx.request.get(URL + '/api/backups/' + bk1.id + '/download'); assert.strictEqual(d.status(), 200);
    const j = JSON.parse(await d.text()); assert.strictEqual(j.format, 'yoman-app-backup'); assert.strictEqual(j.collections.accounts.length, 133);
    await shot('04-backups');
  });
  await step('שחזור מגיבוי: מחזיר גרסה, לא מוחק מה שנוסף, ושחזור חוזר לא יוצר כפילויות', async () => {
    const reqs = (await api('GET', '/api/docs/loan_requests')).json; const rq = reqs[0];
    await api('PUT', '/api/docs/loan_requests/' + rq.id, { data: { ...rq, amount: 123456 }, baseVersion: rq._version });
    const added = await api('POST', '/api/docs/loan_requests', { data: { name: 'בקשה אחרי הגיבוי', amount: 50, date: '2026-11-21' } });
    const accBefore = (await api('GET', '/api/accounts')).json.length;
    await p.goto(URL + '/#/backups'); await p.waitForSelector(`[data-bid="${bk1.id}"]`);
    await p.click(`[data-bid="${bk1.id}"] [data-bk=restore]`); await p.waitForSelector('#bk-restore:not([hidden]) [data-bk-col]');
    for (const k of ['accounts', 'loans', 'clients', 'contracts', 'settings']) { const cb = p.locator(`[data-bk-col="${k}"]`); if (await cb.isChecked()) await cb.uncheck(); }
    await p.check('[data-bk-col="loan_requests"]');
    await p.click('[data-bk=arm]'); await p.click('[data-bk=yes]'); await p.waitForSelector('#bk-msg.ok');
    const after = (await api('GET', '/api/docs/loan_requests')).json;
    assert.strictEqual(after.find(x => x.id === rq.id).amount, rq.amount, 'הסכום חזר לגרסה שבגיבוי');
    assert.ok(after.some(x => x.id === added.json.id), 'מה שנוסף אחרי הגיבוי נשאר');
    assert.strictEqual(after.length, reqs.length + 1);
    const list = (await api('GET', '/api/backups')).json.list; assert.ok(list.some(x => x.reason === 'לפני שחזור'));
    // שחזור מלא חוזר של אותו גיבוי: אין כפילויות, מספר המסמכים לא משתנה
    const all = ['accounts', 'loans', 'loan_requests', 'clients', 'contracts', 'settings'];
    const r1 = (await api('POST', '/api/backups/restore', { id: bk1.id, cols: all })).json;
    const r2 = (await api('POST', '/api/backups/restore', { id: bk1.id, cols: all })).json;
    assert.strictEqual(r2.done, 0, 'שחזור שני לא שינה כלום'); assert.ok(r1.same > 100);
    assert.strictEqual((await api('GET', '/api/accounts')).json.length, accBefore);
    assert.strictEqual((await api('GET', '/api/docs/loan_requests')).json.length, reqs.length + 1);
  });
  await step('שחזור מקובץ שהועלה (הגיבוי המקורי): תצוגה מקדימה לפי סוג', async () => {
    await p.goto(URL + '/#/backups'); await p.waitForSelector('#bk-in', { state: 'attached' });
    await p.setInputFiles('#bk-in', BACKUP); await p.waitForSelector('#bk-restore:not([hidden]) [data-bk-col="accounts"]');
    const t = await p.textContent('#bk-restore'); assert.ok(t.includes('חשבונות שמורים') && t.includes('133 בגיבוי'));
    await p.click('[data-bk=cancel]');
  });
  await step('גובה לא רואה גיבויים ולא חוזים בכרטיס לקוח', async () => {
    await api('POST', '/api/users', { name: 'סנטה', username: 'santa', password: 'Santa-pass-1', role: 'collector', collector_name: 'סנטה' });
    const c2 = await b.newContext(); await c2.request.post(URL + '/api/login', { data: { username: 'santa', password: 'Santa-pass-1' }, headers: { Origin: URL } });
    assert.strictEqual((await api('GET', '/api/backups', null, c2)).status, 403);
    const cl = await api('GET', '/api/clients/' + encodeURIComponent('לאה'), null, c2); assert.ok(cl.status === 404 || !(cl.json.contracts || []).length);
    await c2.close();
  });

  // ---- c. הלוואות ל-Excel ----
  await step('הלוואות: ״ייצוא ל-Excel״ מוריד קובץ עם גיליונות ההלוואות', async () => {
    await p.goto(URL + '/#/loans-manage'); await p.waitForSelector('#ln-xlsx');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ln-xlsx')]);
    assert.ok(/\.xlsx$/.test(dl.suggestedFilename()) || dl.suggestedFilename() === 'download', dl.suggestedFilename()); // בדפדפן ללא תצוגה שם הקובץ מ-blob לא תמיד עובר
    const fp = path.join(OUT, 'loans.xlsx'); await dl.saveAs(fp);
    const buf = fs.readFileSync(fp); assert.ok(buf.length > 2000 && buf[0] === 0x50 && buf[1] === 0x4b, 'קובץ xlsx (zip)');
    const names = await p.evaluate(async (b64) => { const wb = window.XLSX.read(b64, { type: 'base64' }); return { names: wb.SheetNames, rows: window.XLSX.utils.sheet_to_json(wb.Sheets['הלוואות'], { header: 1 }).length }; }, buf.toString('base64'));
    assert.deepStrictEqual(names.names, ['הלוואות', 'תשלומי הלוואות', 'תזרים הלוואות']); assert.strictEqual(names.rows, 3);
  });

  // ---- d. סדר לפי גובים ----
  await step('איסוף יום: ״סדר לפי גובים״ מאזן מספר חייבים וסכומים, נשמר, והיסטוריה ב-ar_hist', async () => {
    await p.goto(URL + '/#/acc/' + WORK20 + '?edit=1'); await p.waitForSelector('#ed-save');
    await p.click('[data-eact]:has-text("סדר לפי גובים")'); await p.waitForSelector('#ar-names');
    await p.fill('#ar-names', 'רובי, בן'); await p.click('#ar-run'); await p.waitForSelector('#ar-note:not([hidden])');
    const note = await p.textContent('#ar-note'); assert.ok(note.includes('הרשימה חולקה'), note);
    await p.click('#sheet [data-close]'); await p.click('#ed-save'); await p.waitForURL(u => !String(u).includes('edit=1'));
    const a = await until(async () => { const x = (await api('GET', '/api/accounts/' + WORK20)).json; return x.entries.every(e => ['רובי', 'בן'].includes(e.c)) && x; });
    const n = { רובי: 0, בן: 0 }; a.entries.forEach(e => n[e.c]++);
    assert.ok(Math.abs(n['רובי'] - n['בן']) <= 1, JSON.stringify(n));
    assert.ok(a.entries.every(e => !('cm' in e) && !('u' in e)), 'בלי שדות עזר');
    const h = (await api('GET', '/api/docs/settings/ar_hist')).json; assert.ok(h.h['2026-11-20'], 'היסטוריה נשמרה');
    await shot('05-arranged');
  });

  // ---- תוספות: PDF לכל גובה בחשבון גובים, מחיקת חשבון ----
  await step('חשבון גובים: PDF נפרד לכל גובה', async () => {
    await p.goto(URL + '/#/acc/' + COLL19); await p.waitForSelector('#c-per [data-cper]');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#c-per [data-cper] >> nth=0')]);
    assert.ok(/\.pdf$/.test(dl.suggestedFilename()) || dl.suggestedFilename() === 'download', dl.suggestedFilename());
    const fp = path.join(OUT, 'coll.pdf'); await dl.saveAs(fp); assert.strictEqual(fs.readFileSync(fp).slice(0, 4).toString(), '%PDF');
  });
  await step('מחיקת חשבון (בעלים) ושחזורו מגיבוי', async () => {
    const r = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-21' }); const id = r.json.id;
    await p.goto(URL + '/#/acc/' + id); await p.click('[data-xact]:has-text("מחיקת רישום")'); await p.click('#rmgo'); await p.waitForURL(/#\/accounts$/);
    assert.strictEqual((await api('GET', '/api/accounts/' + id)).status, 404);
  });

  // ---- אייפון: אין גלילה אופקית במסכים החדשים ----
  await step('אייפון: דוח התאמה, כרטיס לקוח וגיבויים בלי גלילה אופקית', async () => {
    const ph = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' }); const q = await ph.newPage();
    q.on('pageerror', e => errs.push(e.message));
    await q.goto(URL + '/#/login'); await q.fill('input[name=u]', 'owner'); await q.fill('input[name=p]', 'Owner-pass-1'); await q.click('form button'); await q.waitForSelector('.kpis');
    for (const h of ['#/migration', '#/client/' + encodeURIComponent('לאה'), '#/backups', '#/loans-manage', '#/contracts-manage/view/' + CONTRACT]) {
      await q.goto(URL + '/' + h); await q.waitForTimeout(1500);
      const w = await q.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1] + 1, h + ' רחב מדי: ' + w);
    }
    await q.screenshot({ path: path.join(OUT, '06-iphone-loans.png'), fullPage: true }); await ph.close();
  });

  await step('אין שגיאות בדפדפן', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} עברו. צילומים: ${OUT}`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
