// בדיקת מסלול מלא באייפון (Playwright, iPhone 13): שאלון → יעדים → ארוחת בוקר מהמאגר → שינוי כמות →
// הצעת ערב → החלפת רכיב → שקילה דרך הצ׳אט → סיכום שבועי. כולל בדיקות: מתוכנן לא נספר, תיקון שקילה נספר פעם אחת,
// ויום בלי שקילה לא מוריד את הממוצע.
// הרצה: node test/e2e-iphone.cjs   (מרים שרת זמני עם DB ריק על פורט 8890)
const { chromium, devices } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const assert = require('node:assert/strict');

const PORT = 8890; const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const israelDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const api = async (method, url, body) => { const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(url + ': ' + j.error); return j; };
let step = 0; const ok = msg => console.log(`✓ ${++step}. ${msg}`);

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-e2e-'));
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  const shot = async n => { await page.waitForTimeout(350); return page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false }); };
  const T = israelDate();
  const noSheet = () => page.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  try {
    // ---------- 1. שאלון ----------
    await page.goto(BASE + '/');
    await page.getByText('נתחיל: גיל ומין').waitFor();
    // RTL
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).direction), 'rtl');
    await page.click('[data-opts="sex"] [data-v="male"]'); await page.fill('#age', '38'); await shot('01-onboarding'); await page.click('#next');
    await page.fill('#h', '180'); await page.fill('#w', '120.4'); await page.click('#next');
    await page.click('[data-opts="goal"] [data-v="lose"]'); await page.click('#next');
    await page.fill('#tw', '100'); await page.click('[data-opts="rate"] [data-v="moderate"]'); await page.click('#next');
    // חזרה ותיקון תשובה: חוזרים מסך אחד ומשנים קצב
    await page.click('[data-opts="job"] [data-v="sitting"]'); await page.fill('#steps', '6000');
    await page.click('#back'); await page.getByText('משקל יעד וקצב').waitFor(); assert.equal(await page.inputValue('#tw'), '100');
    await page.click('[data-opts="rate"] [data-v="slow"]'); await page.click('#next');
    assert.equal(await page.inputValue('#steps'), '6000', 'התשובה נשמרה אחרי חזרה');
    await page.click('#next');
    await page.fill('#sp', '3'); await page.fill('#sm', '60'); await page.click('#next');
    await page.fill('#cp', '2'); await page.fill('#cm', '30'); await page.fill('#rest', '2'); await page.click('#next');
    await page.click('[data-opts="am"] [data-v="components"]'); await page.click('#next');
    await page.click('[data-opts="tt"] [data-v="evening"]'); await page.click('[data-seg="meals"] [data-v="3"]'); await page.click('#next');
    await page.click('[data-chips="hunger"] [data-v="evening"]'); await page.click('[data-opts="prep"] [data-v="15"]'); await page.click('#next');
    await page.click('[data-chips="likes"] [data-v="עוף"]'); await page.click('[data-chips="likes"] [data-v="ביצים"]'); await page.click('[data-chips="likes"] [data-v="קוטג׳"]'); await page.click('#next');
    await page.fill('#avoid', 'סלמון'); await page.click('#next');
    await page.click('[data-opts="kosher"] [data-v="1"]'); await page.click('#next');
    await page.fill('#fav0', 'חביתה עם סלט ולחם'); await page.fill('#fav1', 'חזה עוף עם אורז וסלט'); await page.fill('#fav2', 'קוטג׳ עם פיתה וירקות'); await page.click('#next');
    await page.click('[data-chips="all"] [data-v="nuts"]'); await page.click('#next');
    await page.click('#next'); // ללא מצבים רפואיים
    // ההתקדמות נשמרת: טעינה מחדש באמצע ממשיכה מאותו מסך
    await page.reload(); await page.getByText('רגע לפני החישוב').waitFor();
    await page.fill('#cw', '120.0'); await page.check('#okgoal'); await shot('02-confirm');
    await page.click('#next');
    ok('שאלון מולא, כולל חזרה ותיקון תשובה ושמירת התקדמות אחרי טעינה מחדש');

    // ---------- 2. יעדים ----------
    await page.getByText('כמה הגוף שלך מוציא במנוחה?').waitFor();
    for (const q of ['כמה אתה כנראה מוציא ביום ממוצע?', 'כמה כדאי לך לאכול ביום כדי להתקדם?', 'כמה חלבון ביום?']) await page.getByText(q).waitFor();
    const prev = await api('GET', '/api/targets/preview');
    // Mifflin: 10*120 + 6.25*180 - 5*38 + 5 = 2140
    assert.equal(prev.bmr, 2140); assert.ok(prev.tdeeRange[0] < prev.tdee && prev.tdee < prev.tdeeRange[1]);
    assert.equal(prev.kcal % 50, 0, 'יעד מעוגל ל-50');
    assert.equal(prev.refWeight.kg < 120, true, 'BMI≥30 → משקל ייחוס');
    await page.click('#how summary'); await page.getByText('Mifflin–St Jeor').first().waitFor();
    assert.ok(await page.locator('#how a[href*="doi.org/10.1093/ajcn/51.2.241"]').count(), 'קישור למקור Mifflin');
    assert.ok(await page.locator('#how a[href*="10.1136/bjsports-2017-097608"]').count(), 'קישור ל-Morton');
    assert.ok(await page.locator('#how a[href*="10.1186/s12970-017-0177-8"]').count(), 'קישור ל-ISSN');
    await shot('03-targets');
    await page.click('#savet'); await page.getByText('היום שלי').first().waitFor();
    const st0 = await api('GET', '/api/state'); assert.equal(st0.targets.length, 1); const TK = st0.targets[0].kcal, TP = st0.targets[0].protein;
    ok(`יעדים: BMR ${prev.bmr}, הוצאה ${prev.tdeeRange.join('–')}, יעד ${TK} קק״ל, חלבון ${TP} ג׳ (משקל ייחוס ${prev.refWeight.kg})`);

    // ---------- 3. ארוחת בוקר מהמאגר ----------
    await shot('04-today');
    await page.click('[data-meal="breakfast"] [data-mact="add"]');
    await page.fill('#fpq', 'ביצה שלמה'); await page.locator('[data-food="m1561"]').click();
    await page.selectOption('#fu', 'יחידה גדולה'); await page.fill('#fq', '2');
    await page.getByText('לכמות שלך (116 ג׳)').waitFor(); await shot('05-food-egg-L');
    await page.click('[data-add="planned"]'); await noSheet();
    await page.click('[data-meal="breakfast"] [data-mact="add"]');
    await page.fill('#fpq', 'קוטג 5% תנובה'); await page.locator('[data-food="m494"]').click();
    await page.selectOption('#fu', 'g'); await page.fill('#fq', '200'); await page.click('[data-add="planned"]'); await noSheet();
    // אורז: מבחינים בין יבש למבושל
    await page.click('[data-meal="breakfast"] [data-mact="add"]'); await page.fill('#fpq', 'אורז לבן');
    await page.locator('[data-food="m2730"] .pill', { hasText: 'יבש' }).waitFor();
    await page.locator('[data-food="m2721"] .pill', { hasText: 'מבושל' }).waitFor();
    await page.locator('[data-food="m2730"]').click(); await page.getByText('יבש — שוקלים לפני הבישול').waitFor(); await shot('06-rice-dry');
    await page.locator('.sheet-wrap').last().locator('[data-x]').click(); await page.locator('.sheet-wrap').last().locator('[data-x]').click();
    let day = await api('GET', '/api/day/' + T);
    assert.equal(day.eaten.kcal, 0, 'ארוחה מתוכננת לא נספרת כנאכלה'); assert.ok(day.planned.kcal > 300);
    ok(`ארוחת בוקר מהמאגר: 2 ביצים L (116 ג׳) + קוטג׳ 200 ג׳ — מתוכנן ${day.planned.kcal} קק״ל, נאכל 0`);

    // ---------- 4. שינוי כמות + אכלתי חלקית ----------
    await page.click('[data-meal="breakfast"] [data-mact="eaten"]');
    const cottage = (await api('GET', '/api/state')).entries.find(e => e.foodId === 'm494');
    await page.fill(`[data-eg="${cottage.id}"]`, '150'); await shot('07-eaten-partial');
    await page.click('.sheet [data-ok]'); await noSheet();
    day = await api('GET', '/api/day/' + T);
    const exp = Math.round(116 * 1.43 + 150 * 0.95);
    assert.equal(day.eaten.kcal, exp, `תוכננו 200 ג׳ קוטג׳, נאכלו 150 → נספר ${exp}`);
    const c2 = (await api('GET', '/api/state')).entries.find(e => e.id === cottage.id); assert.equal(c2.plannedGrams, 200); assert.equal(c2.grams, 150);
    assert.match(await page.locator('.sum').innerText(), new RegExp(String(exp)));
    // ערוך כמות
    await page.click('[data-meal="breakfast"] [data-mact="edit"]'); await page.fill(`[data-g="${cottage.id}"]`, '125'); await page.click('.sheet [data-ok]'); await noSheet();
    day = await api('GET', '/api/day/' + T); assert.equal(day.eaten.kcal, Math.round(116 * 1.43 + 125 * 0.95));
    ok(`תכננתי 200 / אכלתי 150 → היתרה עודכנה; "ערוך כמות" ל-125 ג׳ → נאכל ${day.eaten.kcal} קק״ל`);
    await page.click('[data-meal="breakfast"] [data-lock]'); await page.waitForTimeout(300);

    // ---------- 5. הצעת ערב + בנה יום ----------
    await page.click('[data-meal="dinner"] [data-mact="suggest"]');
    await page.locator('.sugg').first().waitFor(); const nOpts = await page.locator('.sheet .sugg').count();
    assert.ok(nOpts >= 2 && nOpts <= 3, '2–3 אפשרויות'); await shot('08-dinner-suggestions');
    const sugText = await page.locator('.sheet').innerText(); assert.ok(!/סלמון|שקדים|אגוזי מלך/.test(sugText), 'בלי מה שביקשתי להימנע ובלי אגוזים');
    await page.locator('.sheet [data-addopt="0"]').click(); await noSheet();
    const dinner = (await api('GET', '/api/state')).entries.filter(e => e.date === T && e.meal === 'dinner');
    assert.ok(dinner.length >= 2 && dinner.every(e => e.status === 'planned'));
    // בית: "יש לי ביצים, קוטג׳ ופיתה"
    await page.click('[data-meal="lunch"] [data-mact="suggest"]'); await page.fill('#pt', 'יש לי בבית ביצים, קוטג׳ ופיתה'); await page.click('#pf button');
    await page.getByText('זיהיתי: ביצים, קוטג׳ 5%, פיתה').waitFor(); await shot('09-pantry');
    await page.locator('.sheet [data-x]').last().click();
    // בנה לי יום שלם: ארוחת הבוקר הנעולה נשארת
    await page.click('[data-act="day"]'); await page.getByText('נשארות כמו שהן').waitFor(); await shot('10-plan-day');
    await page.click('[data-all]'); await noSheet();
    const afterPlan = (await api('GET', '/api/state')).entries.filter(e => e.date === T);
    assert.ok(afterPlan.some(e => e.id === cottage.id), 'הבוקר הנעול נשמר');
    ok(`הצעת ערב: ${nOpts} אפשרויות; ממה שיש בבית; "בנה לי יום שלם" שמר את הבוקר הנעול`);

    // ---------- 6. החלפת רכיב ----------
    const st6 = await api('GET', '/api/state');
    let carb = st6.entries.find(e => e.date === T && e.status === 'planned' && ['rice', 'brownRice', 'potato', 'sweetPotato', 'bulgur', 'couscous', 'quinoa', 'ptitim', 'pasta', 'bread', 'lightBread'].includes(e.comp));
    if (!carb) { await api('POST', '/api/entries', { entries: [{ date: T, meal: 'lunch', foodId: 'm2721', grams: 180, comp: 'rice', status: 'planned' }] }); carb = (await api('GET', '/api/state')).entries.find(e => e.date === T && e.comp === 'rice'); await page.reload(); }
    await page.locator(`[data-entry="${carb.id}"]`).click(); await page.click('.sheet [data-swap]');
    await page.locator('.sheet [data-k="pita"]').click(); await page.getByText('מה ישתנה').waitFor(); await shot('11-swap');
    const sw = (await api('GET', '/api/state')).entries.find(e => e.id === carb.id);
    assert.equal(sw.foodId, 'm1955'); assert.equal(sw.unit, 'יחידה'); assert.ok(sw.qty > 0 && sw.qty % 0.5 === 0);
    await page.locator('.sheet-wrap [data-x]').last().click();
    ok(`החלפה: ${carb.comp} → פיתה (${sw.qty} יחידה, ${sw.grams} ג׳) בלי לבנות מחדש את היום`);

    // ---------- 7. שקילה דרך הצ׳אט ----------
    await page.click('.tabbar [data-r="chat"]'); await page.locator('#ci').waitFor();
    await page.fill('#ci', 'הבוקר שקלתי 119.8'); await page.click('#cs');
    await page.locator('[data-wupd]').waitFor(); await shot('12-chat-weight-exists');
    await page.locator('[data-wupd]').click(); await page.getByText('נספר פעם אחת').waitFor();
    let ws = (await api('GET', '/api/state')).weights.filter(w => w.date === T);
    assert.equal(ws.length, 1); assert.equal(ws[0].kg, 119.8);
    await page.fill('#ci', 'מה כדאי לי לאכול הערב?'); await page.click('#cs'); await page.locator('[data-addcard]').first().waitFor(); await shot('13-chat-dinner');
    ok('שקילה בצ׳אט: הוצע לעדכן את השקילה הקיימת, ונשמרה פעם אחת (119.8); הצעת ערב בכרטיס עם "הוסף לתכנון"');

    // ---------- 8. היסטוריה + תיקון שקילה + יום חסר ----------
    const ws0 = addDays(T, -dow(T)); // ראשון של השבוע הנוכחי
    const lw = addDays(ws0, -7), pw = addDays(ws0, -14), ppw = addDays(ws0, -21);
    const seed = { [ppw]: [121.6, 121.5, 121.4, 121.3, 121.4, 121.2, 121.1], [pw]: [121.0, 120.9, null, 120.8, 120.8, null, 120.6], [lw]: [120.7, null, 120.6, 120.6, 120.5, null, 120.5] };
    for (const [start, list] of Object.entries(seed)) for (let i = 0; i < 7; i++) if (list[i] != null) await api('PUT', `/api/weights/${addDays(start, i)}`, { kg: list[i] });
    // תיקון: שקילה שגויה בשבוע שעבר, ואז תיקון
    await api('PUT', `/api/weights/${addDays(lw, 2)}`, { kg: 126.0 }); await api('PUT', `/api/weights/${addDays(lw, 2)}`, { kg: 120.6 });
    // ימים מתועדים במלואם בשבוע שעבר (4), ויום אחד לא מתועד (שלא ייחשב כאפס)
    for (let i = 0; i < 5; i++) { const d = addDays(lw, i); await api('POST', '/api/entries', { entries: [{ date: d, meal: 'lunch', foodId: 'm805', grams: 200, status: 'eaten' }, { date: d, meal: 'lunch', foodId: 'm2721', grams: 300, status: 'eaten' }, { date: d, meal: 'dinner', foodId: 'm494', grams: 250, status: 'planned' }] }); if (i < 4) await api('PUT', '/api/days/' + d, { complete: true }); }
    ok('נזרעו 3 שבועות קודמים: 7/7, 5/7, 5/7 שקילות, תיקון שקילה, 4 ימים מתועדים');

    // ---------- 9. סיכום שבועי ----------
    await page.click('.tabbar [data-r="week"]'); await page.getByText('סיכום שבועי').first().waitFor();
    const wtext = await page.locator('#app').innerText(); await shot('14-week');
    assert.match(wtext, /5 מתוך 7 שקילות/);
    const lwVals = seed[lw].filter(x => x != null); const avg = Math.round(lwVals.reduce((a, b) => a + b, 0) / lwVals.length * 100) / 100;
    assert.match(wtext, new RegExp(avg.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).replace('.', '\\.')), `ממוצע = סכום ÷ 5 = ${avg}`);
    // ממוצע האכילה מ-4 ימים מתועדים בלבד: 200 ג׳ עוף (320) + 300 ג׳ אורז (390) = 710; המתוכנן לא נספר; היום החמישי לא נספר
    assert.match(wtext, /710/); assert.match(wtext, /4 ימים מתועדים/);
    await page.click('[data-ck="hunger"] [data-v="3"]'); await page.click('[data-ck="energy"] [data-v="4"]'); await page.click('[data-ck="performance"] [data-v="4"]'); await page.click('[data-ck-save]');
    await page.waitForTimeout(300);
    ok(`סיכום שבועי: ממוצע ${avg} ק״ג (5 מתוך 7, היום החסר לא הוריד את הממוצע), אכילה 710 קק״ל מ-4 ימים, צ׳ק-אין נשמר`);

    // גרף + שקילה בתהליך
    await page.click('.tabbar [data-r="weight"]'); await page.getByText('שבוע בתהליך').first().waitFor(); await shot('15-weight');
    const weightTxt = await page.locator('#app').innerText(); assert.match(weightTxt, /7 מתוך 7 שקילות/);
    // שמירה אחרי סגירה ופתיחה מחדש
    const page2 = await ctx.newPage(); await page2.goto(BASE + '/#/today'); await page2.getByText('היום שלי').first().waitFor();
    assert.match(await page2.locator('.sum').innerText(), new RegExp(String(Math.round(116 * 1.43 + 125 * 0.95))));
    ok('הגרף מסמן שבוע בתהליך; אחרי פתיחה מחדש הנתונים נשמרו');
    // יעד חדש מתאריך — ימים קודמים שומרים את היעד הקודם
    await api('POST', '/api/targets', { kcal: TK - 100, protein: TP, effectiveFrom: addDays(T, 1), reason: 'בדיקה' });
    const hist = (await api('GET', '/api/state')).targets; assert.equal(hist.length, 2);
    assert.equal((await api('GET', '/api/day/' + T)).target.kcal, TK); assert.equal((await api('GET', '/api/day/' + addDays(T, 1))).target.kcal, TK - 100);
    ok('יעד חדש חל מהתאריך שנבחר; היום שומר את היעד הקודם');
    assert.deepEqual(errors, [], 'אין שגיאות JS בדפדפן');
    ok('אין שגיאות בקונסול');
    console.log(`\nהכל עבר. צילומי מסך: ${SHOTS}`);
  } catch (e) {
    await shot('FAIL').catch(() => {}); console.error('✗ נכשל בשלב', step + 1, '\n', e); console.error('JS errors:', errors); process.exitCode = 1;
  } finally { await browser.close(); srv.kill(); }
})();
