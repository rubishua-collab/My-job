// שכבת נגישות (ת"י 5568 / WCAG 2.1 AA): קישור דילוג, ניווט מקלדת, השלמת סמנטיקה ותפריט נגישות צף.
// לא משנה את העיצוב הרגיל — רק מוסיף מצבים שהמשתמש בוחר. ההגדרות נשמרות ב-localStorage (מפתח בלי "tafrit" כדי שלא יימחקו בהתנתקות).
import { API_BASE } from './config.js';
const KEY = 'a11y-settings';
export const STATEMENT_URL = (API_BASE || '') + '/accessibility';
const DEF = { text: 0, contrast: 'none', gray: false, links: false, headings: false, motion: false, readable: false };
const root = document.documentElement;

function load() { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } }
function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
let S = load();

/** מחיל את ההגדרות כ-data-attributes על <html>; כל העיצוב ב-a11y.css */
function apply() {
  root.dataset.a11yText = String(S.text);
  const wasDark = root.dataset.a11yDark === '1';
  if (S.contrast === 'dark') { root.dataset.theme = 'dark'; root.dataset.a11yDark = '1'; }
  else { if (wasDark) delete root.dataset.theme; delete root.dataset.a11yDark; }
  for (const [k, attr] of [['gray', 'a11yGray'], ['links', 'a11yLinks'], ['headings', 'a11yHeadings'], ['motion', 'a11yMotion'], ['readable', 'a11yReadable']]) {
    if (S[k]) root.dataset[attr] = '1'; else delete root.dataset[attr];
  }
  if (S.contrast === 'high') root.dataset.a11yContrast = 'high'; else delete root.dataset.a11yContrast;
}
apply(); // מיד, לפני הציור הראשון

// ---- מקלדת: מסגרת פוקוס בולטת רק כשמנווטים במקלדת (גם בשדות קלט) ----
document.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) root.dataset.kbd = '1'; }, true);
document.addEventListener('pointerdown', () => { delete root.dataset.kbd; }, true);

// ---- אלמנטים לחיצים שאינם כפתור (שורות ברשימות) — מקבלים role=button, tabindex ו-Enter/רווח ----
const CLICKABLE = 'li[data-u],li[data-food],li[data-fixed],li[data-dish],li[data-go],li[data-sec],li[data-r],li[data-c],li[data-fm],li[data-plan],li[data-entry],li[data-k],li[data-w]';
// אייקונים/אימוג׳י קישוטיים ליד טקסט
const DECOR = '.actions3 .ic, .tabbar .i, .grab';
function enhance(scope) {
  if (!(scope instanceof Element)) return;
  const list = scope.matches?.(CLICKABLE) ? [scope, ...scope.querySelectorAll(CLICKABLE)] : scope.querySelectorAll(CLICKABLE);
  // תפקיד הכפתור ניתן לתוכן הראשון בשורה (ולא ל-li עצמו) — כך הרשימה נשארת רשימה לקורא המסך, והלחיצה עולה לשורה
  for (const el of list) {
    const t = el.firstElementChild && !el.firstElementChild.matches('button, a, input, select, textarea, label') ? el.firstElementChild : el;
    if (t === el && el.parentElement?.matches('ul, ol')) el.parentElement.setAttribute('role', 'none');
    if (!t.hasAttribute('role')) t.setAttribute('role', 'button');
    if (!t.hasAttribute('tabindex')) t.tabIndex = 0;
  }
  for (const el of scope.querySelectorAll(DECOR)) el.setAttribute('aria-hidden', 'true');
  for (const img of scope.querySelectorAll('img:not([alt])')) img.alt = '';
  // הודעות שגיאה ואזהרה שנוספות למסך — מוקראות מיד
  const notes = scope.matches?.('.note.err, .note.warn') ? [scope] : scope.querySelectorAll('.note.err, .note.warn');
  for (const n of notes) if (!n.hasAttribute('role')) n.setAttribute('role', 'alert');
  for (const c of scope.querySelectorAll('#er, #err, [id$="err"]')) if (!c.hasAttribute('aria-live')) c.setAttribute('aria-live', 'polite');
  fixHeadings();
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target; if (!(t instanceof Element) || t.getAttribute('role') !== 'button' || /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
  e.preventDefault(); t.click();
});

