// בדיקת מחיקה מכרטיס לווה תחת ״משויכים לכמה גובים״: ״מחק שורה״ מהפירוט ו״מחק את כל החוב מהרשימה״.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8430, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-bd-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 400)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const login = async (c) => { const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis'); return p; };
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });   // הכול באייפון
  const p = await login(ctx);
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const R = (n, a, c, t, note) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t: t || '', note: note || '', cnt: 1, side: false });
  // כרטיס לקוח והלוואה של עידן — חייבים להישאר
  await api('POST', '/api/docs/clients', { id: 'cl-idan', data: { name: 'עידן חגג', phone: '0501234567' }, opId: 'cl' });
  const clientBefore = JSON.stringify((await api('GET', '/api/docs/clients/cl-idan')));
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-22', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [
    R('עידן חגג', 7900, 'טל', '', 'לבקש מזומן'), R('אור פהר', 1000, 'טל', '10:00', 'הערה ידנית'), R('עידן חגג', 725, 'רובי'), R('אור פהר', 500, 'טל', '11:00'), R('אור פהר', 300, 'רובי'), R('שירה לוי', 900, 'רובי') ] };
    ['prev', '_version', '_updatedAt', '_updatedBy', '_times', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'fill' }); }
  const acc = () => api('GET', '/api/accounts/' + SP);
  const mgp = (nm) => p.locator('#spt-lists .mgp', { hasText: nm });
  const sub = async (c) => (await p.locator('#spt-lists .sub', { hasText: 'סה״כ ' + c + ':' }).innerText()).trim();

  await step('הכנה: איחוד הלווים — עידן חגג 8,625 ₪ (טל 7,900 | רובי 725)', async () => {
    await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#mgbtn'); await p.click('#mgbtn'); await p.click('#mgmark'); await p.click('#mgall'); await p.waitForSelector('#spt-lists .mgp');
    assert.ok((await mgp('עידן חגג').innerText()).includes('8,625')); assert.ok((await p.locator('.mgph').innerText()).includes('· 2'));
  });
  await step('״מחק את כל החוב מהרשימה״ גלוי בכותרת הכרטיס גם כשהפירוט סגור (באייפון)', async () => {
    const bt = mgp('עידן חגג').locator('[data-mgdelall]'); assert.ok(await bt.isVisible()); const bx = await bt.boundingBox(); assert.ok(bx.x >= 0 && bx.x + bx.width <= 391 && bx.height >= 36, JSON.stringify(bx));
  });
  await step('״מחק שורה״ בפירוט: אישור עם שם הלווה, הגובה והסכום; ״ביטול״ לא מוחק', async () => {
    await mgp('עידן חגג').locator('[data-mgfull]').click(); await p.waitForSelector('#spt-lists .mgfull');
    const del = mgp('עידן חגג').locator('.mgfull tr', { has: p.locator('option[selected]', { hasText: 'רובי' }) }).locator('[data-mgdel]');
    const bx = await del.boundingBox(); assert.ok(bx && bx.x >= 0 && bx.x + bx.width <= 391, 'הכפתור נראה באייפון: ' + JSON.stringify(bx));
    await del.click(); await p.waitForSelector('#dlok'); const t = await p.locator('#sheet').innerText();
    assert.ok(t.includes('עידן חגג') && t.includes('רובי') && t.includes('725') && t.includes('מחק שורה') && t.includes('ביטול'), t);
    await p.click('#dlno'); assert.strictEqual((await acc()).records.length, 6);
  });
  await step('מחיקת השורה של רובי: סה״כ 7,900; עידן עובר לרשימה של טל; מספר הלווים בקבוצה וסיכום רובי מתעדכנים', async () => {
    const rubiBefore = await sub('רובי');
    await mgp('עידן חגג').locator('.mgfull tr', { has: p.locator('option[selected]', { hasText: 'רובי' }) }).locator('[data-mgdel]').click(); await p.click('#dlok');
    await p.waitForFunction(() => ![...document.querySelectorAll('#spt-lists .mgp')].some(x => x.textContent.includes('עידן חגג')));
    assert.ok((await p.locator('.mgph').innerText()).includes('· 1'));
    const tal = p.locator('#spt-lists .pl', { hasText: 'עידן חגג' }); assert.strictEqual(await tal.count(), 1); assert.ok((await tal.innerText()).includes('7,900'));
    assert.ok(rubiBefore.includes('1,925') && (await sub('רובי')).includes('1,200'), rubiBefore + ' → ' + await sub('רובי'));
    const a = await acc(); const idan = a.records.filter(r => r.n === 'עידן חגג'); assert.strictEqual(idan.length, 1); assert.strictEqual(idan[0].c, 'טל'); assert.ok(!idan[0].mg); assert.strictEqual(idan[0].note, 'לבקש מזומן', 'ההערה הידנית נשמרה');
  });
  await step('שתי שורות של אותו גובה: נמחקת רק השורה שנבחרה', async () => {
    await mgp('אור פהר').locator('[data-mgfull]').click(); await p.waitForSelector('#spt-lists .mgp .mgfull');
    const row500 = mgp('אור פהר').locator('.mgfull tr', { has: p.locator('[data-mga][value="500"]') }); await row500.locator('[data-mgdel]').click(); await p.click('#dlok');
    await p.waitForFunction(() => [...document.querySelectorAll('#spt-lists .mgp')].some(x => x.textContent.includes('אור פהר') && x.textContent.includes('1,300')));
    assert.strictEqual((await mgp('אור פהר').locator('.mgp-notes').innerText()).trim(), 'טל 1,000 ₪ | רובי 300 ₪');
    const a = await acc(); const or = a.records.filter(r => r.n === 'אור פהר'); assert.deepStrictEqual(or.map(r => r.a).sort(), [1000, 300].sort()); assert.ok(or.find(r => r.a === 1000).note === 'הערה ידנית');
  });
  await step('״מחק את כל החוב מהרשימה״ (פירוט סגור, עם סינון טקסט): מציג שורות, סכום לכל גובה וסה״כ; רק באישור מוחק', async () => {
    if (await mgp('אור פהר').locator('.mgfull').count()) await mgp('אור פהר').locator('[data-mgfull]').click();
    await p.fill('#fq', 'אור'); await p.waitForTimeout(500);
    await mgp('אור פהר').locator('[data-mgdelall]').click(); await p.waitForSelector('#daok'); const t = await p.locator('#sheet').innerText();
    assert.ok(t.includes('אור פהר') && t.includes('2 שורות') && /טל\s+1,000 ₪/.test(t) && /רובי\s+300 ₪/.test(t) && t.includes('1,300'), t);
    await p.click('#dano'); assert.strictEqual((await acc()).records.filter(r => r.n === 'אור פהר').length, 2);
    await mgp('אור פהר').locator('[data-mgdelall]').click(); await p.click('#daok'); await p.waitForTimeout(600);
    await p.fill('#fq', ''); await p.waitForTimeout(400);
    assert.strictEqual(await p.locator('#spt-lists .mgp').count(), 0); assert.strictEqual(await p.locator('#spt-lists', { hasText: 'אור פהר' }).count(), 0);
    const a = await acc(); assert.deepStrictEqual(a.records.map(r => r.n + ':' + r.a).sort(), ['עידן חגג:7900', 'שירה לוי:900'].sort());
  });
  await step('אחרי ״שמור שינויים״, רענון ולחיצה על ״איחוד חובות לפי לווה״ — השורות שנמחקו לא חוזרות', async () => {
    await p.click('#ssave'); await p.reload(); await p.waitForSelector('#spt-lists');
    await p.click('#mgbtn'); await p.waitForTimeout(300); assert.strictEqual(await p.locator('#sheet:not([hidden]) #mgall').count(), 0);
    const a = await acc(); assert.strictEqual(a.records.length, 2); assert.ok(!(await p.locator('#spt-lists').innerText()).includes('אור פהר'));
    assert.ok((await sub('טל')).includes('7,900') && (await sub('רובי')).includes('900'));
  });
  await step('כרטיס הלקוח לא השתנה, ואין שגיאות דף', async () => {
    assert.strictEqual(JSON.stringify(await api('GET', '/api/docs/clients/cl-idan')), clientBefore);
    await p.screenshot({ path: path.join(os.tmpdir(), 'borrower-delete-iphone.png') }); assert.deepStrictEqual(p.errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
