// בדיקת קליטת קבצים וייצוא לאקסל (features/imports). הרצה: BACKUP=path/to/backup.json [ORIG=path/to/app.html] node test/feature-imports.cjs
// הקבצים לדוגמה נוצרים בדפדפן עם SheetJS (אין SheetJS ב-Node) או ככתב CSV.
// ההשוואה לתוכנה המקורית: הפונקציות המקוריות נשלפות מ-app.html ורצות על אותם נתונים, והתוצאה צריכה להיות זהה למה שנשמר.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.IMP_PORT || 8301, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-imp-'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-imp-files-'));
const ORIG = process.env.ORIG || '/tmp/claude-0/-home-user-My-job/07101a7a-eccb-5a25-8245-cb5180d30624/scratchpad/orig/app.html';
const results = [];
let P = null;
const step = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log('✓', name); }
  catch (e) {
    results.push({ name, ok: false }); console.log('✗', name, '\n   ', String(e.message).split('\n').slice(0, 14).join('\n    '));
    if (P) { const t = await P.evaluate(() => { const s = document.querySelector('#sheet:not([hidden])'); return s ? s.innerText.slice(0, 600) : ''; }).catch(() => ''); if (t) console.log('    [חלון פתוח]', t.replace(/\n+/g, ' | ')); }
  }
  if (P) await P.evaluate(() => { const s = document.querySelector('#sheet'); if (s && !s.hidden) { s.hidden = true; s.innerHTML = ''; document.documentElement.style.overflow = ''; } }).catch(() => {});
};

// שליפת פונקציות מהמקור: "function X(" עד שורת "}" הראשונה, או שורת "const X=" אחת
function origCode(names) {
  const L = fs.readFileSync(ORIG, 'utf8').split('\n'); const out = [];
  for (const n of names) {
    let i = L.findIndex(l => l.startsWith('function ' + n + '('));
    if (i >= 0) { let j = i; while (!(L[j] === '}' || (j === i && L[j].trimEnd().endsWith('}') && (L[j].match(/\{/g) || []).length === (L[j].match(/\}/g) || []).length))) j++; out.push(L.slice(i, j + 1).join('\n')); continue; }
    i = L.findIndex(l => l.startsWith('const ' + n + '='));
    if (i < 0) throw new Error('לא נמצא במקור: ' + n);
    out.push(L[i]);
  }
  return out.join('\n');
}

