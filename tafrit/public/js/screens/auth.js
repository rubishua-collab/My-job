// פתיחת חשבון וכניסה: מסך פתיחה עם הסבר פרטיות, הרשמה, אימות כתובת, כניסה ושחזור סיסמה
import { route, go } from '../app.js';
import { D, refresh } from '../data.js';
import { save, setToken, isApp, apiUrl } from '../api.js';
import { $, esc, toast } from '../ui.js';

export const PRIVACY_URL = () => apiUrl('/privacy');
const kind = () => isApp() ? 'bearer' : 'cookie';
const device = () => (navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/) || ['web'])[0];
let pendingEmail = '';

/** מה נשמר ולמה — מוצג לפני ההרשמה */
export function privacySummaryHtml() {
  const ai = D.session?.ai;
  return `<div class="card stack small">
    <div><b>מה נשמר בחשבון שלך:</b> דוא״ל וסיסמה (מוצפנת), פרטי השאלון (גיל, מין, גובה, מטרה, פעילות, העדפות מזון, אלרגיות והנחיות רפואיות שבחרת לציין), שקילות, יומן אכילה, תפריטים, יעדים ושיחות עם מלווה התזונה.</div>
    <div><b>למה:</b> כדי לחשב לך יעדים, להציע ארוחות, להציג ממוצעים שבועיים ולשמור את ההיסטוריה שלך בכל מכשיר. לא משתמשים במידע לפרסום ולא מוכרים אותו.</div>
    <div><b>מי רואה:</b> רק אתה, ומנהל האפליקציה (רובי שועה) שיכול לצפות בפרופיל לצורכי תמיכה ובקרה. כל צפייה של המנהל נרשמת ביומן מוגן. משתמשים אחרים לא יכולים לראות את המידע שלך.</div>
    <div><b>מלווה התזונה:</b> ${ai ? 'אם תבחר להפעיל את המלווה החכם, השאלה שלך והנתונים הדרושים לתשובה (יעדים, מה שאכלת היום, שקילות אחרונות והעדפות מזון — בלי שם ובלי דוא״ל) יישלחו לספק הבינה המלאכותית Anthropic. נבקש את הסכמתך לפני ההעברה הראשונה. בלי הסכמה המלווה עובד במצב בסיסי בתוך השרת שלנו.' : 'המלווה עובד בתוך השרת שלנו, בלי ספק חיצוני.'}</div>
    <div><b>אבטחה:</b> התעבורה מוצפנת (HTTPS) והמידע האישי מוצפן באחסון ובגיבויים.</div>
    <div><b>מחיקה:</b> אפשר למחוק את החשבון וכל המידע בכל רגע מ״עוד ← החשבון שלי״, או מעמוד מחיקת החשבון באתר.</div>
    <a href="${esc(PRIVACY_URL())}" target="_blank" rel="noopener">מדיניות הפרטיות המלאה ↗</a></div>`;
}

const shell = (title, body) => `<div class="stack" style="padding-top:6vh"><div class="row" style="gap:12px"><img src="/icons/icon-192.png" alt="" width="52" height="52" style="border-radius:14px"><div><h1>תפריט יומי רובי</h1><div class="muted small">${esc(title)}</div></div></div>${body}</div>`;

route('welcome', async (el) => {
  el.innerHTML = shell('תזונה אישית: יעדים, יומן, שקילות ומלווה', `
    <p>אפליקציה שעוזרת לך לבחור מה לאכול היום, לעקוב אחרי שקילות הבוקר ולהתאים את היעד לפי ההתקדמות.</p>
    <h2 style="margin-top:8px">לפני שנרשמים — מה חשוב לדעת</h2>${privacySummaryHtml()}
    <a class="btn block xl" href="#/signup">פתיחת חשבון</a>
    <a class="btn block plain" href="#/login">כבר יש לי חשבון — כניסה</a>`);
});

route('signup', async (el) => {
  el.innerHTML = shell('פתיחת חשבון', `<form id="f" class="stack" novalidate>
    <label class="field"><span>דוא״ל</span><input class="in" id="em" type="email" autocomplete="email" inputmode="email" dir="ltr" required></label>
    <label class="field"><span>סיסמה (8 תווים לפחות, אותיות וספרות)</span><input class="in" id="pw" type="password" autocomplete="new-password" dir="ltr" required></label>
    <label class="row" style="gap:10px;align-items:flex-start"><input type="checkbox" id="ok" style="width:24px;height:24px;flex:none"><span class="small">קראתי והבנתי <a href="${esc(PRIVACY_URL())}" target="_blank" rel="noopener">את מדיניות הפרטיות</a>, כולל שמנהל האפליקציה יכול לצפות בפרופיל שלי.</span></label>
    <div id="er"></div><button class="btn block xl">הרשמה</button></form>
    <details class="how"><summary>מה נשמר ולמה?</summary>${privacySummaryHtml()}</details>
    <a class="btn block plain" href="#/login">כבר יש לי חשבון</a>`);
  $('#f', el).onsubmit = async e => {
    e.preventDefault(); const er = $('#er', el); er.innerHTML = '';
    if (!$('#ok', el).checked) { er.innerHTML = '<div class="note warn">כדי להירשם צריך לאשר את מדיניות הפרטיות</div>'; return; }
    try { pendingEmail = $('#em', el).value.trim(); await save('POST', '/api/auth/register', { email: pendingEmail, password: $('#pw', el).value, acceptPrivacy: true }, { quiet: true }); go('#/verify'); }
    catch (x) { er.innerHTML = `<div class="note err">${esc(x.message)}</div>`; }
  };
});