/** היררכיית כותרות במסך הראשי: אחרי h1 באות כותרות h3 בכרטיסים — מסמנים אותן ברמה 2 (בלי לשנות מראה) */
function fixHeadings() {
  const app = document.getElementById('app'); if (!app) return;
  const hasH2 = !!app.querySelector('h2');
  for (const h of app.querySelectorAll('h3')) {
    if (!hasH2) { h.setAttribute('role', 'heading'); h.setAttribute('aria-level', '2'); }
  }
  const h1 = app.querySelector('h1'); if (h1) { const t = h1.textContent.trim(); const title = t && t !== 'תפריטי פרו' ? `${t} — תפריטי פרו` : 'תפריטי פרו'; if (document.title !== title && !/\/(privacy|accessibility|delete-account)/.test(location.pathname)) document.title = title; }
}

// ---- קישור "דלג לתוכן המרכזי" ----
function skipLink() {
  if (document.querySelector('.skip-link')) return;
  const main = document.querySelector('main'); if (!main) return;
  if (!main.id) main.id = 'main';
  if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
  const a = document.createElement('a'); a.className = 'skip-link'; a.href = '#' + main.id; a.textContent = 'דלג לתוכן המרכזי';
  // הניתוב באפליקציה לפי #/… — לכן לא משנים את הכתובת, רק מעבירים פוקוס
  a.addEventListener('click', e => { e.preventDefault(); const m = document.querySelector('main'); m?.focus(); m?.scrollIntoView({ block: 'start' }); });
  document.body.prepend(a);
}

