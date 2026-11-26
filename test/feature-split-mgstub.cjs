// בדיקה: בפיצול ״כל הגובים״ — גובה שכל הלקוחות שלו הם חלק מחוב מאוחד (״לא קשור אלי · 1״, 500 ₪) מציג את שם הלקוח והסכום,
// עם ״הצג ↑״ שמוביל לחוב המאוחד תחת ״משויכים לכמה גובים״. הסכומים לא משתנים.
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8567, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-mgs-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 600)); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const R = (n, a, c, x = {}) => ({ n, fn: n.split(' ')[0], ln: n.split(' ').slice(1).join(' '), ph: '', a, c, t: '', note: '', cnt: 1, side: false, ...x });
  const { id: SP } = await api('POST', '/api/accounts', { kind: 'split', date: '2026-11-26', opId: 'mk' });
  { const a = await api('GET', '/api/accounts/' + SP); const data = { ...a, records: [
    R('ליאור גושן', 11200, 'צחי'), R('דייב פרוזיאן', 750, 'צחי'), R('יוסי מזרחי', 500, 'לא קשור אלי', { mg: 'g1' }), R('יוסי מזרחי', 1200, 'צחי', { mg: 'g1' }),
    R('שלום בילבי', 300, 'אושר 2'), R('רון לוי', 2600, 'אושר') ] };
    ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete data[k]); await api('PUT', '/api/accounts/' + SP, { data, baseVersion: a._version, opId: 'fill' }); }
  const block = (c) => p.evaluate((c) => { const L = document.querySelector('#spt-lists'); const out = []; let on = false; for (const el of L.children) { if (el.classList.contains('ph') && !el.classList.contains('mgph')) on = el.textContent.trim().startsWith(c + ' ·'); else if (el.classList.contains('ph')) on = false; if (on) out.push(el.textContent.replace(/\s+/g, ' ').trim()); if (on && el.classList.contains('sub') && el.textContent.includes('סה״כ ' + c + ':')) on = false; } return out.join(' | '); }, c);
  await p.goto(URL + '/#/acc/' + SP); await p.waitForSelector('#spt-lists .mgp');

  await step('״לא קשור אלי · 1״ — 500 ₪: מוצג שם הלקוח והסכום (חלק מחוב מאוחד), לא כרטיס ריק', async () => {
    const t = await block('לא קשור אלי'); console.log('   ', t);
    assert.ok(t.includes('לא קשור אלי · 1') && t.includes('יוסי מזרחי') && t.includes('500') && t.includes('חוב מאוחד') && t.includes('סה״כ לא קשור אלי: 500'), t);
    const tz = await block('צחי'); assert.ok(tz.includes('יוסי מזרחי') && tz.includes('ליאור גושן') && tz.includes('סה״כ צחי: 13,150'), tz);
  });
  await step('״הצג ↑״ מוביל לחוב המאוחד של יוסי מזרחי למעלה (1,700 ₪); השורה לא נספרת פעמיים', async () => {
    await p.locator('#spt-lists .mgstub', { hasText: 'יוסי מזרחי' }).first().locator('[data-mgjump]').click();
    const box = p.locator('#spt-lists .mgp', { hasText: 'יוסי מזרחי' });
    assert.ok(await box.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && el.classList.contains('flash'); }), 'בתוך המסך ומודגש');
    assert.match(await box.innerText(), /1,700/);
    assert.strictEqual(await p.locator('#spt-lists .mgp').count(), 1);
  });
  await step('בסינון לפי גובה (״לא קשור אלי״) השורה המלאה מוצגת לעריכה כרגיל; אין שגיאות דף', async () => {
    await p.click('.chip[data-c="לא קשור אלי"]'); await p.waitForTimeout(300);
    const t = await block('לא קשור אלי'); assert.ok(t.includes('יוסי מזרחי') && !t.includes('הצג ↑'), t);
    assert.strictEqual(await p.locator('#spt-lists .pl:not(.mgstub)', { hasText: 'יוסי מזרחי' }).locator('input.tm').count(), 1);
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
