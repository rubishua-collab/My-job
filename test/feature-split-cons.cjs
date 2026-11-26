// בדיקת קבלה: ״שורה אחת לכל לקוח״ בפיצול — ייבוא אקסל, ״ללא גובה״, בחירת גובה בשורה, ״פירוט חובות״, ייבוא חוזר, איסוף יום,
// ואיחוד הרשימה שכבר נטענה (אייפון).
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8568, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-cons-')), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-cons-f-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const XL = [
  ['מסך דו"ח ראשי'],
  ['שם פרטי', 'שם משפחה', 'יתרה', 'סוכן', 'טלפון נייד', 'קשה'],
  ['דוד', 'לוי', 1000, 'טל', '0503333333', ''],
  ['רון', 'כהן', 700, 'טל', '', ''],
  ['שרה', 'מור', 1200, 'רובי', '', ''],
  ['יוסי', 'אבו', 800, 'טל', '0501111111', ''],
  ['דוד', 'לוי', 2500, 'רובי', '', 'קשה'],
  ['רון', 'כהן', 300, 'טל', '', ''],
  ['יוסי', 'אבו', 400, 'רובי', '0502222222', ''],
  ['דוד', 'לוי', 500, 'אושר', '', ''],
];
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const makeXlsx = async (name, aoa) => { const b64 = await p.evaluate(async (aoa) => { if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'גיליון1'); return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }); }, aoa); const f = path.join(TMP, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
  const DATE = '2026-11-27';
  const { id: S } = await api('POST', '/api/accounts', { kind: 'split', date: DATE, opId: 'mk' });
  const recs = async () => (await api('GET', '/api/accounts/' + S)).records;
  const byName = async (n) => (await recs()).filter(r => r.n === n);
  const block = (c) => p.evaluate((c) => { const L = document.querySelector('#spt-lists'); const out = []; let on = false; for (const el of L.children) { if (el.classList.contains('ph')) on = el.textContent.trim().startsWith(c + ' ·'); if (on) out.push(el.textContent.replace(/\s+/g, ' ').trim()); if (on && el.classList.contains('sub') && el.textContent.includes('סה״כ ' + c + ':')) on = false; } return out.join(' | '); }, c);
  const subOf = async (c) => { const t = await block(c); const m = /סה״כ [^:]+: ([\d,]+)/.exec(t.split(' | ').pop() || ''); return m ? +m[1].replace(/,/g, '') : 0; };
  const cntOf = async (c) => { const t = await block(c); const m = new RegExp(c.replace(/[()]/g, '\\$&') + ' · (\\d+)').exec(t); return m ? +m[1] : 0; };
  const importFile = async () => {
    await p.goto(URL + '/#/acc/' + S + '?edit=1'); await p.waitForSelector('button[data-eact]');
    await p.click('button[data-eact]:has-text("קליטה מקובץ אקסל")'); await p.setInputFiles('#imp-file', await makeXlsx('main.xlsx', XL));
    await p.waitForSelector('#imp-st'); await p.waitForFunction(() => /שורה אחת לכל לקוח/.test(document.querySelector('#imp-st')?.textContent || ''));
    const st = await p.innerText('#imp-st');
    await p.click('#sp-imp-ok');
    // יוסי אבו: אותו שם, שני טלפונים שונים — שאלה לפני איחוד; עונים ״לא, אנשים שונים״ (ברירת המחדל)
    let ask = ''; if (await p.waitForSelector('#mgok', { timeout: 2500 }).catch(() => null)) { ask = await p.innerText('#sheet'); await p.click('#mgok'); }
    await p.waitForSelector('#ed-save'); await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/); await p.waitForSelector('#spt-lists', { state: 'attached' });
    return { st, ask };
  };
  let before;

  await step('ייבוא: דוד לוי (3 שורות אצל טל, רובי ואושר) — שורה אחת של 4,000 ₪ תחת ״ללא גובה״; רון כהן (פעמיים אצל טל) — שורה אחת אצל טל; יוסי אבו — שאלה, ונשארים נפרדים', async () => {
    const { st, ask } = await importFile();
    assert.ok(ask, 'נשאלה שאלה על יוסי אבו');
    assert.ok(st.includes('3 לקוחות הופיעו בכמה שורות') || st.includes('לקוחות הופיעו בכמה שורות'), st);
    assert.ok(ask.includes('יוסי אבו') && ask.includes('0501111111') && ask.includes('0502222222'), ask);
    const d = await byName('דוד לוי'); assert.strictEqual(d.length, 1); assert.strictEqual(d[0].a, 4000); assert.strictEqual(d[0].c, ''); assert.strictEqual(d[0].cons, 1);
    assert.deepStrictEqual(d[0].src.map(x => [x.a, x.c]), [[1000, 'טל'], [2500, 'רובי'], [500, 'אושר']]); assert.strictEqual(d[0].h, 'קשה'); assert.strictEqual(d[0].ph, '0503333333');
    const r = await byName('רון כהן'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].a, 1000); assert.strictEqual(r[0].c, 'טל');
    const y = await byName('יוסי אבו'); assert.strictEqual(y.length, 2); assert.deepStrictEqual(y.map(x => x.c).sort(), ['טל', 'רובי']);
    assert.ok((await block('ללא גובה (להשלים)')).includes('דוד לוי'), await block('ללא גובה (להשלים)'));
    assert.strictEqual((await p.locator('#spt-lists .pl', { hasText: 'דוד לוי' }).count()), 1, 'פעם אחת במסך');
    before = { tal: await subOf('טל'), ruby: await subOf('רובי'), noc: await subOf('ללא גובה (להשלים)'), talN: await cntOf('טל'), rubyN: await cntOf('רובי') };
    assert.deepStrictEqual(before, { tal: 1800, ruby: 1600, noc: 4000, talN: 2, rubyN: 2 });
  });
  await step('״פירוט חובות״ ליד הסכום: כל שורת מקור — סכום, הגובה שהופיע באקסל — והסה״כ 4,000', async () => {
    await p.locator('#spt-lists .pl', { hasText: 'דוד לוי' }).locator('[data-consd]').click();
    await p.waitForSelector('.consd-t'); const t = await p.innerText('.consd-t');
    assert.ok(/1,000[\s\S]*טל/.test(t) && /2,500[\s\S]*רובי/.test(t) && /500[\s\S]*אושר/.test(t) && /סה״כ\s*4,000/.test(t), t);
    await p.click('#sheet [data-close]');
  });
  await step('בחירת רובי בתפריט הגובים בשורה: כל 4,000 עוברים לרובי; הסכום ומספר החייבים מתעדכנים מיד; שינוי לטל — כל השורה עוברת', async () => {
    const k = (await byName('דוד לוי'))[0]._k;
    await p.selectOption(`#spt-lists [data-mv="${k}"]`, 'רובי'); await p.waitForFunction(() => /רובי · 3/.test(document.querySelector('#spt-lists').textContent));
    assert.strictEqual(await subOf('רובי'), before.ruby + 4000); assert.strictEqual(await cntOf('רובי'), before.rubyN + 1);
    assert.ok(!(await block('ללא גובה (להשלים)')).includes('דוד לוי'));
    await p.selectOption(`#spt-lists [data-mv="${k}"]`, 'טל'); await p.waitForFunction(() => /טל · 3/.test(document.querySelector('#spt-lists').textContent));
    assert.strictEqual(await subOf('טל'), before.tal + 4000); assert.strictEqual(await cntOf('טל'), 3); assert.strictEqual(await subOf('רובי'), before.ruby); assert.strictEqual(await cntOf('רובי'), 2);
    const d = (await byName('דוד לוי'))[0]; assert.strictEqual(d.c, 'טל'); assert.strictEqual(d.a, 4000);
  });
  await step('אחרי רענון וייבוא חוזר של אותו קובץ: דוד לוי נשאר אצל טל, פעם אחת, והסכומים זהים', async () => {
    await p.reload(); await p.waitForSelector('#spt-lists', { state: 'attached' }); assert.strictEqual(await subOf('טל'), before.tal + 4000);
    await importFile();
    const d = await byName('דוד לוי'); assert.strictEqual(d.length, 1); assert.strictEqual(d[0].c, 'טל'); assert.strictEqual(d[0].a, 4000);
    const all = await recs(); assert.strictEqual(all.length, 5); assert.strictEqual(all.reduce((s, r) => s + r.a, 0), 1000 + 700 + 1200 + 800 + 2500 + 300 + 400 + 500);
    assert.strictEqual(await subOf('טל'), before.tal + 4000); assert.strictEqual(await subOf('רובי'), before.ruby);
  });
  await step('איסוף יום ורשימה לגובה: דוד לוי פעם אחת, 4,000 ₪, אצל טל; עם הערת הפירוט', async () => {
    const a = await api('GET', '/api/accounts/' + S);
    await api('POST', '/api/split-tools/xfer', { splitId: S, date: DATE, baseVersion: a._version, entries: a.records.map(r => ({ sid: r._k, n: r.n, a: r.a, c: r.c, t: '10:00' })), opId: 'x1' });
    const W = (await api('GET', '/api/accounts?kind=work'))[0].id; const w = await api('GET', '/api/accounts/' + W);
    const dv = w.entries.filter(e => e.n === 'דוד לוי'); assert.strictEqual(dv.length, 1); assert.strictEqual(dv[0].a, 4000); assert.strictEqual(dv[0].c, 'טל');
    assert.strictEqual(w.entries.reduce((s, e) => s + e.a, 0), 7400);
    const txt = await p.evaluate(async (id) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return m.wCollText(a, 'טל'); }, W);
    assert.strictEqual(txt.split('דוד לוי').length - 1, 1, txt); assert.ok(!(await p.evaluate(async (id) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return m.wCollText(a, 'רובי'); }, W)).includes('דוד לוי'));
  });
  await step('איחוד הרשימה שכבר נטענה (״שורה אחת לכל לקוח״): שורות נפרדות של אותו לקוח מתאחדות ל״ללא גובה״; לקוח עם מזהה לקוח מזוהה לפי המזהה', async () => {
    const { id: S2 } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-28', opId: 'mk2' });
    const R = (n, a, c, x = {}) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t: '', note: '', cnt: 1, side: false, ...x });
    { const a = await api('GET', '/api/accounts/' + S2); const data = { ...a, records: [R('מאיר טל', 600, 'טל', { note: 'לבקש צ׳ק' }), R('נועה בר', 900, 'רובי'), R('מאיר טל', 400, 'רובי'), R('אלי כץ', 300, 'טל', { cid: 'C1' }), R('אלי כץ', 200, 'רובי', { cid: 'C1', ph: '0509999999' }), R('אלי כץ', 100, 'אושר', { cid: 'C2' }), R('אלי כץ', 50, 'טל'), R('אלי כץ', 70, 'אושר')] };
      ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + S2, { data, baseVersion: a._version, opId: 'f2' }); }
    await p.goto(URL + '/#/acc/' + S2); await p.waitForSelector('button[data-xact]');
    await p.click('button[data-xact]:has-text("שורה אחת לכל לקוח")');
    await p.waitForSelector('#mgok'); assert.match(await p.innerText('#sheet'), /אלי כץ/); await p.click('#mgok'); // שתי שורות ״אלי כץ״ בלי מזהה לצד C1 ו-C2 — לא ודאי: שואלים; עונים ״אנשים שונים״
    await p.waitForFunction(() => /מאיר טל/.test(document.querySelector('#spt-lists').textContent) && /מאוחד/.test(document.querySelector('#spt-lists').textContent));
    const r2 = (await api('GET', '/api/accounts/' + S2)).records;
    const m = r2.filter(r => r.n === 'מאיר טל'); assert.strictEqual(m.length, 1); assert.strictEqual(m[0].a, 1000); assert.strictEqual(m[0].c, ''); assert.strictEqual(m[0].gnote, 'לבקש צ׳ק');
    const ek = r2.filter(r => r.n === 'אלי כץ');
    const c1 = ek.filter(r => r.cid === 'C1'); assert.strictEqual(c1.length, 1, 'אותו מזהה — אוחד בלי לשאול'); assert.strictEqual(c1[0].a, 500); assert.strictEqual(c1[0].c, '');
    assert.strictEqual(ek.filter(r => r.cid === 'C2').length, 1); assert.strictEqual(ek.filter(r => !r.cid).length, 2, 'בלי מזהה — לא אוחדו בלי אישור');
    assert.strictEqual(r2.reduce((s, r) => s + r.a, 0), 2620);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
