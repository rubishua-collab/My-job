// בדיקת יומן גובים ושליחים, העברות כספים והודעות בוקר — מול הנתונים האמיתיים (עותק), על פורט 8307.
// הרצה: BACKUP=path/to/backup.json [ORIG=path/to/app.html] node test/feature-ledger.cjs
// ״המקור״ בבדיקה = הקוד של התוכנה המקורית עצמה (app.html), שנקרא מהקובץ ומורץ בארגז חול (vm). כך נבדק שההעתקה
// ב-ledger-calc.js זהה, ושהנתונים שהשרת מגיש והמסך מציג נותנים בדיוק את אותם סכומים.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const assert = require('assert');

const ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : path.resolve(__dirname, '..');
const SP = '/tmp/claude-0/-home-user-My-job/07101a7a-eccb-5a25-8245-cb5180d30624/scratchpad';
const BACKUP = process.env.BACKUP || path.join(SP, 'backup/yoman-full-backup-2026-11-21.json');
const ORIG = process.env.ORIG || path.join(SP, 'orig/app.html');
const PORT = +process.env.LEDGER_PORT || 8307, URL = 'http://localhost:' + PORT;
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-ledger');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ledger-data-'));
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false, err: e.message }); console.log('✗', name, '\n   ', e.message.split('\n').slice(0, 4).join('\n    ')); } };
const near = (a, b, msg) => assert.ok(Math.abs((+a || 0) - (+b || 0)) < 0.005, `${msg}: ${a} ≠ ${b}`);
const numOf = (s) => { const t = String(s).replace(/[^\d.,−-]/g, '').replace(/,/g, '').replace('−', '-'); return parseFloat(t) || 0; };

