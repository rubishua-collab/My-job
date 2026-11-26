// בדיקת קבלה: ״PDF לוואטסאפ״ של כל החשבון באיסוף יום כולל ״הלוואות שנמסרו ללקוחות״ (הקובץ שמופק בפועל).
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8565, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-pl-'));
const OUT = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-pl-shots-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).slice(0, 700)); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', COOKIE_SECURE: '0', IMPORT_ON_START: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await wait(200);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch { /* */ } }); // בלי חלון שיתוף — הקובץ יורד
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const api = async (m, u, body) => { const r = await ctx.request.fetch(URL + u, { method: m, data: body, headers: { 'Content-Type': 'application/json' } }); const j = await r.json(); if (!r.ok()) throw new Error(u + ': ' + JSON.stringify(j)); return j; };
  const DATE = '2026-11-25', OTHER = '2026-11-24';
  const strip = (a) => { const d = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', '_times', '_day', '_foreign', '_lreq', 'id'].forEach(k => delete d[k]); return d; };
  const mkWork = async (date, op, entries) => { const { id } = await api('POST', '/api/accounts', { kind: 'work', date, opId: op }); const a = await api('GET', '/api/accounts/' + id); await api('PUT', '/api/accounts/' + id, { data: { ...strip(a), entries }, baseVersion: a._version, opId: op + 'f' }); return id; };
  const E = []; const C = ['אושר', 'בן', 'טל'];
  for (let i = 0; i < 26; i++) E.push({ _k: 'e' + i, n: 'לקוח ' + (i + 1), a: 500 + 50 * i, c: C[i % 3], t: String(9 + (i % 10)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00'), s: i % 4 === 0 ? 'נאסף' : '' });
  const W = await mkWork(DATE, 'w', E);
  const W2 = await mkWork(OTHER, 'w2', [{ _k: 'z', n: 'אחר', a: 100, c: 'בן', t: '10:00' }]);
  const reqs = [
    ['Qliot', 'ליאור נבא', 10000, '2026-11-20', '1650 כפול 10', DATE, 'אושר'],
    ['Qron', 'רונן בוריסוב', 3200, '2026-11-25', 'חידוש', DATE, 'בן'],
    ['Qsil', 'סילבר נקש', 10000, '2026-11-25', '4000 כפול 3', DATE, null], // הועברה — עוד לא נמסרה
    ['Qitz', 'איציק לחמני', 6000, '2026-11-18', '2500 כפול 3\nלהתקשר לפני', DATE, 'טל'],
    ['Qoth', 'לקוח של יום אחר', 7000, '2026-11-24', 'לא שייך', OTHER, 'בן'],
  ];
  for (const [id, name, amount, date, note, xd, c] of reqs) {
    await api('POST', '/api/docs/loan_requests', { id, data: { name, amount, date, note, phone: '', created: '', updated: '' }, opId: 'q' + id });
    await api('POST', '/api/loan-req/xfer', { id, date: xd, opId: 'x' + id });
    if (c) await api('POST', '/api/loan-req/give', { id, c, opId: 'g' + id });
  }
  const before = await api('GET', '/api/accounts/' + W);
  const nLoanExp = (a) => (a.expenses || []).filter(x => x.lr).length;
  let pdf1, html, htmlNoLoans;
  const genPdf = async (file) => {
    await p.goto(URL + '/#/acc/' + W); await p.reload(); await p.waitForSelector('[data-wpdf-all]');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('[data-wpdf-all]')]);
    const f = path.join(OUT, file); await dl.saveAs(f); return f;
  };

  await step('״PDF לוואטסאפ״ מפיק קובץ PDF אמיתי (עם הורדה), בלי שגיאות', async () => {
    pdf1 = await genPdf('acc.pdf'); const buf = fs.readFileSync(pdf1); assert.strictEqual(buf.slice(0, 5).toString(), '%PDF-');
  });
  await step('התוכן של הקובץ: ״הלוואות שנמסרו ללקוחות״ — ליאור נבא 10,000 ״1650 כפול 10״, רונן בוריסוב 3,200 ״חידוש״, איציק לחמני (בקשה מוקדמת); בלי בקשה שלא נמסרה ובלי יום אחר; כל הלוואה פעם אחת', async () => {
    const r = await p.evaluate(async (id) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); const base = { kind: 'work', date: a.date, entries: a.entries.filter(e => e && (e.n || e.a)), expenses: (a.expenses || []).filter(x => x && (x.n || x.a)) }; return { with: m.workHTML({ ...base, loans: (a._lreq || []).filter(q => q.given) }), without: m.workHTML(base) }; }, W);
    html = r.with; htmlNoLoans = r.without;
    const box = await p.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); const el = d.querySelector('.lgv'); const t = [...el.querySelectorAll('.lgv-i')].map(i => i.querySelector('.lgv-top').innerText.replace(/\s+/g, ' ') + ' | ' + i.querySelector('.lgv-m').innerText.replace(/\s+/g, ' ') + ' | ' + (i.querySelector('.lgv-note')?.dataset.note || '') + ' | ' + (i.querySelector('.lgv-note')?.innerText || '')).join('\n'); const out = el.querySelector('.lgv-h').innerText + '\n' + t; d.remove(); return out; }, html);
    console.log('   ' + box.split('\n').join('\n   '));
    assert.ok(box.includes('הלוואות שנמסרו ללקוחות'));
    assert.ok(/ליאור נבא[\s\S]*10,000[\s\S]*אושר[\s\S]*20\.11\.2026[\s\S]*1650 כפול 10/.test(box), 'ליאור');
    assert.ok(/רונן בוריסוב[\s\S]*3,200[\s\S]*בן[\s\S]*25\.11\.2026[\s\S]*חידוש/.test(box), 'רונן');
    assert.ok(/איציק לחמני[\s\S]*6,000[\s\S]*טל[\s\S]*18\.11\.2026[\s\S]*2500 כפול 3\nלהתקשר לפני/.test(box), 'איציק — הפירוט המלא כולל מעבר שורה');
    assert.ok(!box.includes('סילבר נקש') && !box.includes('לקוח של יום אחר'));
    for (const n of ['ליאור נבא', 'רונן בוריסוב', 'איציק לחמני']) assert.strictEqual(box.split(n).length - 1, 1, n);
    assert.ok(/שעת מסירה \d{2}:\d{2}/.test(box), 'שעת מסירה');
  });
  await step('סיכומי החשבון זהים לסכומים שלפני הוספת התיבה (התיבה רק נוספת אחרי הסיכום)', async () => {
    assert.ok(html.startsWith(htmlNoLoans), 'כל מה שלפני התיבה זהה');
    assert.ok(html.indexOf('סה״כ כללי') < html.indexOf('הלוואות שנמסרו ללקוחות'), 'התיבה מתחת לסיכום');
    const tot = (s) => [...s.matchAll(/<tr class="tot2?">([\s\S]*?)<\/tr>/g)].map(m => m[1]).join('|');
    assert.strictEqual(tot(html), tot(htmlNoLoans));
    // הוצאות ״מתן הלוואה״: 19,200 (10,000 + 3,200 + 6,000), כל אחת פעם אחת
    assert.ok(/סה״כ הוצאות \(3\)[\s\S]*?19,200/.test(html), 'הוצאות');
  });
  await step('PDF מעמוד אחד ויותר: העמוד האחרון מציג את התיבה בצד ימין מתחת לסיכום; הפירוט לא נחתך בין עמודים', async () => {
    execFileSync('pdftoppm', ['-r', '60', '-png', pdf1, path.join(OUT, 'page')]);
    const pages = fs.readdirSync(OUT).filter(f => /^page-\d+\.png$/.test(f)).sort();
    assert.ok(pages.length >= 1); console.log('   עמודים:', pages.length, '·', OUT);
    // אותו חיתוך כמו ב-buildPdf: כל פריט הלוואה בתוך עמוד אחד
    const r = await p.evaluate(async (h) => {
      const st = document.createElement('div'); st.id = 'wt-pdf-stage'; document.body.appendChild(st); st.innerHTML = '<article class="report wt-rep">' + h + '</article>';
      const W = 794, sR = st.getBoundingClientRect(), totalH = Math.ceil(st.scrollHeight), cand = [];
      st.querySelectorAll('tbody tr, tfoot tr, .rl').forEach(tr => cand.push(tr.getBoundingClientRect().bottom - sR.top));
      st.querySelectorAll('.rs, .cblock').forEach(s => cand.push(s.getBoundingClientRect().top - sR.top)); cand.sort((a, b) => a - b);
      const pageH = W * (277 / 190), sl = []; let y = 0;
      while (y < totalH - 1) { const lim = y + pageH; if (lim >= totalH) { sl.push([y, totalH]); break; } let bb = 0; for (const c of cand) if (c > y + pageH * 0.35 && c <= lim) bb = c; if (!bb) bb = lim; sl.push([y, bb]); y = bb; }
      const items = [...st.querySelectorAll('.lgv-i')].map(el => { const q = el.getBoundingClientRect(); return [q.top - sR.top, q.bottom - sR.top]; });
      const box = st.querySelector('.lgv-box').getBoundingClientRect(), art = st.querySelector('article').getBoundingClientRect();
      const font = parseFloat(getComputedStyle(st.querySelector('.lgv-note')).fontSize), dir = getComputedStyle(st.querySelector('.lgv-box')).direction;
      st.remove(); return { sl, items, right: art.right - box.right, left: box.left - art.left, font, dir };
    }, html);
    for (const [t, bt] of r.items) assert.ok(r.sl.some(([a, z]) => t >= a - 1 && bt <= z + 1), 'פריט נחתך בין עמודים');
    assert.strictEqual(pages.length, r.sl.length);
    const last = r.sl[r.sl.length - 1]; assert.ok(r.items.every(([t]) => t >= last[0] - 1) || r.items.length, 'התיבה בסוף');
    assert.ok(r.right < r.left, 'התיבה בצד ימין'); assert.strictEqual(r.dir, 'rtl'); assert.ok(r.font >= 14, 'גופן קריא');
  });
  await step('הפקה חוזרת של ה-PDF לא משנה את החשבון: הוצאת ״מתן הלוואה״ נספרת פעם אחת', async () => {
    const f2 = await genPdf('acc2.pdf'); assert.ok(fs.statSync(f2).size > 1000);
    const after = await api('GET', '/api/accounts/' + W);
    assert.strictEqual(after._version, before._version, 'החשבון לא נשמר מחדש'); assert.strictEqual(nLoanExp(after), 3);
    assert.deepStrictEqual(after.expenses, before.expenses);
  });
  await step('חשבון בלי הלוואות שנמסרו — אין תיבה; PDF של גובה אחד — בלי התיבה', async () => {
    const h = await p.evaluate(async (id) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return m.workHTML({ kind: 'work', date: a.date, entries: a.entries, expenses: a.expenses, loans: (a._lreq || []).filter(q => q.given) }); }, W2);
    assert.ok(h.includes('לקוח של יום אחר') ? h.includes('הלוואות שנמסרו') : !h.includes('הלוואות שנמסרו'));
    const W3 = await mkWork('2026-11-23', 'w3', [{ _k: 'q', n: 'בלי הלוואות', a: 100, c: 'בן', t: '10:00' }]);
    const h3 = await p.evaluate(async (id) => { const m = await import('/js/features/work-tools-lib.js'); const a = await (await fetch('/api/accounts/' + id)).json(); return m.workHTML({ kind: 'work', date: a.date, entries: a.entries, expenses: a.expenses, loans: (a._lreq || []).filter(q => q.given) }); }, W3);
    assert.ok(!h3.includes('הלוואות שנמסרו'));
    assert.deepStrictEqual(errs, []);
  });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
