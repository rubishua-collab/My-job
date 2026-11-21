// בדיקת כלי הפיצול: שעות ושיוך, פיצול סכום (✎), פיצול חוב לחלקים, חלוקה אוטומטית והעברה לאיסוף יומי.
// הרצה: BACKUP=path/to/backup.json node test/feature-split-tools.cjs   (פורט 8302, או E2E_PORT)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const BACKUP = process.env.BACKUP || '/tmp/claude-0/-home-user-My-job/07101a7a-eccb-5a25-8245-cb5180d30624/scratchpad/backup/yoman-full-backup-2026-11-21.json';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-spt-'));
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'yoman-spt-shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = +process.env.E2E_PORT || 8302, URL = 'http://localhost:' + PORT;
const SPLIT = 't8uukf1896sndnf6ttno', WORK20 = 'z9mnxtxbzigl56w7b4z1', SPLIT2 = 'hm11r6mbcc6ih18tkdxe', SPLIT3 = 's750rytjret3qewy2qed';
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false }); console.log('✗', name, '\n   ', String(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const sum = a => r2(a.reduce((t, x) => t + (+x || 0), 0));
const num = v => typeof v === 'number' ? v : (parseFloat(String(v || '').replace(/[^\d.\-]/g, '')) || 0);

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: BACKUP };
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 60 && !slog.includes('פועל'); i++) await sleep(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  const api = async (method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const acc = async (id) => (await api('GET', '/api/accounts/' + id)).json;
  const until = async (fn, ms = 8000) => { const t = Date.now(); let last; while (Date.now() - t < ms) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(150); } throw new Error('timeout' + (last instanceof Error ? ': ' + last.message : '')); };
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  const setCollectors = async (want) => {
    for (const cb of await p.locator('#xf-c input[data-xc]').all()) {
      const c = await cb.getAttribute('data-xc'); const on = await cb.isChecked();
      if (on !== want.includes(c)) { await cb.click(); await sleep(120); }
    }
  };
  const previewRows = () => p.$$eval('#xf-l .xfe', els => els.map(el => ({ sid: el.dataset.sid, s: el.dataset.st, n: el.querySelector('[data-pf=n]').value, a: el.querySelector('[data-pf=a]').value, t: el.querySelector('[data-pf=t]').value, c: el.querySelector('[data-pf=c]').value })));
  // החלוקה הטובה ביותר האפשרית עם אותם מספרי חייבים לכל גובה (בדיקה מלאה — לרשימות קטנות)
  const bestGap = (amts, counts) => {
    let best = Infinity; const n = amts.length;
    const rec = (i, left, loads) => { if (i === n) { if (left.every(x => x === 0)) best = Math.min(best, Math.max(...loads) - Math.min(...loads)); return; } for (let k = 0; k < left.length; k++) if (left[k] > 0) { left[k]--; loads[k] += amts[i]; rec(i + 1, left, loads); loads[k] -= amts[i]; left[k]++; } };
    rec(0, counts.slice(), counts.map(() => 0)); return r2(best);
  };

  await step('כניסה', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
  });

  await step('פאנל הפיצול: רישום שעות ליד הלווים נשמר בשרת', async () => {
    await p.goto(URL + '/#/acc/' + SPLIT); await p.waitForSelector('#spt-panel [data-spt]');
    const times = ['9', '10', '10', '11', '9:30'];
    const keys = await p.$$eval('#spt-panel [data-spt]', els => els.map(e => e.dataset.spt));
    assert.strictEqual(keys.length, 5);
    for (let i = 0; i < keys.length; i++) {
      const loc = p.locator(`[data-spt="${keys[i]}"]`); await loc.fill(times[i]); await loc.press('Tab');
      await until(async () => (await acc(SPLIT)).records.find(r => r._k === keys[i])?.t);
      await p.waitForSelector(`[data-spt="${keys[i]}"]`);
    }
    const a = await acc(SPLIT);
    assert.deepStrictEqual(a.records.map(r => r.t).sort(), ['09:00', '09:30', '10:00', '10:00', '11:00']);
    await shot('01-split-panel');
  });

  let preview = [];
  await step('מסך העברה: חלוקה אוטומטית — מספר חייבים שווה, סכומים מאוזנים, שעות שוות מופרדות ב-15 דקות', async () => {
    await p.goto(URL + '/#/xfer/' + SPLIT); await p.waitForSelector('#xf-l .xfe');
    await setCollectors(['רובי', 'טל']);
    await p.fill('#xf-date', '2026-11-20'); await p.dispatchEvent('#xf-date', 'change');
    await until(async () => (await p.textContent('#xf-n')).includes('20.11.2026'));
    await p.click('[data-pvre]'); await sleep(300);
    preview = await previewRows();
    assert.strictEqual(preview.length, 5);
    const by = c => preview.filter(e => e.c === c);
    const nR = by('רובי').length, nT = by('טל').length;
    assert.strictEqual(nR + nT, 5, 'כל השורות שויכו'); assert.ok(Math.abs(nR - nT) <= 1, 'הפרש מספר חייבים ' + nR + '/' + nT);
    const gap = Math.abs(sum(by('רובי').map(e => num(e.a))) - sum(by('טל').map(e => num(e.a))));
    const amts = preview.map(e => num(e.a)); const opt = bestGap(amts, [nR, nT]);
    assert.strictEqual(r2(gap), opt, 'הפרש ' + gap + ' לעומת המיטבי ' + opt);
    for (const c of ['רובי', 'טל']) { const ts = by(c).map(e => e.t).filter(Boolean); assert.strictEqual(new Set(ts).size, ts.length, 'שעות כפולות אצל ' + c + ': ' + ts); }
    // השיוך נשמר בשורה בפיצול (xs)
    await until(async () => (await acc(SPLIT)).records.every(r => r.xs && ['רובי', 'טל'].includes(r.c)));
    const co = (await api('GET', '/api/docs/settings/coll')).json; assert.deepStrictEqual([...co.sel].sort(), ['טל', 'רובי']);
    await shot('02-xfer-preview');
  });

  await step('העברה בלחיצה כפולה: נכנס פעם אחת, הסכומים נשמרים, הפיצול מתרוקן ל-xstash', async () => {
    const before = await acc(WORK20); const n0 = before.entries.length;
    const sp0 = await acc(SPLIT); const tot = sum(sp0.records.map(r => r.a));
    await p.dblclick('#xf-go');
    await p.waitForURL(/#\/acc\/z9mnx/, { timeout: 10000 });
    await sleep(800);
    const w = await acc(WORK20); assert.strictEqual(w.entries.length, n0 + 5, 'שורות: ' + w.entries.length);
    const added = w.entries.slice(n0);
    assert.strictEqual(sum(added.map(e => e.a)), tot);
    assert.deepStrictEqual(added.map(e => e.n + '|' + e.a + '|' + e.c + '|' + e.t).sort(), preview.map(e => e.n + '|' + num(e.a) + '|' + e.c + '|' + e.t).sort());
    added.forEach(e => assert.ok(e._k && e.s === '' && 'p' in e));
    const works = (await api('GET', '/api/accounts?kind=work')).json.filter(x => x.date === '2026-11-20'); assert.strictEqual(works.length, 1, 'לא נפתחה רשימה נוספת');
    const sp = await acc(SPLIT); assert.strictEqual(sp.records.length, 0); assert.strictEqual(sp.xstash.length, 5);
    await shot('03-work-after-xfer');
  });

  await step('אפס העברה מחזיר את השורות לפיצול', async () => {
    await p.goto(URL + '/#/acc/' + SPLIT); await p.waitForSelector('#spt-reset'); await p.click('#spt-reset');
    await until(async () => (await acc(SPLIT)).records.length === 5);
    assert.strictEqual((await acc(SPLIT)).xstash.length, 0);
  });

  let allBefore;
  await step('פיצול חוב לחלקים: סכום החלקים = החוב, ״חלק 1/2״, סה״כ הפיצול לא משתנה', async () => {
    allBefore = (await api('GET', '/api/accounts?kind=split')).json.find(x => x.id === SPLIT2).headline.extra.all;
    await p.goto(URL + '/#/xfer/' + SPLIT2); await p.waitForSelector('#xf-l .xfe');
    const row = p.locator('#xf-l .xfe').filter({ has: p.locator('[data-pf=n][value="עמי מלול"]') });
    await row.locator('[data-cut-open]').click(); await p.waitForSelector('[data-cut-box]');
    await p.fill('[data-cut-a="0"]', '5000');
    assert.strictEqual(await p.inputValue('[data-cut-a="1"]'), '7150');
    await shot('04-cut');
    await p.click('[data-cut-go]');
    const parts = await until(async () => { const l = (await acc(SPLIT2)).records.filter(r => r.n === 'עמי מלול'); return l.length === 2 ? l : null; });
    assert.strictEqual(sum(parts.map(r => r.a)), 12150);
    assert.ok(parts[0].pg && parts[0].pg === parts[1].pg); assert.deepStrictEqual(parts.map(r => r.pp).sort(), ['1/2', '2/2']);
    const allAfter = (await api('GET', '/api/accounts?kind=split')).json.find(x => x.id === SPLIT2).headline.extra.all;
    assert.strictEqual(allAfter, allBefore);
    await p.waitForSelector('#xf-l .spl');
  });

  await step('פיצול סכום בין גובים (✎): ״נאסף כבר״ נרשם בהערה ונכנס כשורה ״נאסף״ בהעברה', async () => {
    await p.goto(URL + '/#/acc/' + SPLIT2); await p.waitForSelector('#spt-lists');
    const k = (await acc(SPLIT2)).records.find(r => r.n === 'רפי מימון')._k;
    await p.click(`[data-spx-open="${k}"]`); await p.waitForSelector('[data-spx] [data-xs=got]');
    await p.fill('[data-spx] [data-xs=got]', '1000'); await p.selectOption('[data-spx] [data-xs=gotc]', 'רובי');
    await p.click('[data-spx] [data-xsplit]');
    const r = await until(async () => { const x = (await acc(SPLIT2)).records.find(y => y._k === k); return x && x.a === 2000 ? x : null; });
    assert.ok(/נאסף כבר 1,000 ₪ ע״י רובי/.test(r.note), r.note); assert.ok(r.px);
    const allAfter = (await api('GET', '/api/accounts?kind=split')).json.find(x => x.id === SPLIT2).headline.extra.all;
    assert.strictEqual(allAfter, r2(allBefore - 1000));
  });

  await step('העברה לתאריך חדש: נפתח איסוף יום, הסכומים נשמרים, החלוקה מאוזנת, שורות ששויכו מראש נשארות אצל הגובה שלהן', async () => {
    const sp0 = await acc(SPLIT2);
    await p.goto(URL + '/#/xfer/' + SPLIT2); await p.waitForSelector('#xf-l .xfe');
    await setCollectors(['רובי', 'טל']);
    await p.fill('#xf-date', '2026-12-01'); await p.dispatchEvent('#xf-date', 'change');
    await p.click('[data-pvre]'); await sleep(500);
    const pv = await previewRows();
    const timed = sp0.records.filter(r => !r.side && r.c !== 'לשנות' && r.n && (r.t || r.na));
    // שורות ״#g״: ״נאסף כבר״ / ״לא נאסף עדיין״ מתוך ההערה
    const extra = timed.map(r => { const m = /(?:נאסף כבר|לא נאסף עדיין)\s*([\d,\.]+)\s*₪(?:\s*ע[״"]י\s*([^·]+))?/.exec(r.note || ''); return m && m[2] && (!r.pg || /^1\//.test(r.pp || '')) ? +m[1].replace(/,/g, '') : 0; }).filter(Boolean);
    assert.strictEqual(pv.length, timed.length + extra.length, 'שורות בתצוגה ' + pv.length);
    assert.strictEqual(sum(pv.map(e => num(e.a))), r2(sum(timed.map(r => r.a)) + sum(extra)));
    // שורות ששויכו מראש בפיצול (חלק עם גובה, ״נאסף כבר״, ״#g״) נשארות אצל הגובה שלהן; השאר מתחלקות, וספירת החייבים (כולל ״נאסף״) שווה עד הפרש של אחד
    const recBy = new Map(sp0.records.map(r => [r._k, r]));
    const sp1 = await acc(SPLIT2); sp1.records.forEach(r => recBy.set(r._k, r));
    const isPre = e => /#g$/.test(e.sid) || (recBy.get(e.sid) && (recBy.get(e.sid).px || /נאסף כבר/.test(recBy.get(e.sid).note || '')));
    const pool = pv.filter(e => !isPre(e));
    assert.ok(pool.every(e => e.c === 'רובי' || e.c === 'טל'), 'שורות שלא שויכו');
    const cnt = c => pv.filter(e => e.c === c && (!isPre(e) || e.s === 'נאסף')).length;
    assert.ok(Math.abs(cnt('רובי') - cnt('טל')) <= 1, 'הפרש מספר חייבים ' + cnt('רובי') + '/' + cnt('טל'));
    assert.ok(pv.filter(isPre).every(e => e.c), 'שורה ששויכה מראש איבדה גובה');
    await shot('05-xfer2-preview');
    await p.click('#xf-go'); await p.waitForURL(/#\/acc\//, { timeout: 10000 }); await sleep(500);
    const works = (await api('GET', '/api/accounts?kind=work')).json.filter(x => x.date === '2026-12-01'); assert.strictEqual(works.length, 1);
    const w = await acc(works[0].id);
    assert.strictEqual(w.entries.length, pv.length); assert.strictEqual(sum(w.entries.map(e => e.a)), sum(pv.map(e => num(e.a))));
    assert.deepStrictEqual(w.entries.filter(e => e.n === 'עמי מלול').map(e => e.pp).sort(), ['1/2', '2/2']);
    assert.ok(w.entries.some(e => e.n === 'רפי מימון' && e.a === 1000 && e.s === 'נאסף' && e.c === 'רובי'));
    assert.ok(w.entries.some(e => e.n === 'דקל אלגריסי' && e.a === 51200 && e.s === 'לא נאסף'));
    const sp = await acc(SPLIT2); assert.strictEqual(sp.records.filter(r => r.t || r.na).length, 0); assert.strictEqual(sp.xstash.length, timed.length);
    // היסטוריית האיזון נשמרת רק כשכל הרשימה אצל הגובים שנבחרו (כמו במקור); כאן יש שורות ששויכו מראש לגובה אחר
    const hd = await api('GET', '/api/docs/settings/ar_hist'); assert.ok(hd.status === 404 || !hd.json.h['2026-12-01']);
  });

  await step('API: ניסיון חוזר עם אותו opId לא רושם פעמיים, וגרסה ישנה נדחית (409)', async () => {
    const sp = await acc(SPLIT3); const r = sp.records.find(x => x.t && !x.side && x.c !== 'לשנות');
    const body = { splitId: SPLIT3, baseVersion: sp._version, date: '2026-12-02', names: ['רובי', 'טל'], opId: 'spt-dup-1', entries: [{ sid: r._k, n: r.n, a: r.a, t: r.t, c: 'רובי', s: '', p: r.ph || '' }] };
    const a = await api('POST', '/api/split-tools/xfer', body); assert.strictEqual(a.status, 200, JSON.stringify(a.json));
    const b2 = await api('POST', '/api/split-tools/xfer', body); assert.strictEqual(b2.status, 200); assert.ok(b2.json.replay); assert.strictEqual(b2.json.workId, a.json.workId);
    const c = await api('POST', '/api/split-tools/xfer', { ...body, opId: 'spt-dup-2' }); assert.strictEqual(c.status, 409);
    const w = await acc(a.json.workId); assert.strictEqual(w.entries.length, 1);
    const h = (await api('GET', '/api/docs/settings/ar_hist')).json.h; assert.deepStrictEqual(h['2026-12-02'], { 'רובי': 1, 'טל': 0 });
    const sp2 = await acc(SPLIT3); assert.strictEqual(sp2.records.length, sp.records.length - 1); assert.strictEqual(sp2.xstash.length, 1);
  });

  await step('טבלת עריכת שורות: לא נגבה היום, הערה טופלה, קשה, וטלפון ברשימה של', async () => {
    await p.goto(URL + '/#/acc/' + SPLIT); await p.waitForSelector('#spt-rows');
    await p.click('#spt-rows summary'); await p.waitForSelector('#spt-rows table.ed tr[data-id]');
    const k = await p.getAttribute('#spt-rows tr[data-id]', 'data-id');
    await p.check(`tr[data-id="${k}"] [data-f=side]`); await until(async () => (await acc(SPLIT)).records.find(r => r._k === k).side === true);
    await p.waitForSelector(`tr[data-id="${k}"] [data-f=done]`);
    await p.check(`tr[data-id="${k}"] [data-f=done]`); await until(async () => (await acc(SPLIT)).records.find(r => r._k === k).done === true);
    await p.selectOption(`tr[data-id="${k}"] [data-f=h]`, 'קשה'); await until(async () => (await acc(SPLIT)).records.find(r => r._k === k).h === 'קשה');
    const c = await p.getAttribute('#spt-phones input[data-ph]', 'data-ph'); const was = ((await acc(SPLIT)).phones || []).includes(c);
    await p.click(`#spt-phones input[data-ph="${c}"]`); await until(async () => ((await acc(SPLIT)).phones || []).includes(c) !== was);
  });

  await step('אין שגיאות בדפדפן', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} עברו. צילומים: ${OUT}`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