// ---- המקור: הקוד מ-app.html מורץ בארגז חול עם אותן פונקציות עזר (שהועתקו ל-calc.js) ----
async function originalOracle() {
  const H = fs.readFileSync(ORIG, 'utf8').split('\n');
  const L = (a, b) => H.slice(a - 1, b).join('\n');
  const calc = await import(path.join(ROOT, 'public/js/calc.js'));
  const src = [L(1856, 1860), L(1871, 1872), L(2522, 2523), L(3017, 3017), L(4879, 4881), L(9619, 9619), L(9634, 9674), L(9882, 10097),
    'this.api={lgLedger,lgView,lgUi,mbRecipients,mbFill,MB_DEF,setS:(x)=>{S=x},setLG:(x)=>{LG=x},setToday:(t)=>{TODAY=t}};'].join('\n');
  const ctx = { ...calc, TODAY: '', S: null, LG: null, console };
  vm.createContext(ctx);
  vm.runInContext('var TODAY="",S=null,LG=null;function todayISO(){return TODAY;}\n' + src, ctx);
  return ctx.api;
}
const oS = (list) => ({ s: { list }, w: { entries: [], expenses: [], editId: null, date: '' }, c: { entries: [], editId: null, date: '' }, sp: { records: [], xstash: [], date: '' } });
const oLG = (tr) => ({ tr, trAt: 0, ver: 1, cache: null, cacheVer: 0, ui: {}, seq: 0 });
function oracleDay(O, accounts, transfers, date, uiPatch = {}) {
  O.setS(oS(accounts)); O.setLG(oLG(transfers)); O.setToday(date);
  const u = O.lgUi('w'); Object.assign(u, { auto: false, mode: 'day', from: date, to: date }, uiPatch);
  return O.lgView('w');
}

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: BACKUP };
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 60 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  if (!slog.includes('פועל')) { console.error(slog); process.exit(1); }
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  const api = async (method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const O = await originalOracle();
  const M = await import(path.join(ROOT, 'public/js/features/ledger-calc.js'));
  const C = await import(path.join(ROOT, 'public/js/calc.js'));

  await step('כניסה', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
  });

  // נתוני המקור ישר מקובץ הגיבוי (לא דרך השרת)
  const bk = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).collections;
  const rawAcc = bk.accounts.map(x => ({ id: x.id, ...x.data })).filter(a => a.kind === 'work' || a.kind === 'collectors');
  const dates = [...new Set(rawAcc.map(a => a.date))].sort();

  await step('יומן: לכל יום ולכל גובה/שליח — הסכומים מהשרת זהים לקוד המקורי (' + dates.length + ' ימים)', async () => {
    const d = (await api('GET', '/api/ledger/data')).json;
    assert.strictEqual(d.accounts.length, rawAcc.length, 'מספר חשבונות');
    let groups = 0;
    for (const date of dates) {
      const A = oracleDay(O, rawAcc, [], date);
      M.buildLedger(d.accounts, d.transfers.list); const u = M.lgUi('w'); Object.assign(u, { auto: false, mode: 'day', from: date, to: date });
      const B = M.lgView('w');
      assert.strictEqual(B.blocks.length, A.blocks.length, date + ' מספר גובים');
      for (const k of ['coll', 'exp', 'net', 'trans', 'bal', 'acts', 'rows', 'clients', 'heldSum', 'atColl', 'unk']) near(B.tot[k], A.tot[k], date + ' סה״כ ' + k);
      A.blocks.forEach((x, i) => {
        const y = B.blocks[i]; assert.strictEqual(y.rc, x.rc, date + ' גובה');
        x.groups.forEach((g, j) => { const h = y.groups[j]; assert.strictEqual(h.byk, g.byk); for (const k of ['coll', 'exp', 'expF', 'net', 'trans', 'bal', 'acts']) near(h[k], g[k], date + ' ' + x.rc + '/' + g.by + ' ' + k); assert.strictEqual(h.held, g.held); groups++; });
      });
    }
    // טווח של כל התקופה
    const A = oracleDay(O, rawAcc, [], dates[0], { mode: 'range', to: dates[dates.length - 1], st: 'all' });
    M.buildLedger(d.accounts, []); Object.assign(M.lgUi('w'), { auto: false, mode: 'range', from: dates[0], to: dates[dates.length - 1], st: 'all' });
    const B = M.lgView('w');
    for (const k of ['coll', 'exp', 'net', 'bal', 'rows']) near(B.tot[k], A.tot[k], 'כל התקופה ' + k);
    console.log('   ', groups, 'קבוצות נבדקו · כל התקופה: נאסף', A.tot.coll, 'נטו', A.tot.net, 'שורות', A.tot.rows);
  });

  const DAY = '2026-11-19';
  await step('יומן במסך: הסכום והנטו לכל גובה ב-' + DAY + ' כמו בקוד המקורי', async () => {
    await p.goto(URL + '/#/ledger?d=' + DAY); await p.waitForSelector('#lg-w .lg-b');
    const A = oracleDay(O, rawAcc, [], DAY);
    const heads = await p.$$eval('#lg-w .lg-bh', els => els.map(e => ({ rc: e.querySelector('.lg-bt b').textContent, s: [...e.querySelectorAll('.lg-bs .num')].map(x => x.textContent) })));
    assert.strictEqual(heads.length, A.blocks.length);
    heads.forEach((h, i) => { assert.strictEqual(h.rc, A.blocks[i].rc); near(numOf(h.s[0]), A.blocks[i].tot.coll, h.rc + ' נאסף'); near(numOf(h.s[1]), A.blocks[i].tot.net, h.rc + ' נטו'); });
    await p.screenshot({ path: path.join(OUT, 'ledger-day.png'), fullPage: true });
  });

  // שליח: סימון ״נאסף״ עם ״אסף בפועל: דוד״ באיסוף יום, ואז העברה מהשליח לגובה
  let target;
  await step('שליח: איסוף שסומן ״אסף בפועל: דוד״ מופיע אצל השליח עם יתרה = נאסף − הוצאות − העברות', async () => {
    const list = (await api('GET', '/api/accounts?kind=work')).json.filter(a => a.date === DAY);
    const w = (await api('GET', '/api/accounts/' + list[0].id)).json;
    const e = w.entries.find(x => x.n && +x.a > 0 && String(x.c || '').trim() && !x.by);
    target = { acc: w.id, key: e._k, n: e.n, c: e.c, a: +e.a };
    const r = await api('POST', `/api/accounts/${w.id}/mark`, { key: e._k, s: 'נאסף', by: 'דוד', opId: 'lg-mark-' + Date.now() });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const d = (await api('GET', '/api/ledger/data')).json;
    const A = oracleDay(O, d.accounts, d.transfers.list, DAY);
    const blk = A.blocks.find(x => x.rck === C.collKey(C.cleanColl(e.c)));
    const g = blk.groups.find(x => x.by === 'דוד'); assert.ok(g, 'אין קבוצת שליח');
    assert.strictEqual(g.type, 'cour'); near(g.held, g.coll - g.expF - g.trans, 'נוסחת היתרה');
    target.held = g.held; target.rc = blk.rc; target.rck = blk.rck;
    await p.goto(URL + '/#/ledger?d=' + DAY); await p.waitForSelector('#lg-w .lg-b');
    await p.reload(); await p.waitForSelector('#lg-w .lg-b');
    const bh = p.locator(`#lg-w .lg-bh[data-lg-tg="b:${target.rck}"]`);
    if (await bh.getAttribute('aria-expanded') !== 'true') await bh.click();
    const gh = p.locator(`#lg-w .lg-gh[data-lg-tg="g:${target.rck}|דוד"]`); await gh.waitFor();
    if (await gh.getAttribute('aria-expanded') !== 'true') await gh.click();
    const pill = p.locator('#lg-w .lg-g-cour .lg-gh', { hasText: 'שליח: דוד' }).first();
    await pill.waitFor();
    assert.ok((await pill.innerText()).includes('אצלו'), await pill.innerText());
  });

  await step('העברה משליח לגובה מקטינה את היתרה אצל השליח (נשמר ב-settings/transfers)', async () => {
    const amt = Math.min(100, target.held);
    await p.click(`#lg-w [data-lg-tradd="${target.rck}|דוד"]`);
    await p.waitForSelector('form[data-lg-form="tr"]');
    assert.strictEqual(await p.inputValue('form[data-lg-form="tr"] [name=from]'), 'דוד');
    await p.fill('form[data-lg-form="tr"] [name=a]', String(amt)); await p.fill('form[data-lg-form="tr"] [name=d]', DAY);
    await p.click('form[data-lg-form="tr"] [type=submit]');
    await p.waitForSelector('#sheet', { state: 'hidden' });
    const t = (await api('GET', '/api/docs/settings/transfers')).json;
    assert.strictEqual(t.list.length, 1); near(t.list[0].a, amt, 'סכום ההעברה'); assert.strictEqual(t.list[0].from, 'דוד');
    const d = (await api('GET', '/api/ledger/data')).json;
    const A = oracleDay(O, d.accounts, d.transfers.list, DAY);
    const g = A.blocks.find(x => x.rck === target.rck).groups.find(x => x.by === 'דוד');
    near(g.trans, amt, 'הועבר'); near(g.held, target.held - amt, 'יתרה אחרי העברה');
    await p.waitForFunction((v) => [...document.querySelectorAll('#lg-w .lg-g-cour .lg-gsum div')].some(x => x.textContent.includes('יתרה שטרם הועברה') && x.textContent.replace(/[^\d.]/g, '') === String(v)), String(target.held - amt).replace(/\.0+$/, ''), { timeout: 5000 }).catch(async () => {
      const txt = await p.locator('#lg-w .lg-g-cour').first().innerText(); throw new Error('המסך לא הראה יתרה ' + (target.held - amt) + ': ' + txt.slice(0, 300));
    });
    await p.screenshot({ path: path.join(OUT, 'ledger-courier.png'), fullPage: true });
  });

  await step('עריכת איסוף מהיומן נכתבת לשורה המקורית (הערה)', async () => {
    const ed = p.locator('#lg-w .lg-g-cour .lg-r .lg-ed').first(); await ed.click();
    await p.waitForSelector('form[data-lg-form="rec"]');
    await p.fill('form[data-lg-form="rec"] [name=nt]', 'הערת בדיקה');
    await p.click('form[data-lg-form="rec"] [type=submit]'); await p.waitForSelector('#sheet', { state: 'hidden' });
    const w = (await api('GET', '/api/accounts/' + target.acc)).json; const e = w.entries.find(x => x._k === target.key);
    assert.strictEqual(e.nt, 'הערת בדיקה'); assert.strictEqual(e.by, 'דוד'); assert.ok(/נאס/.test(e.s));
  });

  // ---- הודעות בוקר ----
  const MDAY = '2026-11-20';
  const oracleMb = (O, accs, spDraft) => {
    // ״הטאב״ של המקור: טיוטת הפיצול (sp_draft) של אותו יום ורשימת האיסוף של אותו יום
    const sp = accs.filter(a => a.kind === 'split' && a.date === MDAY).sort((x, y) => (y.updatedAt || y.createdAt || 0) - (x.updatedAt || x.createdAt || 0))[0];
    const w = accs.filter(a => a.kind === 'work' && a.date === MDAY).sort((x, y) => (y.updatedAt || y.createdAt || 0) - (x.updatedAt || x.createdAt || 0))[0];
    const S = oS([]); S.sp = { records: sp.records, xstash: spDraft.d.xstash, date: sp.date }; S.w = { entries: w.entries, expenses: w.expenses || [], date: w.date };
    O.setS(S); O.setToday(MDAY); return JSON.parse(JSON.stringify(O.mbRecipients()));
  };
  await step('הודעות בוקר ' + MDAY + ': הנמענים זהים לאלגוריתם המקורי (איחוד לפי טלפון, שעה, גובה, בלי ״נאסף״)', async () => {
    const spDraft = bk.settings.find(x => x.id === 'sp_draft').data;
    const accs = (await Promise.all((await api('GET', '/api/accounts')).json.filter(a => a.date === MDAY).map(a => api('GET', '/api/accounts/' + a.id)))).map(r => r.json);
    // מסמנים לקוח אחד כ״נאסף״ — הוא לא אמור לקבל תזכורת
    const w = accs.find(a => a.kind === 'work'); const e = w.entries.find(x => x.p && +x.a > 0);
    const mk = await api('POST', `/api/accounts/${w.id}/mark`, { key: e._k, s: 'נאסף', opId: 'mb-mark-' + Date.now() }); assert.strictEqual(mk.status, 200);
    const accs2 = (await Promise.all(accs.map(a => api('GET', '/api/accounts/' + a.id)))).map(r => r.json);
    const A = oracleMb(O, accs2, spDraft);
    const B = (await api('GET', '/api/ledger/morning?date=' + MDAY)).json;
    const pick = g => [g.k, g.n, g.a, g.t, g.c, g.ph].join('|');
    assert.deepStrictEqual(B.list.map(pick), A.list.map(pick)); assert.deepStrictEqual(B.noPhone.map(pick), A.noPhone.map(pick));
    assert.ok(!B.list.some(g => g.n === e.n), 'מי שנאסף קיבל תזכורת');
    // איחוד: לכל טלפון הודעה אחת
    assert.strictEqual(new Set(B.list.map(g => g.ph)).size, B.list.length);
    // הנוסח: בלי שעה → ״במהלך היום״
    const nt = B.list.find(g => !g.t); if (nt) assert.ok(O.mbFill(O.MB_DEF, nt).includes('יגיע במהלך היום'));
    console.log('   ', B.list.length, 'עם טלפון ·', B.noPhone.length, 'בלי טלפון · ״נאסף״ הוצא:', e.n);
    // המסך
    await p.goto(URL + '/#/today?date=' + MDAY); await p.waitForSelector('#mb-today'); await p.click('#mb-today');
    await p.waitForSelector('#mb-list');
    assert.strictEqual(await p.locator('#mb-list .mb-row').count(), B.list.length);
    const first = await p.locator('#mb-list .mb-row .mb-msg').first().textContent();
    assert.strictEqual(first, M.mbFill(B.tpl, B.list[0]));
    await p.screenshot({ path: path.join(OUT, 'morning.png'), fullPage: true });
    // סינון לפי גובה
    const c = B.list[0].c; await p.click(`#mb-colls [data-c="${c}"]`);
    assert.strictEqual(await p.locator('#mb-list .mb-row').count(), B.list.filter(g => g.c === c).length);
    // שליחה: גיליון השליחה הרשמי עם אותם נמענים
    await p.click('#mb-send'); await p.waitForSelector('#sheet:not([hidden]) #ws .list, #sheet:not([hidden]) #ws .note');
    assert.ok(await p.locator('#sheet h2', { hasText: 'שליחה בוואטסאפ' }).count());
  });

  await step('אין שגיאות JavaScript', async () => { assert.deepStrictEqual(errs, []); });
  // גובה: רואה רק את השורות שלו ואין לו גישה להעברות/הודעות
  await step('גובה רואה ביומן רק את השורות שלו (נאכף בשרת)', async () => {
    const mk = await api('POST', '/api/users', { username: 'coll1', name: 'גובה', role: 'collector', collector_name: target.c, password: 'Coll-pass-1' });
    assert.strictEqual(mk.status, 200, JSON.stringify(mk.json));
    const c2 = await b.newContext(); const r = await c2.request.post(URL + '/api/login', { data: { username: 'coll1', password: 'Coll-pass-1' }, headers: { Origin: URL } }); assert.strictEqual(r.status(), 200);
    const d = await (await c2.request.get(URL + '/api/ledger/data')).json();
    const me = C.collKey(C.cleanColl(target.c));
    for (const a of d.accounts) for (const e of a.entries || []) assert.ok(C.collKey(C.cleanColl(e.c)) === me || C.collKey(e.by) === me, 'שורה של גובה אחר: ' + e.n + ' ' + e.c);
    assert.ok(d.accounts.length > 0); assert.ok(d.readOnly);
    assert.strictEqual((await c2.request.get(URL + '/api/ledger/morning?date=' + MDAY)).status(), 403);
    assert.strictEqual((await c2.request.put(URL + '/api/docs/settings/transfers', { data: { data: { list: [] } }, headers: { Origin: URL } })).status(), 403);
    await c2.close();
  });

  await b.close(); srv.kill();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} עברו. צילומי מסך: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