// ---- תפריט נגישות צף ----
const TEXT = ['רגיל', 'מוגדל', 'מוגדל מאוד'];
const CONTRAST = [['none', 'רגיל'], ['high', 'ניגודיות גבוהה'], ['dark', 'מצב כהה']];
const TOGGLES = [['gray', 'גווני אפור'], ['links', 'הדגשת קישורים'], ['headings', 'הדגשת כותרות ופוקוס'], ['motion', 'עצירת אנימציות'], ['readable', 'פונט קריא וריווח']];
function widget() {
  if (document.getElementById('a11y-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'a11y-fab'; fab.type = 'button'; fab.className = 'a11y-fab';
  fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'a11y-panel'); fab.setAttribute('aria-label', 'תפריט נגישות');
  fab.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><circle cx="12" cy="4" r="2" fill="currentColor"/><path d="M4 7.5l8 1.5 8-1.5M12 9v5m0 0l-3.5 7M12 14l3.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const panel = document.createElement('div');
  panel.id = 'a11y-panel'; panel.className = 'a11y-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'a11y-title');
  document.body.append(fab, panel);
  const draw = () => {
    panel.innerHTML = `<div class="a11y-head"><h2 id="a11y-title">התאמות נגישות</h2><button type="button" class="a11y-x" data-a11y-close aria-label="סגירת תפריט הנגישות">✕</button></div>
      <div class="a11y-group" role="group" aria-labelledby="a11y-t-text"><div id="a11y-t-text" class="a11y-lbl">גודל טקסט</div>
        <div class="a11y-row">${TEXT.map((l, i) => `<button type="button" data-a11y-text="${i}" aria-pressed="${S.text === i}">${l}</button>`).join('')}</div></div>
      <div class="a11y-group" role="group" aria-labelledby="a11y-t-con"><div id="a11y-t-con" class="a11y-lbl">צבעים וניגודיות</div>
        <div class="a11y-row">${CONTRAST.map(([k, l]) => `<button type="button" data-a11y-contrast="${k}" aria-pressed="${S.contrast === k}">${l}</button>`).join('')}</div></div>
      <div class="a11y-group a11y-toggles">${TOGGLES.map(([k, l]) => `<button type="button" data-a11y-toggle="${k}" aria-pressed="${!!S[k]}"><span class="a11y-box" aria-hidden="true">${S[k] ? '✓' : ''}</span>${l}</button>`).join('')}</div>
      <button type="button" class="a11y-reset" data-a11y-reset>איפוס הגדרות נגישות</button>
      <a class="a11y-statement" href="${STATEMENT_URL}" target="_blank" rel="noopener">הצהרת נגישות</a>
      <p class="a11y-live" role="status" aria-live="polite"></p>`;
  };
  const live = msg => { const el = panel.querySelector('.a11y-live'); if (el) el.textContent = msg; };
  const open = () => { draw(); panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); panel.querySelector('button')?.focus(); };
  const close = (focusFab = true) => { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); if (focusFab) fab.focus(); };
  fab.addEventListener('click', () => panel.hidden ? open() : close());
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const focusSel = [...b.attributes].filter(a => a.name.startsWith('data-a11y')).map(a => `[${a.name}="${a.value}"]`).join('');
    if (b.dataset.a11yClose !== undefined) return close();
    if (b.dataset.a11yText !== undefined) { S.text = +b.dataset.a11yText; live(`גודל טקסט: ${TEXT[S.text]}`); }
    else if (b.dataset.a11yContrast) { S.contrast = b.dataset.a11yContrast; live(`צבעים: ${CONTRAST.find(c => c[0] === S.contrast)[1]}`); }
    else if (b.dataset.a11yToggle) { const k = b.dataset.a11yToggle; S[k] = !S[k]; live(`${TOGGLES.find(t => t[0] === k)[1]}: ${S[k] ? 'מופעל' : 'כבוי'}`); }
    else if (b.dataset.a11yReset !== undefined) { S = { ...DEF }; try { localStorage.removeItem(KEY); } catch {} apply(); draw(); live('הגדרות הנגישות אופסו'); panel.querySelector('[data-a11y-reset]')?.focus(); return; }
    else return;
    store(S); apply(); const msg = panel.querySelector('.a11y-live')?.textContent; draw(); live(msg); panel.querySelector(focusSel)?.focus();
  });
  // Esc סוגר; Tab נשאר בתוך הפאנל כשהוא פתוח
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button, a[href]')]; if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  document.addEventListener('pointerdown', e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) close(false); });
}

// ---- מסך שצויר מחדש אחרי פעולה (כוס מים, נעילה, אכלתי): משתמש מקלדת חוזר לאותו כפתור ולא לראש הדף ----
let lastSig = null;
const CSSesc = v => (window.CSS?.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));
function signature(el) {
  if (!(el instanceof Element) || el === document.body) return null;
  if (el.id && !/^sheet-title-/.test(el.id)) return '#' + CSSesc(el.id);
  const d = [...el.attributes].find(a => a.name.startsWith('data-') && !a.name.startsWith('data-a11y'));
  if (d) { const inMeal = el.closest('[data-meal]'); return (inMeal ? `[data-meal="${CSSesc(inMeal.dataset.meal)}"] ` : '') + `${el.tagName.toLowerCase()}[${d.name}="${CSSesc(d.value)}"]`; }
  return null;
}
document.addEventListener('focusin', e => { const sig = signature(e.target); if (sig) lastSig = sig; });
function restoreFocus() {
  if (!root.dataset.kbd || !lastSig) return;
  const a = document.activeElement; if (a && a !== document.body && document.contains(a)) return;
  const el = document.querySelector(lastSig); if (el && !el.closest('[inert]')) el.focus({ preventScroll: false });
}

function init() {
  skipLink(); widget(); enhance(document.body);
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n); queueMicrotask(restoreFocus); }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
