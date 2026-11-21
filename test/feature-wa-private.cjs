// בדיקת וואטסאפ פרטי: נוסח מקורי, הכנת הודעות, פתיחת צ׳אט לא מסמנת שליחה, סימון ידני, הבא/הקודם, שמירת מקום.
// לא נשלחת אף הודעה: כל פנייה ל-wa.me / web.whatsapp.com נחסמת בבדיקה.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT_T || 8330, URL = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-wp-'));
const results = []; const step = async (n, f) => { try { await f(); results.push({ n, ok: 1 }); console.log('✓', n); } catch (e) { results.push({ n, ok: 0 }); console.log('✗', n, '\n   ', String(e.message).split('\n')[0]); } };
(async () => {
  const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', IMPORT_ON_START: process.env.BACKUP, COOKIE_SECURE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200));
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  const blocked = []; await ctx.route(/wa\.me|whatsapp\.com/, r => { blocked.push(r.request().url()); r.abort(); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/#/login'); await p.fill('input[name=u]', 'owner'); await p.fill('input[name=p]', 'Owner-pass-1'); await p.click('form button'); await p.waitForSelector('.kpis');
  const SPLIT = 't8uukf1896sndnf6ttno';
  await step('פיצול: הנוסח השמור מהתוכנה הקודמת נטען, והמילוי זהה ל-waFill המקורי', async () => {
    await p.goto(URL + '/#/acc/' + SPLIT); await p.waitForSelector('.li input.ck');
    const boxes = p.locator('.li input.ck[data-ref]'); for (let i = 0; i < 3; i++) await boxes.nth(i).check();
    const t0 = Date.now(); await p.click('#sendpriv'); await p.waitForSelector('#wptpl', { state: 'attached' }); console.log('   sheet ms', Date.now() - t0);
    assert.strictEqual(await p.inputValue('#wptpl'), 'מה קורה?', 'הנוסח השמור בהגדרות wa');
    await p.locator('#sheet details summary').first().click(); await p.click('#wpdef'); const t = await p.inputValue('#wptpl'); assert.ok(t.startsWith('בוקר טוב {שם פרטי} ☀️\n'));
    const msg = await p.locator('[data-msg]').first().inputValue(); assert.ok(/^בוקר טוב \S+ ☀️\nתזכורת לתשלום של היום: [\d,.]+ ₪\./.test(msg), msg);
  });
  let runUrl;
  await step('עריכת הודעה לפני הכנה, והכנת התור (לחיצה כפולה לא יוצרת שני תורים)', async () => {
    await p.locator('[data-msg]').first().fill('הודעה ערוכה לבדיקה');
    await p.locator('#wpgo').dblclick(); await p.waitForURL(/#\/wa-run\//); runUrl = p.url();
    assert.strictEqual(await p.inputValue('#rmsg'), 'הודעה ערוכה לבדיקה');
    const L = await (await ctx.request.get(URL + '/api/docs/wa_private')).json(); assert.strictEqual(L.length, 1);
  });
  await step('פתיחת צ׳אט לא מסמנת ״נשלח״; הקישור הוא wa.me בטלפון עם המספר וההודעה', async () => {
    const href = await p.getAttribute('#ropen', 'href'); assert.ok(/^https:\/\/wa\.me\/9725\d{8}\?text=/.test(href), href);
    assert.ok(decodeURIComponent(href.split('text=')[1]) === 'הודעה ערוכה לבדיקה');
    const [pop] = await Promise.all([ctx.waitForEvent('page').catch(() => null), p.click('#ropen')]); if (pop) await pop.close();
    await p.waitForTimeout(500); await p.reload(); await p.waitForSelector('#cur');
    assert.ok(/נפתח צ׳אט/.test(await p.locator('#cur .pill').innerText())); assert.ok(/^0 מתוך/.test(await p.locator('.band h1').innerText()));
  });
  await step('סימון ״שלחתי״ ידני מעביר לבא; הקודם/הבא; תיקון סימון שגוי', async () => {
    await p.click('#rsent'); await p.waitForTimeout(400);
    assert.ok(/לקוח 2 מתוך/.test(await p.locator('#cur').innerText())); assert.ok(/^1 מתוך/.test(await p.locator('.band h1').innerText()));
    await p.click('#rprev'); await p.waitForTimeout(300); assert.ok(/לקוח 1 מתוך/.test(await p.locator('#cur').innerText()));
    await p.click('#rsent'); await p.waitForTimeout(400); assert.ok(/^0 מתוך/.test(await p.locator('.band h1').innerText()), 'ביטול סימון');
    await p.click('#rsent'); await p.waitForTimeout(400);
  });
  await step('חזרה ליומן ושוב לתור — המקום נשמר', async () => {
    await p.goto(URL + '/#/acc/' + SPLIT); await p.waitForSelector('.li input.ck');
    await p.goto(runUrl); await p.waitForSelector('#cur'); assert.ok(/לקוח 2 מתוך/.test(await p.locator('#cur').innerText()));
  });
  await step('איסוף יום: הנוסח MB המקורי עם החלפת ״בשעה״/״הגובה״, ומשורה בודדת', async () => {
    await p.goto(URL + '/#/acc/z9mnxtxbzigl56w7b4z1'); await p.waitForSelector('.li[data-row]');
    await p.locator('.li[data-row] .t').first().click(); await p.waitForSelector('#rpriv'); await p.click('#rpriv'); await p.waitForSelector('#wptpl', { state: 'attached' });
    assert.strictEqual(await p.inputValue('#wptpl'), 'בוקר טוב {שם}, תזכורת לתשלום היום בסך {סכום} ₪. הגובה {גובה} יגיע בשעה {שעה}. תודה ויום טוב.');
    const m = await p.locator('[data-msg]').first().inputValue(); assert.ok(/^בוקר טוב .+, תזכורת לתשלום היום בסך [\d,.]+ ₪\. הגובה \S+ יגיע (בשעה \d\d:\d\d|במהלך היום)\. תודה ויום טוב\.$/.test(m), m);
  });
  await step('במחשב נפתח WhatsApp Web', async () => {
    const d = await b.newContext({ viewport: { width: 1300, height: 900 } }); await d.route(/wa\.me|whatsapp\.com/, r => r.abort());
    const q = await d.newPage(); await q.goto(URL + '/#/login'); await q.fill('input[name=u]', 'owner'); await q.fill('input[name=p]', 'Owner-pass-1'); await q.click('form button'); await q.waitForSelector('.kpis');
    await q.goto(runUrl); await q.waitForSelector('#ropen'); assert.ok((await q.getAttribute('#ropen', 'href')).startsWith('https://web.whatsapp.com/send?phone=972'));
    await d.close();
  });
  await step('לא נשלחה אף הודעה אמיתית ואין שגיאות דף', async () => { assert.ok(blocked.every(u => /wa\.me|whatsapp/.test(u))); assert.deepStrictEqual(errs, []); });
  await b.close(); srv.kill();
  const bad = results.filter(r => !r.ok).length; console.log(`\n${results.length - bad}/${results.length} עברו`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
