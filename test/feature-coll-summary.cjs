// בדיקה: ״סיכום גובים לסוף היום״ באיסוף יום (אייפון) — נטו למסירה = נגבה בפועל פחות הוצאות; מתעדכן מיד; PDF; ניתוחים ולוח בקרה
// לתאריך בלי חשבון גובים מחושבים מהאיסוף, ולתאריך עם חשבון גובים — מהחשבון כמו קודם.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8571, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-cs-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const numOf = (t) => +String(t).replace(/[^\d.-]/g, '');
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__stage = []; navigator.canShare = () => true; navigator.share = async () => {}; new MutationObserver(() => { const st = document.getElementById('wt-pdf-stage'); if (st && st.innerHTML.length > 50) window.__stage.push(st.innerHTML); }).observe(document, { childList: true, subtree: true }); });
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const strip = (a) => { const d = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); return d; };
  const mk = async (kind, date, f, op) => { const { id } = await api('POST', '/api/accounts', { kind, date, opId: op }); const a = await api('GET', '/api/accounts/' + id); await api('PUT', '/api/accounts/' + id, { data: { ...strip(a), ...f }, baseVersion: a._version, opId: op + 'f' }); return id; };
  const D1 = '2026-11-26', D2 = '2026-11-25';
  const W = await mk('work', D1, { entries: [
    { _k: 'a1', n: 'מאור כשכש', a: 2400, c: 'אושר', t: '17:00', s: 'נאסף' }, { _k: 'a2', n: 'מיכאל אביטבול', a: 1500, c: 'אושר', t: '16:00', s: 'נאסף' },
    { _k: 'r1', n: 'רון בר', a: 1000, c: 'רובי', t: '10:00', s: 'נאסף', ga: 800 }, { _k: 'r2', n: 'גיל אור', a: 500, c: 'רובי', t: '11:00' },
  ], expenses: [{ _k: 'x1', n: 'דלק', a: 900, c: 'אושר' }, { _k: 'x2', n: 'חניה', a: 50, c: 'רפי' }] }, 'w1');
  // יום קודם: יש חשבון גובים (כמו קודם) — הניתוח לוקח ממנו
  await mk('work', D2, { entries: [{ _k: 'b1', n: 'דני', a: 700, c: 'אושר', s: 'נאסף' }] }, 'w2');
  await mk('collectors', D2, { entries: [{ _k: 'c1', n: 'דני', a: 700, c: 'אושר', k: 'd' }, { _k: 'c2', n: 'דלק', a: 100, c: 'אושר', k: 'e' }] }, 'c2');
  const rowOf = (c) => p.locator('#cs-card tbody tr:not(.cs-old)', { hasText: c }).first();
  const vals = async (c) => { const t = await rowOf(c).locator('td.a').allInnerTexts(); return t.map(numOf); }; // נגבה, הוצאות, נטו, נשאר

  await step('איסוף יום: ״סיכום גובים לסוף היום״ — לכל גובה נגבה בפועל, הוצאות, נטו למסירה (= נגבה פחות הוצאות), נשאר; וצפוי פחות הוצאות בקטן', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('#cs-card');
    if (process.env.SHOT) { await p.locator('#cs-card').scrollIntoViewIfNeeded(); await p.locator('#cs-card').screenshot({ path: process.env.SHOT }); }
    assert.deepStrictEqual(await vals('אושר'), [3900, 900, 3000, 0]);
    assert.deepStrictEqual(await vals('רובי'), [800, 0, 800, 700]); // נשאר: גיל אור 500 + 200 שלא נגבו מרון בר (גבייה חלקית)
    assert.deepStrictEqual(await vals('רפי'), [0, 50, -50, 0]);
    const tot = (await p.locator('#cs-card tfoot tr').first().locator('td.a').allInnerTexts()).map(numOf); assert.deepStrictEqual(tot, [4700, 950, 3750, 700]);
    const old = await p.locator('#cs-card tr.cs-old').allInnerTexts(); assert.ok(old[1].includes('1,500') && old[1].includes('התוכנה הקודמת'), old.join('|')); // רובי: צפוי 1,500 פחות 0
    // אותם מספרים כמו בכרטיס הגובה במסך
    assert.strictEqual(numOf(await p.locator('.wgcard[data-wg="אושר"] .wg-net').innerText()), 3000);
  });
  await step('סימון ״נאסף״ על גיל אור — הסיכום מתעדכן מיד בלי לעבור מסך', async () => {
    await p.locator('.li[data-key="r2"] .st button[data-s="נאסף"]').click();
    await p.waitForFunction(() => /1,300/.test([...document.querySelectorAll('#cs-card tbody tr')].find(t => t.textContent.includes('רובי'))?.textContent || ''));
    assert.deepStrictEqual(await vals('רובי'), [1300, 0, 1300, 200]);
  });
  await step('״PDF סיכום גובים לוואטסאפ״ — הקובץ נבנה מהסיכום (טבלה עם נטו למסירה וסה״כ)', async () => {
    await p.click('#cs-pdf'); await p.waitForFunction(() => window.__stage.length > 0, null, { timeout: 60000 });
    const h = await p.evaluate(() => window.__stage[window.__stage.length - 1]);
    assert.ok(h.includes('סיכום גובים לסוף היום') && h.includes('נטו למסירה') && h.includes('4,250') && h.includes('אושר'), 'PDF');
  });
  await step('ניתוחים ״לפי חשבון גובים״: יום בלי חשבון גובים מחושב מהאיסוף (נטו למסירה); יום עם חשבון גובים — מהחשבון כמו קודם', async () => {
    const r = await p.evaluate(async ([from, to]) => { const m = await import('/js/features/imports-xl.js'); const list = await Promise.all((await (await fetch('/api/accounts')).json()).map(a => fetch('/api/accounts/' + a.id).then(x => x.json()))); return m.anCollectors(list, from, to); }, [D2, D1]);
    const o = r.coll.find(x => x.c === 'אושר'); assert.strictEqual(o.total, 700 + 3900); assert.strictEqual(o.exp, 100 + 900); assert.strictEqual(o.net, 3600); assert.strictEqual(o.days, 2);
    const rb = r.coll.find(x => x.c === 'רובי'); assert.strictEqual(rb.net, 1300); assert.strictEqual(r.ncf, 1);
    await p.goto(URL + `/#/analytics?from=${D2}&to=${D1}`); await p.waitForSelector('#an-colls');
    await p.click('[data-coll="coll"]'); await p.waitForSelector('#an-colls'); assert.match(await p.locator('#an-colls').innerText(), /חושבו מהאיסוף היומי/);
  });
  await step('לוח בקרה: שלב ״חשבון גובים״ מסביר שהסיכום מחושב מהאיסוף; אין שגיאות דף', async () => {
    await p.goto(URL + '/#/dashboard'); await p.waitForSelector('.panel, .card');
    const t = await p.locator('#view').innerText(); assert.ok(!t.includes('״העבר לחשבון גובים״ מהאיסוף היומי'), 'אין יותר הנחיה להעביר');
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