route('verify', async (el) => {
  el.innerHTML = shell('אימות כתובת הדוא״ל', `<p>שלחנו קוד בן 6 ספרות אל <b dir="ltr">${esc(pendingEmail || '…')}</b>. הקוד תקף ל-15 דקות.</p>
    <form id="f" class="stack" novalidate>${pendingEmail ? '' : '<label class="field"><span>דוא״ל</span><input class="in" id="em" type="email" dir="ltr" autocomplete="email"></label>'}
    <input class="in big" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="קוד אימות">
    <div id="er"></div><button class="btn block xl">אימות וכניסה</button></form>
    <button class="btn block plain" id="rs">שלחו לי קוד חדש</button>`);
  const email = () => pendingEmail || $('#em', el).value.trim();
  $('#f', el).onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await save('POST', '/api/auth/verify', { email: email(), code: $('#cd', el).value, kind: kind() }, { quiet: true });
      await signedIn(r);
    } catch (x) { $('#er', el).innerHTML = `<div class="note err">${esc(x.message)}</div>`; }
  };
  $('#rs', el).onclick = async () => { try { await save('POST', '/api/auth/resend', { email: email() }, { quiet: true }); toast('נשלח קוד חדש'); } catch (x) { toast(x.message); } };
});

route('login', async (el) => {
  el.innerHTML = shell('כניסה', `<form id="f" class="stack" novalidate>
    <label class="field"><span>דוא״ל</span><input class="in" id="em" type="email" autocomplete="username" inputmode="email" dir="ltr" required></label>
    <label class="field"><span>סיסמה</span><input class="in" id="pw" type="password" autocomplete="current-password" dir="ltr" required></label>
    <div id="er"></div><button class="btn block xl">כניסה</button></form>
    <a class="btn block plain" href="#/forgot">שכחתי סיסמה</a><a class="btn block plain" href="#/welcome">פתיחת חשבון חדש</a>`);
  $('#f', el).onsubmit = async e => {
    e.preventDefault();
    try {
      pendingEmail = $('#em', el).value.trim();
      const r = await save('POST', '/api/auth/login', { email: pendingEmail, password: $('#pw', el).value, kind: kind(), device: device() }, { quiet: true });
      if (r.needsVerify) { toast('צריך לאמת את הכתובת — שלחנו קוד'); return go('#/verify'); }
      await signedIn(r);
    } catch (x) { $('#er', el).innerHTML = `<div class="note err">${esc(x.message)}</div>`; }
  };
});

route('forgot', async (el) => {
  el.innerHTML = shell('שחזור סיסמה', `<form id="f1" class="stack" novalidate><label class="field"><span>דוא״ל</span><input class="in" id="em" type="email" dir="ltr" autocomplete="email" value="${esc(pendingEmail)}"></label><button class="btn block">שלחו לי קוד</button></form>
    <form id="f2" class="stack hidden" novalidate><p class="small">אם יש חשבון עם הכתובת הזו, נשלח אליה קוד.</p>
      <input class="in big" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="קוד">
      <label class="field"><span>סיסמה חדשה</span><input class="in" id="pw" type="password" autocomplete="new-password" dir="ltr"></label>
      <div id="er"></div><button class="btn block xl">שמירת סיסמה חדשה</button></form>
    <a class="btn block plain" href="#/login">חזרה לכניסה</a>`);
  $('#f1', el).onsubmit = async e => { e.preventDefault(); pendingEmail = $('#em', el).value.trim(); try { await save('POST', '/api/auth/forgot', { email: pendingEmail }, { quiet: true }); $('#f2', el).classList.remove('hidden'); } catch (x) { toast(x.message); } };
  $('#f2', el).onsubmit = async e => {
    e.preventDefault();
    try { await save('POST', '/api/auth/reset', { email: pendingEmail, code: $('#cd', el).value, password: $('#pw', el).value }, { quiet: true }); toast('הסיסמה עודכנה. כל המכשירים נותקו — היכנס מחדש'); go('#/login'); }
    catch (x) { $('#er', el).innerHTML = `<div class="note err">${esc(x.message)}</div>`; }
  };
});

async function signedIn(r) {
  if (r.token) setToken(r.token);
  D.session = { ...D.session, user: r.user };
  await refresh();
  if (r.migration?.verified) toast(`הנתונים הקיימים שויכו לחשבון שלך ונבדקו (${Object.values(r.migration.before).reduce((a, b) => a + b, 0)} רשומות)`, 6000);
  go(D.state.profile?.onboarding?.done ? '#/today' : '#/onboarding');
}
