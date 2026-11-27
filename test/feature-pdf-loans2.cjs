// בדיקת קבלה: ״פירוט הלוואות שנמסרו״ בקובץ שנשלח מחלון השיתוף (אייפון), בכל שלוש הדרכים להפקת PDF של איסוף יום,
// ושדה חובה ״לכמה שיקים חולקה ההלוואה?״ לפני אישור מסירה.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8566, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-pl2-'));
const OUT = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-pl2-shots-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await wait(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  // חלון השיתוף של האייפון: הקובץ שמצורף נשמר כדי לפתוח אותו; וה-HTML שממנו צויר ה-PDF
  await p.addInitScript(() => {
    window.__shared = []; window.__stage = [];
    navigator.canShare = () => true;
    navigator.share = async (d) => { const f = d.files && d.files[0]; if (!f) return; const u = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); window.__shared.push({ name: f.name, b64: btoa(s) }); };
    new MutationObserver(() => { for (const id of ['wt-pdf-stage', 'pdf-stage']) { const st = document.getElementById(id); const h = st && st.innerHTML; if (h && h.length > 50 && window.__stage[window.__stage.length - 1] !== h) window.__stage.push(h); } }).observe(document, { childList: true, subtree: true });
  });
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json().catch(() => ({})); if (!r.ok()) { const e = new Error(u + ': ' + JSON.stringify(j)); e.j = j; e.status = r.status(); throw e; } return j; };
  const DATE = '2026-11-26';
  const strip = (a) => { const d = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); return d; };
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: DATE, opId: 'w' });
  { const a = await api('GET', '/api/accounts/' + W); const E = []; for (let i = 0; i < 18; i++) E.push({ _k: 'e' + i, n: 'לקוח ' + (i + 1), a: 1000 + 100 * i, c: ['אושר', 'בן', 'שליח בן'][i % 3], t: String(9 + (i % 9)).padStart(2, '0') + ':00', s: i % 3 ? '' : 'נאסף' }); await api('PUT', '/api/accounts/' + W, { data: { ...strip(a), entries: E }, baseVersion: a._version, opId: 'wf' }); }
  await api('POST', '/api/accounts', { kind: 'collectors', date: DATE, opId: 'c' });
  const mkReq = async (id, name, amount, date, note, chk) => { await api('POST', '/api/docs/loan_requests', { id, data: { name, amount, date, note, phone: '', chk: chk ?? '', created: '', updated: '' }, opId: 'q' + id }); await api('POST', '/api/loan-req/xfer', { id, kind: 'work', date: DATE, opId: 'x' + id }); };
  await mkReq('Qliot', 'ליאור נבא', 10000, '2026-11-24', '1650 כפול 10', 10);
  await mkReq('Qron', 'רונן בוריסוב', 3200, '2026-11-25', 'חידוש', 1);
  await mkReq('Qd1', 'דנה כהן', 5000, '2026-11-26', 'שבועי 500', 10);
  await mkReq('Qd2', 'דנה כהן', 2000, '2026-11-26', 'חודשי 1000', 2);
  await mkReq('Qold', 'בקשה ישנה', 1500, '2026-11-20', 'ישנה בלי שיקים', 3);
  await mkReq('Qnew', 'משה לוי', 4000, '2026-11-26', '1000 כפול 4', '');
  for (const [id, c] of [['Qliot', 'אושר'], ['Qron', 'בן'], ['Qd1', 'אושר'], ['Qd2', 'בן'], ['Qold', 'אושר']]) await api('POST', '/api/loan-req/give', { id, c, opId: 'g' + id });
  // בקשה ישנה שנמסרה לפני שהיה שדה שיקים
  { const q = await api('GET', '/api/docs/loan_requests/Qold'); const d = { ...q }; delete d.id; delete d._version; d.chk = ''; await api('PUT', '/api/docs/loan_requests/Qold', { data: d, baseVersion: q._version, opId: 'old' }); }
  const loanExp = async () => (await api('GET', '/api/accounts/' + W)).expenses.filter(x => x.lr).map(x => x.lr).sort();
  const boxOf = async (h) => p.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; const el = d.querySelector('.lgv'); if (!el) return null; return { title: el.querySelector('.lgv-h').textContent.replace(/\s+/g, ' ').trim(), items: [...el.querySelectorAll('.lgv-i')].map(i => ({ id: i.dataset.lr, top: i.querySelector('.lgv-top').textContent.replace(/\s+/g, ' ').trim(), meta: i.querySelector('.lgv-m').textContent.replace(/\s+/g, ' ').trim(), note: i.querySelector('.lgv-note').dataset.note, chk: i.querySelector('.lgv-chk').textContent.replace(/\s+/g, ' ').trim() })), totals: [...d.querySelectorAll('tr.tot td, tr.tot2 td')].map(x => x.textContent.trim()).join('|'), noBox: (() => { el.remove(); return d.innerHTML; })() }; }, h);
  const sharedPdf = async (file) => { await p.waitForFunction(() => window.__shared.length > 0, null, { timeout: 60000 }); const s = await p.evaluate(() => window.__shared.pop()); const f = path.join(OUT, file); fs.writeFileSync(f, Buffer.from(s.b64, 'base64')); return { f, name: s.name }; };
  const lastStage = () => p.evaluate(() => window.__stage[window.__stage.length - 1] || '');
  let box1;

  await step('בקשה חדשה בלי מספר שיקים: ״אשר״ משאיר אותה פתוחה, הסמן בשדה, ההודעה המדויקת, בלי הוצאה', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#lrq-panel');
    const it = p.locator('#lrq-panel .lrq-item', { hasText: 'משה לוי' });
    await p.waitForFunction(() => [...document.querySelectorAll('[data-lrc] option')].some(o => o.textContent === 'אושר'));
    assert.strictEqual(await it.locator('[data-lrk]').inputValue(), '', 'ריק בהתחלה');
    await it.locator('[data-lrc]').selectOption('אושר'); await it.locator('[data-lrok]').click();
    await it.locator('.note.err').waitFor();
    assert.strictEqual((await it.locator('.note.err').innerText()).trim(), 'כדי לסגור את הבקשה, יש להזין לכמה שיקים חולקה ההלוואה');
    assert.ok(await p.evaluate(() => document.activeElement && document.activeElement.matches('[data-lrk]')), 'הסמן בשדה');
    assert.match(await it.innerText(), /ממתינה למסירה/);
    assert.ok(!(await loanExp()).includes('Qnew'));
    // גם בשרת (בלי המסך): בלי מספר — לא נסגר ולא נרשמת הוצאה; מספר לא תקין — אותו דבר
    for (const chk of [undefined, '', '0', '2.5', 'abc']) { let e = null; try { await api('POST', '/api/loan-req/give', { id: 'Qnew', c: 'אושר', chk, opId: 'bad' + chk }); } catch (x) { e = x; } assert.ok(e && /שיקים/.test(e.message), 'שרת: ' + chk); }
    assert.ok(!(await loanExp()).includes('Qnew')); assert.ok(!(await api('GET', '/api/docs/loan_requests/Qnew')).given);
  });
  await step('אחרי הזנת 10 ואישור מסירה: נסגרה, נרשמה הוצאה אחת, ומופיע ״מספר שיקים: 10״', async () => {
    const it = p.locator('#lrq-panel .lrq-item', { hasText: 'משה לוי' });
    await it.locator('[data-lrk]').fill('10'); await it.locator('[data-lrok]').click();
    await p.waitForFunction(() => [...document.querySelectorAll('#lrq-panel .lrq-item')].some(x => x.textContent.includes('משה לוי') && x.textContent.includes('אושרה ונמסרה')), null, { timeout: 8000 });
    assert.match(await p.locator('#lrq-panel .lrq-item', { hasText: 'משה לוי' }).innerText(), /מספר שיקים: 10/);
    const q = await api('GET', '/api/docs/loan_requests/Qnew'); assert.strictEqual(q.chk, 10); assert.ok(q.given);
    assert.deepStrictEqual(await loanExp(), ['Qd1', 'Qd2', 'Qliot', 'Qnew', 'Qold', 'Qron']);
  });
  await step('״PDF לוואטסאפ״ (איסוף יום) → הקובץ מחלון השיתוף: ״פירוט הלוואות שנמסרו״ עם 10,000 ״1650 כפול 10״ ו-3,200 ״חידוש״, כל הלוואה פעם אחת, לפי מזהה', async () => {
    await p.reload(); await p.waitForSelector('[data-wpdf-all]'); await p.click('[data-wpdf-all]');
    const { f, name } = await sharedPdf('work.pdf'); assert.strictEqual(fs.readFileSync(f).slice(0, 5).toString(), '%PDF-'); assert.match(name, /\.pdf$/);
    box1 = await boxOf(await lastStage()); assert.ok(box1, 'התיבה בקובץ');
    assert.strictEqual(box1.title, 'פירוט הלוואות שנמסרו (6)');
    const by = Object.fromEntries(box1.items.map(i => [i.id, i]));
    assert.deepStrictEqual(Object.keys(by).sort(), ['Qd1', 'Qd2', 'Qliot', 'Qnew', 'Qold', 'Qron']);
    assert.ok(by.Qliot.top.includes('ליאור נבא') && by.Qliot.top.includes('10,000 ₪') && by.Qliot.note === '1650 כפול 10' && by.Qliot.chk === 'מספר שיקים: 10');
    assert.ok(by.Qliot.meta.includes('אושר') && by.Qliot.meta.includes('24.11.2026') && /שעת מסירה \d{2}:\d{2}/.test(by.Qliot.meta), by.Qliot.meta);
    assert.ok(by.Qron.top.includes('3,200 ₪') && by.Qron.note === 'חידוש' && by.Qron.chk === 'מספר שיקים: 1');
    assert.strictEqual(by.Qd1.note, 'שבועי 500'); assert.strictEqual(by.Qd2.note, 'חודשי 1000'); assert.ok(by.Qd1.top.includes('5,000') && by.Qd2.top.includes('2,000'), 'שתי הלוואות לאותו לקוח — כל אחת עם הפירוט שלה');
    assert.strictEqual(by.Qnew.chk, 'מספר שיקים: 10'); assert.strictEqual(by.Qold.chk, 'מספר שיקים לא הוזן'); assert.strictEqual(by.Qold.note, 'ישנה בלי שיקים');
    execFileSync('pdftoppm', ['-r', '90', '-png', f, path.join(OUT, 'work')]);
  });
  await step('הסיכומים בקובץ זהים לסיכומים בלי התיבה; ״מתן הלוואה״ נספרת פעם אחת (6 הוצאות)', async () => {
    const h = await lastStage(); const m = await p.evaluate(async (id) => { const L = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return L.workHTML({ kind: 'work', date: a.date, entries: a.entries.filter(e => e && (e.n || e.a)), expenses: (a.expenses || []).filter(x => x && (x.n || x.a)) }); }, W);
    assert.strictEqual(box1.noBox.replace(/^<article[^>]*>|<\/article>$/g, ''), m, 'בלי התיבה — זהה בדיוק');
    assert.ok(/סה״כ הוצאות \(6\)/.test(h)); assert.strictEqual((h.match(/מתן הלוואה — ליאור נבא/g) || []).length, 1);
  });
  await step('״PDF לוואטסאפ״ מתצוגת החשבון השמור ו״שליחת PDF״ מרשימת החשבונות — אותה תיבה', async () => {
    await p.goto(URL + '/#/report/' + W); await p.waitForSelector('#r-pdf'); await p.click('#r-pdf');
    const r1 = await sharedPdf('report.pdf'); assert.ok(fs.statSync(r1.f).size > 1000);
    const b2 = await boxOf(await lastStage()); assert.ok(b2, 'תצוגת חשבון שמור'); assert.deepStrictEqual(b2.items.map(i => i.id).sort(), ['Qd1', 'Qd2', 'Qliot', 'Qnew', 'Qold', 'Qron']);
    await p.goto(URL + '/#/accounts'); await p.waitForSelector('.accrow'); await p.locator(`.accrow[data-id="${W}"] [data-pdf]`).click();
    await p.waitForFunction(() => { const b = document.querySelector('#pwa'); return b && !b.disabled; }, null, { timeout: 60000 });
    const b3 = await boxOf(await lastStage()); assert.ok(b3, 'שליחת PDF'); assert.strictEqual(b3.items.find(i => i.id === 'Qron').note, 'חידוש');
    await p.click('#pwa'); const r3 = await sharedPdf('accounts.pdf'); assert.ok(fs.statSync(r3.f).size > 1000);
    await p.click('#sheet [data-close]').catch(() => {});
  });
  await step('בקשה ישנה שנמסרה: ״מספר שיקים לא הוזן״ בכרטיס; השלמה מתוך הבקשה לא רושמת הוצאה נוספת', async () => {
    await p.goto(URL + '/#/requests-manage'); const card = p.locator('.rq-item', { hasText: 'בקשה ישנה' }); await card.waitFor();
    assert.match(await card.innerText(), /מספר שיקים לא הוזן/);
    await card.locator('[data-rq-edit]').click(); await p.fill('#rq-f-chk', '0'); await p.click('#rq-save');
    assert.match(await p.locator('#rq-form-msg').innerText(), /מספר שלם/);
    await p.fill('#rq-f-chk', '3'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    await p.waitForFunction(() => /מספר שיקים: 3/.test([...document.querySelectorAll('.rq-item')].find(x => x.textContent.includes('בקשה ישנה'))?.textContent || ''));
    const q = await api('GET', '/api/docs/loan_requests/Qold'); assert.strictEqual(q.chk, 3); assert.ok(q.given && q.xfer);
    assert.deepStrictEqual(await loanExp(), ['Qd1', 'Qd2', 'Qliot', 'Qnew', 'Qold', 'Qron']);
    // טיוטה: בקשה חדשה נשמרת בלי מספר שיקים
    await p.click('#rq-new'); await p.fill('#rq-f-name', 'טיוטה'); await p.fill('#rq-f-amount', '900'); await p.click('#rq-save'); await p.waitForFunction(() => document.querySelector('#rq-form').hidden);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
