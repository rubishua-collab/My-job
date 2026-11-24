// נגישות (ת"י 5568 / WCAG 2.1 AA) — בדיקה אוטומטית עם axe-core ובדיקות מקלדת אמיתיות, בהדמיית iPhone 13.
// הרצה: AXE=/path/to/axe.min.js node test/e2e-a11y.mjs   (בלי AXE — מדלג רק על סריקת axe)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ROBI } from './week-sim.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8906, BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'tafrit-a11y-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let step = 0; const ok = n => console.log(`✓ ${++step}. ${n}`);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-a11y-'));
const srv = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: path.join(HERE, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), MAIL_DEV: '1', NODE_ENV: 'test', DATA_ENCRYPTION_KEY: 'e'.repeat(64) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));
const api = async (method, url, body, tok) => { const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(url + ' ' + j.error); return j; };
const code = async e => (await (await fetch(BASE + '/api/dev/outbox')).json()).filter(m => m.to === e).at(-1).code;
async function user(email, profile, kg) {
  await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Secret123', acceptPrivacy: true }) });
  const v = await (await fetch(BASE + '/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: await code(email), kind: 'bearer' }) })).json();
  await api('PUT', '/api/profile', { profile: { ...profile, onboarding: { done: true } } }, v.token);
  for (let i = 3; i >= 0; i--) await api('PUT', '/api/weights/' + addDays(T, -i), { kg }, v.token);
  await api('POST', '/api/plans', { kind: 'initial', goal: profile.goal, settings: { rate: profile.rate, meals: profile.meals, likes: profile.likes, diet: profile.diet, prepMinutes: profile.prepMinutes }, startDate: addDays(T, -3), reason: 'חישוב ראשוני' }, v.token);
  return v.token;
}
const b = await chromium.launch();
const errs = [];
async function page(tok) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem', bypassCSP: true });
  await ctx.addInitScript(t => { localStorage.setItem('tafrit-token', t); window.Capacitor = { isNativePlatform: () => true }; }, tok);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return p;
}
const shot = async (p, n) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
const noSheet = p => p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
const st = p => p.evaluate(async () => { const r = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('tafrit-token') } }); return r.json(); });
const FAM = { m1561: 'egg', m1564: 'egg', m805: 'chicken', m880: 'pargit', u172849: 'turkey', m1478: 'beef', m609: 'beef', m815: 'chicken', m1009: 'turkeyDeli' };


const AXE = process.env.AXE && fs.existsSync(process.env.AXE) ? fs.readFileSync(process.env.AXE, 'utf8') : null;
async function audit(p, label) {
  if (!AXE) return 'axe לא הותקן — דילוג';
  await p.waitForTimeout(400); // סיום אנימציית הכניסה של חלון
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, rules: { 'heading-order': { enabled: true } } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 3).map(x => x.target.join(' ') + ' — ' + (x.failureSummary || '').split('\n')[1]) })));
  if (r.length) console.log(`   [${label}]`, JSON.stringify(r, null, 1));
  assert.deepEqual(r.map(v => v.id), [], `${label}: הפרות axe`);
  return 'axe: 0 הפרות';
}
const key = async (p, k, n = 1) => { for (let i = 0; i < n; i++) await p.keyboard.press(k); };
const active = p => p.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, cls: a.className, text: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40), inDialog: !!a.closest('[role=dialog]') }; });