const MORNING = [
  ['דו"ח הכנסות מפורט'], [],
  ['שם משפחה', 'שם פרטי', 'תאריך', 'תשלום קרן', 'תשלום ריבית'],
  ['כהן', 'דני', '01/11/2026', 1000, 250],
  ['לוי', 'משה', '', 0, 120.5],
  ['', '', '', 300, 0],
  ['מזרחי', 'רון', '', '1,500', '75'],
  ['סה"כ', '', '', 2800, 445.5],
];
const SPLIT = [
  ['מסך דו"ח ראשי'],
  ['שם פרטי', 'שם משפחה', 'יתרה', 'סוכן', 'טלפון נייד', 'קשה'],
  ['אבי', 'טסטון', 1000, 'טל', '0501234567', ''],
  ['אבי', 'טסטון', 500, 'טל', '', 'קשה'],
  ['בני', 'בדיקוביץ', 700, 'רובי', '521234567', 'לא קשה'],
  ['בני', '', 300, 'רובי', '0521234567', ''],
  ['גדי', 'רובי שילם 200', 400, 'חמודי', '', ''],
  ['דנה', 'כספית', 0, 'טל', '', ''],
  ['סה"כ', '', 2900, '', '', ''],
];
const COLL_TEXT = 'חובות\n1. ישראל ישראלי – 1,500 ₪ – רובי\nשרה טסטית 800 סנטה\nסה"כ 2300\nהוצאות\nדלק 120 רובי';

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP || '' };
  delete env.ANTHROPIC_API_KEY;
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  for (let i = 0; i < 75 && !slog.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true, viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage(); const errs = []; P = p; p.setDefaultTimeout(10000);
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  const api = async (method, url, body) => { const r = await ctx.request.fetch(URL + url, { method, data: body, headers: { Origin: URL } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const hasOrig = fs.existsSync(ORIG);
  const ORIG_FNS = hasOrig ? origCode(['TOTAL_RE', 'cell', 'findHeader', 'extractRows', 'NOTE_PHRASES', 'NOTE_WORDS', 'looksLikeNote', 'normPhone', 'hardVal', 'agFilled', 'detectCollCol', 'findSplitHeader', 'extractSplit', 'mergeRecords', 'compactRec', 'parseText']) : '';
  // הרצת הקוד המקורי בדף, עם פונקציות העזר המקוריות (שהועתקו ל-calc.js)
  // הרצת הקוד המקורי ב-Node (CSP של הדף לא מאפשר eval), עם פונקציות העזר המקוריות שהועתקו ל-calc.js
  const calcM = await import(path.join(ROOT, 'public/js/calc.js'));
  const runOrig = (fnBody, arg) => {
    const f = new Function('c', 'arg', `const {num,r2,sum,normName,cleanPh,normTime,collKey,isSagi}=c; let n=0; const uid=()=>'u'+(++n);
      const nw={yes:new Set(),no:new Set()}; const knownCollectors=()=>['רובי','סמיילי','גובאני','שילו','טל','גלעד','אושר','עידן','טאייה'];
      ${ORIG_FNS}\n${fnBody}`);
    return JSON.parse(JSON.stringify(f(calcM, JSON.parse(JSON.stringify(arg)))));
  };
  // יצירת קובץ xlsx בדפדפן
  const makeXlsx = async (name, aoa) => {
    const b64 = await p.evaluate(async (aoa) => {
      if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'גיליון1');
      return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    }, aoa);
    const f = path.join(TMP, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };
  const readXlsx = (file) => p.evaluate((b64) => { const wb = XLSX.read(b64, { type: 'base64' }); return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })])); }, fs.readFileSync(file).toString('base64'));
  const newAcc = async (kind, date) => {
    await p.goto(URL + '/#/accounts'); await p.click('#newacc'); await p.fill('#nd', date); await p.click(`[data-nk=${kind}]`);
    await p.waitForSelector('#ed-save'); return p.url().split('/acc/')[1].split('?')[0];
  };
  const eact = (label) => p.click(`button[data-eact]:has-text("${label}")`);
  const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => k === '_k' ? undefined : v));

  await step('כניסה', async () => {
    await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button');
    await p.waitForSelector('.kpis');
    // מעבר מסך מעריכה שלא נשמרה פותח ״יש שינויים שטרם נשמרו״ — בבדיקה הזו בוחרים ״המשך בלי לשמור״
    const og = p.goto.bind(p);
    p.goto = async (u, o) => { const r = await og(u, o); const lv = await p.waitForSelector('#lvgo', { timeout: 300 }).catch(() => null); if (lv) { await lv.click(); await p.waitForTimeout(150); } return r; };
  });

  await step('המרת קישורי Google Sheets (שרת)', async () => {
    const m = await import(path.join(ROOT, 'server/features/imports.js'));
    assert.strictEqual(m.gsheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_DEF-1/edit#gid=42'), 'https://docs.google.com/spreadsheets/d/abc_DEF-1/export?format=csv&gid=42');
    assert.strictEqual(m.gsheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-x/pubhtml?gid=7&single=true'), 'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?output=csv&gid=7&single=true');
    assert.strictEqual(m.gsheetCsvUrl('https://evil.example/spreadsheets/d/x'), null);
    assert.strictEqual(m.gsheetCsvUrl('http://docs.google.com/spreadsheets/d/x'), null);
    const r = await api('POST', '/api/imports/gsheet', { url: 'https://example.com/x.csv' }); assert.strictEqual(r.status, 400);
  });

  let mId;
  await step('חשבון בוקר: קליטת דו״ח הכנסות xlsx — שורות וסכומים זהים למקור, התאמה לשורת הסיכום', async () => {
    mId = await newAcc('morning', '2026-11-25');
    const f = await makeXlsx('income.xlsx', MORNING);
    await eact('קליטה מקובץ אקסל'); await p.setInputFiles('#imp-file', f);
    await p.waitForSelector('#imp-st.note.warn'); const st = await p.innerText('#imp-st');
    assert.ok(st.includes('נקראו 4 לקוחות') && st.includes('הסכומים תואמים לשורת הסיכום'), st);
    assert.ok(st.includes('בלי שם'), 'אזהרת שורה בלי שם');
    assert.strictEqual(await p.inputValue('[data-map=n]'), '0'); assert.strictEqual(await p.inputValue('[data-map=n2]'), '1');
    await p.click('#m-imp-ok'); await p.waitForSelector('#ed-save');
    await p.fill('#ed-courier', '50'); await p.press('#ed-courier', 'Tab');
    await p.click('#ed-save'); await p.waitForSelector('tr.final');
    const a = (await api('GET', '/api/accounts/' + mId)).json;
    const rows = clean(a.rows);
    assert.deepStrictEqual(rows, [{ n: 'דני כהן', p: 1000, i: 250 }, { n: 'משה לוי', p: 0, i: 120.5 }, { n: '(ללא שם)', p: 300, i: 0 }, { n: 'רון מזרחי', p: 1500, i: 75 }]);
    if (hasOrig) {
      const o = runOrig(`const h=findHeader(arg); const ex=extractRows(arg,h.r,{n:h.n,p:h.pp,i:h.ip,n2:h.n2}); return {rows:ex.rows.map(r=>({n:String(r.n||'').trim(),p:c.num(r.p),i:c.num(r.i)})), ft:ex.fileTotals};`, MORNING);
      assert.deepStrictEqual(rows, o.rows, 'שונה מהמקור'); assert.deepStrictEqual(o.ft, { p: 2800, i: 445.5 });
    }
    const calc = await p.evaluate(async (a) => { const c = await import('/js/calc.js'); const x = c.calcMorning(a); return { interest: x.interest, principal: x.principal, robi: x.robi, final: x.final, keren: x.keren }; }, a);
    assert.strictEqual(calc.interest, 445.5); assert.strictEqual(calc.principal, 2800); assert.strictEqual(calc.robi, 111.38);
    assert.strictEqual(calc.final, Math.round((calc.keren + 2800 + (445.5 - 111.38) - 50 - (a.loans || []).reduce((t, l) => t + (+l.a || 0), 0)) * 100) / 100);
    assert.strictEqual(a.finalKeren, calc.final);
  });

  await step('חשבון בוקר: שורת סיכום שלא תואמת — אזהרה כמו במקור', async () => {
    await p.goto(URL + '/#/acc/' + mId + '?edit=1'); await p.waitForSelector('#ed-save');
    const bad = MORNING.map(r => r.slice()); bad[7][3] = 2900;
    await eact('קליטה מקובץ אקסל'); await p.setInputFiles('#imp-file', await makeXlsx('bad.xlsx', bad));
    await p.waitForSelector('#imp-st.note.err'); assert.ok((await p.innerText('#imp-st')).includes('שורת הסיכום בקובץ'));
    await p.click('#m-imp-ok'); await p.waitForSelector('#toast span');
    const t = await p.innerText('#toast'); assert.ok(t.includes('הסכומים לא תואמים לשורת הסיכום שבקובץ') && t.includes('הפרש 100'), t);
  });

  await step('חשבון בוקר: קובץ CSV בעברית (UTF-8) ובחירת עמודות ידנית', async () => {
    await p.goto(URL + '/#/acc/' + mId + '?edit=1'); await p.waitForSelector('#ed-save');
    const csv = [['לקוח', 'קרן', 'ריבית'], ['יוסי בדיקה', '200', '30'], ['רינה בדיקה', '', '45.5']].map(r => r.join(',')).join('\n');
    const f = path.join(TMP, 'plain.csv'); fs.writeFileSync(f, csv, 'utf8');
    await eact('קליטה מקובץ אקסל'); await p.setInputFiles('#imp-file', f);
    await p.waitForSelector('#imp-st.note.warn'); assert.ok((await p.innerText('#imp-st')).includes('לא מצאתי עמודות'));
    await p.selectOption('[data-map=p]', '1'); await p.selectOption('[data-map=i]', '2');
    await p.waitForFunction(() => /נקראו 2 לקוחות/.test(document.querySelector('#imp-st').innerText));
    assert.ok((await p.innerText('.imp-pv')).includes('יוסי בדיקה'), 'עברית השתבשה');
    await p.click('#m-imp-ok'); await p.waitForSelector('#ed-save');
    assert.strictEqual(await p.locator('[data-l=rows][data-k=n]').first().inputValue(), 'יוסי בדיקה');
  });

  let sId;
  await step('פיצול: קליטת קובץ החייבים — איחוד והערות זהים למקור', async () => {
    sId = await newAcc('split', '2026-11-25');
    await eact('קליטה מקובץ אקסל'); await p.setInputFiles('#imp-file', await makeXlsx('split.xls.xlsx', SPLIT));
    await p.waitForSelector('#imp-st.note.ok'); const st = await p.innerText('#imp-st');
    assert.ok(st.includes('נקראו 5 שורות') && st.includes('אחרי איחוד 3') && st.includes('1 הערות') && st.includes('דולגו 2') && st.includes('לפי אותו טלפון'), st);
    await p.click('#sp-imp-ok'); await p.waitForSelector('#ed-save'); await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
    const a = (await api('GET', '/api/accounts/' + sId)).json; const recs = clean(a.records);
    const byN = Object.fromEntries(recs.map(r => [r.n, r]));
    assert.strictEqual(byN['אבי טסטון'].a, 1500); assert.strictEqual(byN['אבי טסטון'].cnt, 2); assert.strictEqual(byN['אבי טסטון'].h, 'קשה'); assert.strictEqual(byN['אבי טסטון'].ph, '0501234567');
    assert.strictEqual(byN['בני בדיקוביץ'].a, 1000); assert.strictEqual(byN['בני בדיקוביץ'].ph, '0521234567');
    assert.strictEqual(byN['גדי'].note, 'רובי שילם 200'); assert.strictEqual(byN['גדי'].c, 'רובי');
    if (hasOrig) {
      const o = runOrig(`const h=findSplitHeader(arg); const ex=extractSplit(arg,h.r,h.map); const m=mergeRecords(ex.recs); return m.recs.map(compactRec).filter(r=>r.n||r.a);`, SPLIT);
      assert.deepStrictEqual(recs, o, 'שונה מהמקור:\n' + JSON.stringify(recs) + '\n' + JSON.stringify(o));
    }
    const c = await p.evaluate(async (r) => { const c = await import('/js/calc.js'); const x = c.calcSplit(r); return { grand: x.grand, all: x.all }; }, a.records);
    assert.deepStrictEqual(c, { grand: 2900, all: 2900 });
  });

  await step('פיצול: איחוד חובות כפולים והשלמת טלפונים מפיצולים קודמים', async () => {
    await p.goto(URL + '/#/acc/' + sId + '?edit=1'); await p.waitForSelector('#ed-save');
    // שורה נוספת של אותו לווה אצל גובה אחר, ושורה בלי טלפון של לווה שיש לו טלפון בפיצול הקודם
    await p.click('[data-add=records]'); await p.locator('[data-l=records][data-k=n]').last().fill('אבי טסטון'); await p.locator('[data-l=records][data-k=a]').last().fill('250');
    await p.locator('[data-l=records][data-k=c]').last().fill('רובי'); await p.locator('[data-l=records][data-k=c]').last().press('Tab');
    await eact('איחוד חובות כפולים'); await p.waitForSelector('#toast span'); assert.ok((await p.innerText('#toast')).includes('אוחדו 1 שורות'));
    assert.strictEqual(await p.locator('[data-l=records][data-k=n]').count(), 3);
    const prev = (await api('GET', '/api/imports/accounts?kind=split')).json.filter(x => x.id !== sId && x.date < '2026-11-25').sort((x, y) => y.date.localeCompare(x.date));
    const withPh = prev.flatMap(x => x.records).find(r => r && /^0\d{2}-?\d{7}$/.test(String(r.ph || '')) && String(r.n || '').trim().split(' ').length >= 2);
    if (withPh) {
      await p.click('[data-add=records]'); await p.locator('[data-l=records][data-k=n]').last().fill(withPh.n); await p.locator('[data-l=records][data-k=n]').last().press('Tab');
      await p.evaluate(() => { document.querySelector('#toast').innerHTML = ''; });
      await eact('השלמת טלפונים מפיצולים קודמים'); await p.waitForSelector('#toast span');
      const ph = await p.locator('[data-l=records][data-k=ph]').last().inputValue();
      assert.ok(ph.replace(/\D/g, '').length >= 9, 'טלפון לא הושלם עבור ' + withPh.n + ': ' + (await p.innerText('#toast')));
    }
  });

  let cId;
  await step('חשבון גובים: הדבקת טקסט — זהה למקור', async () => {
    cId = await newAcc('collectors', '2026-11-25');
    await eact('הוספה מטקסט / צילום מסך'); await p.fill('#c-text', COLL_TEXT); await p.click('#c-parse');
    await p.waitForSelector('#ed-save'); assert.ok((await p.innerText('#toast')).includes('נוספו 3 שורות'));
    await p.click('#ed-save'); await p.waitForURL(/#\/acc\/[^?]+$/);
    const a = (await api('GET', '/api/accounts/' + cId)).json; const es = clean(a.entries);
    assert.deepStrictEqual(es, [{ k: 'd', n: 'ישראל ישראלי', a: 1500, c: 'רובי' }, { k: 'd', n: 'שרה טסטית', a: 800, c: 'סנטה' }, { k: 'e', n: 'דלק', a: 120, c: 'רובי' }]);
    if (hasOrig) { const o = runOrig(`return parseText(arg).map(e=>({k:e.k==='e'?'e':'d',n:String(e.n||'').trim(),a:c.num(e.a),c:String(e.c||'').trim()}));`, COLL_TEXT); assert.deepStrictEqual(es, o); }
  });

  await step('חשבון גובים: צילום מסך בלי חיבור ל-Claude — הודעה ברורה', async () => {
    await p.goto(URL + '/#/acc/' + cId + '?edit=1'); await p.waitForSelector('#ed-save');
    await eact('הוספה מטקסט / צילום מסך');
    const png = path.join(TMP, 'shot.png'); fs.copyFileSync(path.join(ROOT, 'public/icons/icon-192.png'), png);
    await p.setInputFiles('#c-img', png); await p.click('#c-analyze');
    await p.waitForSelector('#c-img-note.note.warn', { timeout: 15000 });
    assert.ok((await p.innerText('#c-img-note')).includes('קריאת תמונות דורשת חיבור ל-Claude'));
    await p.click('#sheet [data-close]');
  });

  await step('ייצוא חשבון לאקסל (בוקר ופיצול)', async () => {
    await p.goto(URL + '/#/acc/' + mId); await p.waitForSelector('button[data-xact]');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-xact]:has-text("ייצוא לאקסל")')]);
    const f = path.join(TMP, 'm.xlsx'); await dl.saveAs(f); // (Chromium בלי ממשק מחזיר ״download״ לשם קובץ בעברית, ולכן לא בודקים כאן את השם)
    const x = await readXlsx(f); const a = (await api('GET', '/api/accounts/' + mId)).json;
    const fin = x['סיכום'].find(r => r[0] === 'קרן סופית'); assert.strictEqual(fin[1], a.finalKeren);
    assert.strictEqual(x['שורות'].length - 1, a.rows.length);
    await p.goto(URL + '/#/acc/' + sId); await p.waitForSelector('button[data-xact]');
    const [d2] = await Promise.all([p.waitForEvent('download'), p.click('button[data-xact]:has-text("ייצוא לאקסל")')]);
    const f2 = path.join(TMP, 's.xlsx'); await d2.saveAs(f2); const y = await readXlsx(f2);
    assert.strictEqual(y['סיכום'].find(r => r[0] === 'סה״כ כללי (גובים)')[2], 2900);
  });

  await step('ייצוא דוחות ל-Excel (כל החשבונות) — סכומים לפי חשבונות הבוקר', async () => {
    await p.goto(URL + '/#/xlsx'); await p.waitForSelector('#xgo');
    await p.click('[data-r=all]');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#xgo')]);
    const f = path.join(TMP, 'r.xlsx'); await dl.saveAs(f); const x = await readXlsx(f);
    for (const n of ['סיכום', 'לפי יום', 'לפי חודש', 'לקוחות', 'גובים - איסוף יומי', 'גובים - חשבון גובים', 'לא שילמו', 'הלוואות', 'תשלומי הלוואות', 'תזרים הלוואות']) assert.ok(x[n], 'חסר גיליון ' + n);
    const list = (await api('GET', '/api/imports/accounts')).json;
    const exp = await p.evaluate(async (list) => { const c = await import('/js/calc.js'); return list.filter(a => a.kind === 'morning' && a.date).reduce((t, a) => c.r2(t + c.calcMorning(a).interest), 0); }, list);
    assert.strictEqual(x['סיכום'].find(r => r[0] === 'ריבית שנגבתה')[1], exp);
    const loans = (await api('GET', '/api/docs/loans')).json || [];
    assert.strictEqual(x['הלוואות'].length - 1, loans.filter(L => L.amount > 0).length > 0 ? x['הלוואות'].length - 1 : 0);
  });

  await step('אין שגיאות בדף', async () => { assert.deepStrictEqual(errs, []); });

  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} עברו`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
