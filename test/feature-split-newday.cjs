// בדיקת קבלה: חשבון פיצול חדש + ייבוא אקסל מציג רק את מה שבאקסל (ומה שנוסף ידנית) — לא לקוחות מאתמול.
// אתמול: דני 1,000 + יוסי 800. היום: אקסל עם שתי שורות של דני (300 אושר, 200 רובי) → לווה אחד, 2 חובות, 500 ₪.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8490, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-nd-')), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-nd-x-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 500)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' }); await ctx.route(/wa\.me|whatsapp\.com/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const R = (n, a, c) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t: '', cnt: 1, side: false });
  const makeXlsx = async (name, aoa) => {
    const b64 = await p.evaluate(async (aoa) => {
      if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'גיליון1'); return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    }, aoa);
    const f = path.join(TMP, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };
  const XL = [['מסך דו"ח ראשי'], ['שם פרטי', 'שם משפחה', 'יתרה', 'סוכן', 'טלפון נייד', 'קשה'], ['דני', 'כהן', 300, 'אושר', '0501234567', ''], ['דני', 'כהן', 200, 'רובי', '0501234567', '']];
  // אתמול — חשבון שמור, כולל איחוד קודם וסימון לוואטסאפ
  const { id: Y } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-22', opId: 'y' });
  { const a = await api('GET', '/api/accounts/' + Y); const data = { ...a, records: [R('דני כהן', 600, 'טל'), R('דני כהן', 400, 'אושר'), R('יוסי לוי', 800, 'רובי')].map((r, i) => i < 2 ? { ...r, mg: 'gold1' } : r) }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + Y, { data, baseVersion: a._version, opId: 'yf' }); }
  let T;
  const view = async () => (await p.locator('#view').innerText());
  const total = async (id) => (await api('GET', '/api/accounts/' + id)).records.reduce((s, r) => s + (+r.a || 0), 0);

  await step('אתמול: מסמנים את יוסי לוואטסאפ, ואז ״פתיחת יום חדש״ → חשבון ריק חדש עם מזהה משלו', async () => {
    await p.goto(URL + '/#/acc/' + Y); await p.waitForSelector('#dnew');
    await p.locator('.li', { hasText: 'יוסי לוי' }).locator('input.ck').check();
    await p.click('#dnew'); await p.fill('#dd', '2026-11-23'); await p.click('#ddgo');
    await p.waitForFunction((y) => /#\/acc\//.test(location.hash) && !location.hash.includes(y), Y); await p.waitForSelector('#dclear');
    T = p.url().split('#/acc/')[1].split('?')[0]; assert.notStrictEqual(T, Y);
    const a = await api('GET', '/api/accounts/' + T); assert.strictEqual(a.records.length, 0); assert.strictEqual(a.date, '2026-11-23');
    const v = await view(); assert.ok(!v.includes('יוסי') && !v.includes('דני'), 'חשבון חדש ריק');
    assert.ok((await p.locator('#sendpriv').innerText()).includes('ל־0'), 'אין נמענים מאתמול');
  });
  await step('ייבוא האקסל (רק שתי שורות של דני) לחשבון החדש, שמירה', async () => {
    await p.goto(URL + '/#/acc/' + T + '?edit=1'); await p.waitForSelector('[data-eact]');
    await p.click('button[data-eact]:has-text("קליטה מקובץ אקסל")'); await p.setInputFiles('#imp-file', await makeXlsx('today.xlsx', XL));
    await p.waitForSelector('#sp-imp-ok'); await p.click('#sp-imp-ok'); await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
    const a = await api('GET', '/api/accounts/' + T); assert.deepStrictEqual(a.records.map(r => r.n + ':' + r.a + ':' + r.c).sort(), ['דני כהן:200:רובי', 'דני כהן:300:אושר']);
  });
  await step('״איחוד חובות לפי לווה״: לווה אחד (דני), שני חובות, סה״כ 500; יוסי לא מופיע', async () => {
    await p.waitForSelector('#mgbtn'); await p.click('#mgbtn'); await p.waitForSelector('#mgall');
    const sh = await p.locator('#sheet').innerText(); assert.ok(!sh.includes('יוסי') && sh.includes('500'), sh);
    await p.click('#mgmark'); await p.click('#mgall'); await p.waitForSelector('.mgcard .mgrow');
    assert.strictEqual(await p.locator('.mgcard .mgrow').count(), 1); assert.ok((await p.locator('.mgcard .mgrow .t').innerText()).includes('דני כהן — 500'));
    assert.ok((await p.locator('.mgcard .mgrow').innerText()).includes('2 חובות'));
    assert.ok(!(await view()).includes('יוסי'));
  });
  await step('״בחר את כל תוצאות הסינון״ ונמעני וואטסאפ — רק דני (הודעה אחת, 500 ₪)', async () => {
    await p.check('#selall'); assert.ok((await p.locator('#sendpriv').innerText()).includes('ל־1 שורות'), await p.locator('#sendpriv').innerText());
    await p.click('#sendpriv'); await p.waitForSelector('[data-msg]', { state: 'attached' }); const n = await p.locator('[data-msg]').count(); assert.strictEqual(n, 1);
    const m = await p.locator('[data-msg]').first().inputValue(); assert.ok(m.includes('500') && !m.includes('יוסי'), m);
    await p.click('#sheet [data-close]'); await p.uncheck('#selall');
  });
  await step('אחרי רענון, ייבוא חוזר של אותו קובץ, ומעבר ליום הקודם ובחזרה — אותה תוצאה; אתמול עדיין 1,800', async () => {
    await p.reload(); await p.waitForSelector('.mgcard .mgrow'); assert.ok((await p.locator('.mgcard .mgrow .t').innerText()).includes('דני כהן — 500'));
    await p.goto(URL + '/#/acc/' + T + '?edit=1'); await p.waitForSelector('[data-eact]');
    await p.click('button[data-eact]:has-text("קליטה מקובץ אקסל")'); await p.setInputFiles('#imp-file', await makeXlsx('today.xlsx', XL));
    await p.waitForSelector('#sp-imp-ok'); p.once('dialog', d => d.accept()); await p.click('#sp-imp-ok'); await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
    assert.strictEqual(await total(T), 500, 'ייבוא חוזר לא הכפיל'); assert.strictEqual((await api('GET', '/api/accounts/' + T)).records.length, 2);
    await p.waitForSelector('#dprev'); await p.click('#dprev'); await p.waitForFunction((y) => location.hash.includes(y), Y); await p.waitForSelector('.card');
    assert.strictEqual(await total(Y), 1800); assert.ok((await view()).includes('יוסי לוי'));
    await p.click('#dnext'); await p.waitForFunction((t) => location.hash.includes(t), T); await p.waitForSelector('#sendbar');
    const v = await view(); assert.ok(!v.includes('יוסי'), 'יוסי לא בחשבון של היום');
    assert.ok((await p.locator('#sendpriv').innerText()).includes('ל־0'), 'הבחירה מאתמול לא עוברת להיום');
  });
  await step('ייבוא חוזר שומר שורה שנוספה ידנית ועריכות (שעה, איחוד) בשורות התואמות — בלי כפילות', async () => {
    await p.goto(URL + '/#/acc/' + T + '?edit=1'); await p.waitForSelector('[data-add="records"]');
    await p.click('[data-add="records"]'); await p.locator('[data-l=records][data-k=n]').last().fill('רון ידני'); await p.locator('[data-l=records][data-k=a]').last().fill('100'); await p.locator('[data-l=records][data-k=c]').last().fill('אושר'); await p.locator('[data-l=records][data-k=c]').last().press('Tab');
    await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
    const a0 = await api('GET', '/api/accounts/' + T); const d = a0.records.find(r => r.n === 'דני כהן' && r.c === 'אושר');
    const data = { ...a0, records: a0.records.map(r => r._k === d._k ? { ...r, t: '17:15' } : r) }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + T, { data, baseVersion: a0._version, opId: 'tm' });
    await p.goto(URL + '/#/acc/' + T + '?edit=1'); await p.waitForSelector('[data-eact]');
    await p.click('button[data-eact]:has-text("קליטה מקובץ אקסל")'); await p.setInputFiles('#imp-file', await makeXlsx('today.xlsx', XL));
    await p.waitForSelector('#sp-imp-ok'); let msg = ''; p.once('dialog', dl => { msg = dl.message(); dl.accept(); }); await p.click('#sp-imp-ok'); await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
    assert.ok(msg.includes('2 שורות מייבוא קודם') && msg.includes('1 שורות שהוספת ידנית'), msg);
    const a = await api('GET', '/api/accounts/' + T); assert.deepStrictEqual(a.records.map(r => r.n + ':' + r.a).sort(), ['דני כהן:200', 'דני כהן:300', 'רון ידני:100'].sort());
    assert.strictEqual(a.records.find(r => r.n === 'דני כהן' && r.c === 'אושר').t, '17:15', 'השעה עברה לשורה התואמת');
    const dn = a.records.filter(r => r.n === 'דני כהן'); assert.ok(dn[0].mg && dn[0].mg === dn[1].mg, 'האיחוד נשמר');
    await p.waitForSelector('.mgcard .mgrow'); assert.ok((await p.locator('.mgcard .mgrow .t').innerText()).includes('דני כהן — 500'));
  });
  await step('שורה שהועתקה בטעות מאתמול (יוסי): אזהרה והסרה מהחשבון של היום בלבד; אתמול נשאר 1,800', async () => {
    const y = await api('GET', '/api/accounts/' + Y); const yos = y.records.find(r => r.n === 'יוסי לוי');
    const a0 = await api('GET', '/api/accounts/' + T); const data = { ...a0, records: a0.records.concat([{ ...yos }]) }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + T, { data, baseVersion: a0._version, opId: 'leak' });
    await p.goto(URL + '/#/acc/' + T); await p.waitForSelector('#fornote'); assert.ok((await p.locator('#fornote').innerText()).includes('יוסי לוי') && (await p.locator('#fornote').innerText()).includes('22.11.2026'));
    p.once('dialog', dl => dl.accept()); await p.click('#forrm'); await p.waitForFunction(() => !document.querySelector('#fornote'));
    const a = await api('GET', '/api/accounts/' + T); assert.ok(!a.records.some(r => r.n === 'יוסי לוי')); assert.ok(!a._foreign);
    assert.strictEqual(await total(Y), 1800); assert.ok((await api('GET', '/api/accounts/' + Y)).records.some(r => r.n === 'יוסי לוי'));
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