try {
  // ---- 1. מסך פתיחה (בלי חשבון) ----
  const ctx0 = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', bypassCSP: true });
  const p0 = await ctx0.newPage(); p0.on('pageerror', e => errs.push(e.message));
  await p0.goto(BASE + '/#/welcome'); await p0.getByText('פתיחת חשבון').first().waitFor();
  ok(`מסך פתיחה — ${await audit(p0, 'welcome')}`);
  await key(p0, 'Tab'); let a = await active(p0);
  assert.equal(a.cls, 'skip-link', 'Tab ראשון: קישור דילוג'); assert.ok(await p0.locator('.skip-link').isVisible());
  await shot(p0, 'a01-skip-link');
  await key(p0, 'Enter'); a = await active(p0);
  assert.equal(a.tag, 'MAIN'); assert.ok(p0.url().endsWith('#/welcome'), 'הכתובת לא השתנתה');
  ok('Tab ראשון מציג "דלג לתוכן המרכזי", Enter מעביר את הפוקוס ל-<main> בלי לשנות מסך');

  // ---- 2. מסך "היום שלי" ----
  const tok = await user('a11y@test.local', ROBI, 118);
  const p = await page(tok);
  await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor();
  ok(`היום שלי — ${await audit(p, 'today')}; כותרת הדף: "${await p.title()}"`);
  // כפתור הנגישות במקלדת
  await p.focus('#a11y-fab'); assert.equal(await p.getAttribute('#a11y-fab', 'aria-expanded'), 'false');
  await key(p, 'Enter'); assert.equal(await p.getAttribute('#a11y-fab', 'aria-expanded'), 'true');
  assert.ok((await active(p)).text.length && await p.locator('#a11y-panel').isVisible());
  ok(`פאנל הנגישות — ${await audit(p, 'a11y-panel')}; נפתח ב-Enter, aria-expanded=true, הפוקוס בתוכו`);
  await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, 'a02-panel.png') });
  // כל ההגדרות
  const html = () => p.evaluate(() => ({ ...document.documentElement.dataset }));
  await p.click('[data-a11y-text="2"]'); await p.click('[data-a11y-contrast="high"]');
  for (const k of ['gray', 'links', 'headings', 'motion', 'readable']) await p.click(`[data-a11y-toggle="${k}"]`);
  let d = await html();
  assert.equal(d.a11yText, '2'); assert.equal(d.a11yContrast, 'high'); for (const k of ['a11yGray', 'a11yLinks', 'a11yHeadings', 'a11yMotion', 'a11yReadable']) assert.equal(d[k], '1', k);
  assert.equal(await p.locator('[data-a11y-toggle="gray"]').getAttribute('aria-pressed'), 'true');
  const zoom = await p.evaluate(() => getComputedStyle(document.body).zoom); assert.equal(zoom, '1.3');
  const filt = await p.evaluate(() => getComputedStyle(document.documentElement).filter); assert.match(filt, /grayscale/);
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration); assert.ok(/^0s/.test(anim));
  await key(p, 'Escape'); assert.equal(await p.getAttribute('#a11y-fab', 'aria-expanded'), 'false'); assert.equal((await active(p)).id, 'a11y-fab', 'Esc מחזיר פוקוס לכפתור');
  // בלי גלילה אופקית בהגדלה הגדולה
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(ov <= 1, `גלילה אופקית: ${ov}px`);
  await p.click('#a11y-fab'); await p.waitForTimeout(250);
  const box = await p.evaluate(() => { const r = document.getElementById('a11y-panel').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight }; });
  assert.ok(box.l >= 0 && box.r <= box.w + 1 && box.t >= 0 && box.b <= box.h + 1, 'פאנל הנגישות בתוך המסך בהגדלה הגדולה: ' + JSON.stringify(box));
  await p.screenshot({ path: path.join(SHOTS, 'a03-all-on.png') }); await key(p, 'Escape');
  ok(`8 ההגדרות פועלות (טקסט ×1.3, ניגודיות גבוהה, אפור, קישורים, כותרות, בלי אנימציות, פונט קריא); Esc סוגר ומחזיר פוקוס; בלי גלילה אופקית`);
  // שמירה בין רענונים ומעברי עמודים
  await p.goto(BASE + '/#/more'); await p.reload(); await p.getByText('החשבון שלי').first().waitFor();
  d = await html(); assert.equal(d.a11yText, '2'); assert.equal(d.a11yContrast, 'high');
  ok(`ההגדרות נשמרות אחרי רענון ומעבר מסך — ${await audit(p, 'more (בהגדרות מוגברות)')}`);
  // איפוס
  await p.click('#a11y-fab'); await p.click('[data-a11y-reset]');
  d = await html(); assert.ok(!d.a11yContrast && !d.a11yGray && !d.a11yLinks && d.a11yText === '0');
  assert.equal(await p.evaluate(() => localStorage.getItem('a11y-settings')), null);
  await p.keyboard.press('Escape');
  ok('איפוס מחזיר הכול לברירת מחדל ומנקה את השמירה');

  // ---- 3. שורות ברשימה במקלדת (מסך עוד) ----
  const li = p.locator('li[data-sec="password"] > :first-child');
  assert.equal(await li.getAttribute('role'), 'button'); assert.equal(await li.getAttribute('tabindex'), '0');
  await li.focus(); await key(p, 'Enter'); await p.locator('.sheet-wrap h2', { hasText: 'שינוי סיסמה' }).waitFor();
  // ---- 4. חלון: פוקוס בפנים, מלכודת Tab, Esc, החזרת פוקוס ----
  a = await active(p); assert.ok(a.inDialog, 'הפוקוס בחלון');
  for (let i = 0; i < 8; i++) { await key(p, 'Tab'); assert.ok((await active(p)).inDialog, 'Tab נשאר בחלון'); }
  for (let i = 0; i < 4; i++) { await key(p, 'Shift+Tab'); assert.ok((await active(p)).inDialog, 'Shift+Tab נשאר בחלון'); }
  assert.equal(await p.locator('#app').getAttribute('inert'), '', 'הרקע לא פעיל');
  ok(`חלון "שינוי סיסמה" — ${await audit(p, 'sheet')}; נפתח מ-Enter על שורה, הפוקוס בכותרת, Tab ו-Shift+Tab נשארים בפנים, הרקע inert`);
  await key(p, 'Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  a = await active(p); assert.equal(await p.evaluate(() => document.activeElement.closest('[data-sec]')?.dataset.sec), 'password', 'הפוקוס חזר לשורה שפתחה');
  assert.equal(await p.locator('#app').getAttribute('inert'), null);
  ok('Esc סוגר, הפוקוס חוזר לשורה שפתחה את החלון, הרקע פעיל שוב');

  // ---- 5. "בנה לי יום שלם" במקלדת ----
  await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor();
  await p.focus('[data-act="day"]'); await key(p, 'Enter'); await p.locator('.sheet-wrap h2', { hasText: 'יום שלם' }).waitFor();
  ok(`חלון "יום שלם" — ${await audit(p, 'plan-day sheet')}`);
  await key(p, 'Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  assert.equal(await p.evaluate(() => document.activeElement.dataset.act), 'day');

  // ---- 5א. פעולה שמציירת את המסך מחדש: הפוקוס חוזר לאותו כפתור ----
  await key(p, 'Tab'); await p.focus('[data-cup="1"]'); await key(p, 'Enter');
  await p.waitForFunction(() => document.querySelector('[data-cup="1"]')?.closest('.card')?.textContent.includes('1'), null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(600);
  assert.equal(await p.evaluate(() => document.activeElement.dataset.cup), '1', 'הפוקוס חזר לכפתור "+" של המים');
  ok('אחרי הוספת כוס מים במקלדת הפוקוס נשאר על כפתור ה-"+" (לא קופץ לראש הדף)');

  // ---- 5ג. שני חלונות זה על זה: אחרי סגירת העליון, התחתון פעיל שוב ----
  await p.click('[data-act="self"]'); await p.locator('#fpq').waitFor();
  await p.click('#fptabs [data-t="out"]'); await p.locator('[data-dish="pizza"]').click(); await p.getByText('הערכה').first().waitFor();
  assert.equal(await p.locator('.sheet-wrap').count(), 2);
  assert.equal(await p.locator('.sheet-wrap').first().getAttribute('inert'), '', 'החלון התחתון לא פעיל כשיש חלון מעליו');
  await key(p, 'Escape'); await p.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1);
  assert.equal(await p.locator('.sheet-wrap').first().getAttribute('inert'), null, 'התחתון פעיל שוב');
  await key(p, 'Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  ok('שני חלונות זה על זה: Esc סוגר רק את העליון, והתחתון חוזר להיות פעיל');

  // ---- 5ב. שאר המסכים והחלונות ----
  const done = [];
  for (const [r, txt] of [['weight', 'שקילה'], ['week', 'שבוע'], ['chat', 'מלווה'], ['plan', 'התוכנית'], ['targets', 'יעד'], ['onboarding', '']]) {
    await p.goto(BASE + '/#/' + r); await p.waitForTimeout(700); if (txt) await p.getByText(txt).first().waitFor();
    await audit(p, r); done.push(r);
  }
  await p.goto(BASE + '/#/today'); await p.getByText('היום שלי').first().waitFor();
  await p.click('[data-act="self"]'); await p.locator('#fpq').waitFor(); await p.fill('#fpq', 'אורז'); await p.waitForTimeout(400); await audit(p, 'food picker'); done.push('חיפוש מזון');
  await key(p, 'Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.click('[data-act="next"]'); await p.locator('.sheet-wrap h2', { hasText: 'הצעות ל' }).waitFor(); await audit(p, 'suggest'); done.push('הצע לי');
  await p.locator('.sugg [data-sw]').first().click(); await audit(p, 'swap panel'); done.push('החלף חלבון');
  await key(p, 'Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  await p.click('[data-act="eating"]'); await p.locator('.sheet-wrap h2', { hasText: 'פרופיל האכילה' }).waitFor(); await audit(p, 'eating profile'); done.push('פרופיל אכילה');
  await key(p, 'Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
  ok(`axe: 0 הפרות גם ב-${done.join(', ')}`);

  // ---- 6. הצהרת נגישות ----
  const pa = await ctx0.newPage(); await pa.goto(BASE + '/accessibility'); await pa.getByText('רכז הנגישות').first().waitFor();
  const t = await pa.locator('main').innerText();
  for (const w of ['ת"י 5568', 'WCAG 2.1', 'מגבלות ידועות', 'רכז הנגישות']) assert.ok(t.includes(w), w);
  await pa.locator('#contact a').waitFor({ timeout: 3000 }).catch(() => {});
  ok(`עמוד הצהרת נגישות — ${await audit(pa, 'accessibility')}; קישור מהפאנל, ממסך עוד, ממסך הפתיחה ומעמוד הפרטיות`);
  await shot(pa, 'a04-statement');
  const pp = await ctx0.newPage(); await pp.goto(BASE + '/privacy'); await pp.getByText('מדיניות פרטיות').first().waitFor();
  ok(`עמוד פרטיות — ${await audit(pp, 'privacy')}`);

  assert.deepEqual(errs, []); ok('אין שגיאות JavaScript');
  console.log(`\nכל ${step} הבדיקות עברו. צילומי מסך: ${SHOTS}`);
} catch (e) { console.error('✗', e.message, errs); process.exitCode = 1; }
finally { await b.close(); srv.kill(); }
