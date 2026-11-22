// בדיקת ״מחק גבייה״ ברשימת איסוף יום — הדוגמה: אצל בן צפוי 10,980 ₪ (6 לקוחות), נגבה 0; מוחקים את מרקוס דפס 1,130 ₪ לשעה 16:00.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8440, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ed-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (c) => { const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await login(ctx);
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const E = (n, a, c, t, p) => ({ n, p: p || '', a, c, t: t || '', s: '' });
  await api('POST', '/api/docs/clients', { id: 'cl-m', data: { name: 'מרקוס דפס', phone: '0501111111' }, opId: 'cl' });
  const client0 = JSON.stringify(await api('GET', '/api/docs/clients/cl-m'));
  const { id: W } = await api('POST', '/api/accounts', { kind: 'work', date: '2026-11-22', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + W); const data = { ...a, entries: [
    E('אבי כהן', 2000, 'בן', '10:00', '0502222222'), E('מרקוס דפס', 1130, 'בן', '16:00', '0501111111'), E('דנה לוי', 2500, 'בן', '11:00'), E('יוסי פרץ', 1850, 'בן', '12:00'),
    E('רון שמש', 1500, 'בן', '13:00'), E('גלית בר', 2000, 'בן', '14:00'), E('מרקוס דפס', 700, 'אבי', '09:00', '0501111111'), E('שירה לוי', 400, 'אבי', '15:00') ], expenses: [] };
    ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + W, { data, baseVersion: a._version, opId: 'fill' }); }
  const card = (c) => p.locator('.card').filter({ has: p.locator('h2', { hasText: new RegExp('^' + c + '$') }) });
  const nums = async (c) => { const t = await card(c).innerText(); const g = (l) => { const m = new RegExp(l + '\\s*\\n?\\s*([\\d,.]+) ₪').exec(t); return m ? m[1] : null; }; return { cnt: (/(\d+) לקוחות/.exec(t) || [])[1], exp: g('גבייה ברוטו \\(צפוי\\)'), got: g('נגבה בפועל'), left: g('נשאר'), t }; };
  const marcusBen = () => p.locator('.card', { has: p.locator('h2', { hasText: /^בן$/ }) }).locator('.li[data-row]', { hasText: 'מרקוס דפס' });

  await step('לפני: אצל בן 6 לקוחות, צפוי 10,980, נגבה 0, נשאר 10,980', async () => {
    await p.goto(URL + '/#/acc/' + W); await p.waitForSelector('[data-delent]');
    const n = await nums('בן'); assert.deepStrictEqual([n.cnt, n.exp, n.got, n.left], ['6', '10,980', '0', '10,980'], n.t);
  });
  await step('בכל שורת גבייה כפתור ״🗑 מחק גבייה״ בתוך השורה, בנפרד מכפתורי הסטטוס, נוח לאייפון', async () => {
    const row = marcusBen(); const del = row.locator('[data-delent]'); assert.ok((await del.innerText()).includes('מחק גבייה'));
    assert.strictEqual(await row.locator('.st [data-delent]').count(), 0, 'לא בתוך כפתורי הסטטוס');
    const bx = await del.boundingBox(); assert.ok(bx.x >= 0 && bx.x + bx.width <= 391 && bx.height >= 40, JSON.stringify(bx));
  });
  await step('חלון אישור עם לקוח, סכום, גובה, תאריך ושעה; ״ביטול״ לא מוחק', async () => {
    await marcusBen().locator('[data-delent]').click(); await p.waitForSelector('#delok');
    const t = await p.locator('#sheet').innerText();
    assert.ok(t.includes('למחוק מרשימת הגביות של בן את הגבייה של מרקוס דפס בסך 1,130 ₪ לשעה 16:00?'), t);
    assert.ok(t.includes('22.11.2026') && t.includes('ביטול') && t.includes('מחק גבייה'));
    await p.click('#delno'); assert.strictEqual((await api('GET', '/api/accounts/' + W)).entries.length, 8);
  });
  await step('שמירה שנכשלה: השורה נשארת והודעה מאפשרת לנסות שוב', async () => {
    await p.route('**/del-entry', r => r.abort());
    await marcusBen().locator('[data-delent]').click(); await p.click('#delok'); await p.waitForSelector('#delerr .note.err');
    assert.ok((await p.locator('#delerr').innerText()).includes('לנסות שוב')); assert.strictEqual(await marcusBen().count(), 1);
    assert.ok((await p.locator('#hsave + [data-savest]').innerText()).includes('השמירה נכשלה'));
    await p.unroute('**/del-entry');
  });
  await step('אישור (ניסיון שני): הצפי והנשאר יורדים ל-9,850, נגבה 0, לקוחות 6→5; שעת השמירה רק אחרי הצלחה', async () => {
    await p.click('#delok'); await p.waitForFunction(() => document.querySelector('#sheet').hidden);
    const n = await nums('בן'); assert.deepStrictEqual([n.cnt, n.exp, n.got, n.left], ['5', '9,850', '0', '9,850'], n.t);
    assert.strictEqual(await marcusBen().count(), 0);
    await p.waitForFunction(() => /נשמר בשעה/.test(document.querySelector('#hsave + [data-savest]').textContent));
  });
  await step('רק השורה שנבחרה: הגבייה של מרקוס אצל אבי, כרטיס הלקוח ושאר הגביות נשארים', async () => {
    const a = await api('GET', '/api/accounts/' + W); assert.strictEqual(a.entries.length, 7);
    const m = a.entries.filter(x => x.n === 'מרקוס דפס'); assert.strictEqual(m.length, 1); assert.strictEqual(m[0].c, 'אבי');
    assert.strictEqual(JSON.stringify(await api('GET', '/api/docs/clients/cl-m')), client0);
    assert.ok((await card('אבי').innerText()).includes('מרקוס דפס'));
  });
  await step('״כל הגובים״, חיפוש ווואטסאפ: השורה לא מופיעה; עם סינון ״בן״ הסיכומים נכונים', async () => {
    const kp = await p.locator('.kpis .kpi .v').first().innerText(); assert.ok(kp.includes('10,950'), 'צפוי היום = 9,850 + 1,100: ' + kp);
    await p.fill('#fq', 'מרקוס'); await p.waitForTimeout(500);
    assert.strictEqual(await p.locator('.li[data-row]', { hasText: 'מרקוס דפס' }).count(), 1, 'רק השורה אצל אבי');
    await p.fill('#fq', ''); await p.waitForTimeout(400);
    await p.click('.chip[data-c="בן"]'); await p.waitForTimeout(200);
    const n = await nums('בן'); assert.deepStrictEqual([n.cnt, n.exp], ['5', '9,850']);
    await p.check('#selall'); assert.ok((await p.locator('#sendpriv').innerText()).includes('5 שורות'), await p.locator('#sendpriv').innerText());
    await p.uncheck('#selall'); await p.click('.chip[data-c=""]');
  });
  await step('אחרי רענון ופתיחה מחדש — השורה נשארת מחוקה; מחיקה חוזרת לא מוחקת עוד שורה', async () => {
    await p.reload(); await p.waitForSelector('[data-delent]'); assert.strictEqual(await marcusBen().count(), 0);
    const a0 = await api('GET', '/api/accounts/' + W); const k = 'nope';
    const r = await api('POST', `/api/accounts/${W}/del-entry`, { key: k, opId: 'x1' }); assert.ok(r.already);
    assert.strictEqual((await api('GET', '/api/accounts/' + W)).entries.length, a0.entries.length);
    await p.screenshot({ path: path.join(os.tmpdir(), 'entry-delete-iphone.png') }); assert.deepStrictEqual(p.errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
