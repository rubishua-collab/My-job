// ניהול משתמשים — רק למנהל, ורק אחרי אימות דו-שלבי. צפייה בלבד; כל פתיחת פרופיל נרשמת ביומן (בלי התוכן).
import { route, go, render } from '../app.js';
import { D } from '../data.js';
import { get, save } from '../api.js';
import { $, esc, kg, n0, toast, on, openSheet } from '../ui.js';
import { GOALS } from '/shared/nutrition.js';
import { recentWeeks } from '/shared/weights.js';
import { dmy, savedAt, israelDate } from '/shared/dates.js';

const ACTIONS = { admin_view_profile: 'פתיחת פרופיל', admin_search_users: 'חיפוש משתמשים', mfa_verified: 'אימות דו-שלבי', mfa_failed: 'אימות דו-שלבי נכשל', mfa_enabled: 'הפעלת אימות דו-שלבי', login: 'כניסה', email_verified: 'אימות דוא״ל', account_deleted: 'מחיקת חשבון', password_reset: 'שחזור סיסמה', password_changed: 'שינוי סיסמה', admin_pinned: 'נעילת חשבון המנהל', legacy_data_assigned: 'שיוך נתונים קיימים', admin_backup: 'גיבוי ידני', ai_consent_given: 'הסכמה ל-AI', ai_consent_withdrawn: 'ביטול הסכמה ל-AI' };

async function gate(el) {
  const u = D.session.user;
  if (!u?.admin) { el.innerHTML = '<div class="note err">אין הרשאה למסך הזה.</div>'; return false; }
  const s = await get('/api/session'); D.session = { ...D.session, ...s };
  if (s.adminReady) return true;
  if (!s.user.totpEnabled) {
    const r = await save('POST', '/api/admin/2fa/setup', {});
    el.innerHTML = `<div class="stack"><div class="top"><h1>אימות דו-שלבי</h1></div>
      <div class="note">כדי להיכנס לניהול צריך אפליקציית אימות (סיסמאות של iPhone, Google Authenticator או Microsoft Authenticator).</div>
      <a class="btn block" href="${esc(r.otpauth)}">פתיחה באפליקציית האימות</a>
      <div class="card small">או הוספה ידנית של המפתח:<div class="num" style="font-size:18px;letter-spacing:2px;margin-top:6px;word-break:break-all" dir="ltr">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</div></div>
      <input class="in big" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="000000" aria-label="קוד מהאפליקציה">
      <button class="btn block xl" id="ok">הפעלה</button></div>`;
    $('#ok', el).onclick = async () => { try { await save('POST', '/api/admin/2fa/enable', { code: $('#cd', el).value }); toast('אימות דו-שלבי הופעל'); render(); } catch {} };
    return false;
  }
  el.innerHTML = `<div class="stack" style="padding-top:8vh"><h1>כניסה לניהול</h1><p>הזן את הקוד מאפליקציית האימות.</p>
    <input class="in big" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="000000" aria-label="קוד אימות"><button class="btn block xl" id="ok">אימות</button></div>`;
  $('#ok', el).onclick = async () => { try { await save('POST', '/api/admin/2fa/verify', { code: $('#cd', el).value }); render(); } catch {} };
  return false;
}

route('admin', async (el, [sub, id]) => {
  if (!(await gate(el))) return;
  if (sub === 'user' && id) return userView(el, id);
  if (sub === 'audit') return auditView(el);
  const term = sessionStorage.getItem('tafrit-admin-q') || '';
  const r = await get('/api/admin/users?q=' + encodeURIComponent(term));
  const sys = await get('/api/admin/system');
  el.innerHTML = `<div class="stack"><div class="top"><h1>ניהול משתמשים</h1><a class="btn xs plain" href="#/admin/audit">יומן צפיות</a></div>
    <form id="sf" class="row"><input class="in grow" id="q" type="search" placeholder="חיפוש לפי דוא״ל" value="${esc(term)}" dir="ltr"><button class="btn">חיפוש</button></form>
    <div class="small muted">${r.total} משתמשים רשומים · מוצגים ${r.users.length}</div>
    <div class="card"><ul class="list">${r.users.map(u => `<li class="li" data-u="${u.id}"><div class="m"><b dir="ltr" style="text-align:right">${esc(u.email)}</b><small>${u.admin ? 'מנהל · ' : ''}${u.verified ? 'מאומת' : 'לא אומת'} · נרשם ${esc(savedAt(u.createdAt))}${u.lastLoginAt ? ' · כניסה אחרונה ' + esc(savedAt(u.lastLoginAt)) : ''}</small></div><div class="a">›</div></li>`).join('') || '<li class="empty-state">לא נמצאו משתמשים</li>'}</ul></div>
    <details class="how"><summary>מצב המערכת</summary><div class="small stack">
      <div>מפתח הצפנה: ${sys.keySource === 'env' ? 'ממשתנה סביבה ✓' : 'מקובץ בדיסק — מומלץ להגדיר DATA_ENCRYPTION_KEY'}</div>
      <div>דוא״ל: ${sys.mail ? 'פעיל' : 'לא מוגדר'} · ספק AI: ${sys.ai ? 'פעיל' : 'מצב בסיסי'}</div>
      ${sys.migration ? `<div>שיוך הנתונים הקיימים: ${sys.migration.verified ? '✓ נבדק' : '✗'} · ${esc(savedAt(sys.migration.at))}<br>לפני: ${esc(JSON.stringify(sys.migration.before))}<br>אחרי: ${esc(JSON.stringify(sys.migration.after))}<br>גיבוי לפני המעבר: ${esc(sys.migration.backup)}</div>` : sys.legacyPending ? `<div class="note warn">נתונים קיימים ממתינים לשיוך: ${esc(JSON.stringify(sys.legacyPending))}</div>` : '<div>אין נתונים ישנים לשיוך.</div>'}
      <button class="btn sm" id="bk">גיבוי מוצפן עכשיו</button></div></details></div>`;
  $('#sf', el).onsubmit = e => { e.preventDefault(); sessionStorage.setItem('tafrit-admin-q', $('#q', el).value.trim()); render(); };
  on(el, '[data-u]', 'click', (e, li) => go('#/admin/user/' + li.dataset.u));
  $('#bk', el).onclick = async () => { const b = await save('POST', '/api/admin/backup', {}); toast('נוצר גיבוי: ' + b.file); };
});

async function userView(el, id) {
  const r = await get('/api/admin/users/' + encodeURIComponent(id));
  const d = r.data; const p = d.profile || {};
  const weeks = recentWeeks(d.weights, israelDate(), 6).filter(w => w.n);
  const curPlan = d.plans.filter(x => x.startDate <= israelDate()).pop();
  const t = d.targets[d.targets.length - 1];
  el.innerHTML = `<div class="stack"><div class="top"><div><h1>צפייה בפרופיל</h1><div class="sub" dir="ltr" style="text-align:right">${esc(r.user.email)}</div></div><a class="btn xs plain" href="#/admin">חזרה</a></div>
    <div class="note small">צפייה בלבד. הפתיחה נרשמה ביומן הצפיות (מי, מתי ואיזה פרופיל — בלי התוכן).</div>
    <div class="card"><dl class="kv"><dt>נרשם</dt><dd>${esc(savedAt(r.user.createdAt))}</dd><dt>כניסה אחרונה</dt><dd>${esc(savedAt(r.user.lastLoginAt)) || '—'}</dd>
      <dt>גיל / מין / גובה</dt><dd>${p.age ?? '—'} / ${p.sex === 'female' ? 'נקבה' : p.sex ? 'זכר' : '—'} / ${p.heightCm ?? '—'}</dd>
      <dt>מטרה פעילה</dt><dd>${curPlan ? esc(GOALS[curPlan.goal]) + ' מ-' + dmy(curPlan.startDate) : '—'}</dd>
      <dt>יעד אחרון</dt><dd>${t ? `${t.kcal} קק״ל · ${t.protein} ג׳ (מ-${dmy(t.effectiveFrom)})` : '—'}</dd>
      <dt>אלרגיות</dt><dd>${esc((p.allergies || []).join(', ') || 'אין')}</dd><dt>הנחיות רפואיות</dt><dd>${esc(Object.entries(p.medical || {}).filter(([k, v]) => v === true).map(([k]) => k).join(', ') || 'אין')}</dd></dl></div>
    <div class="card"><h3>ממוצעים שבועיים</h3><ul class="list">${weeks.map(w => `<li class="li"><div class="m"><b>${dmy(w.start)}–${dmy(w.end)}</b><small>${esc(w.label)}</small></div><div class="a">${kg(w.avg)}</div></li>`).join('') || '<li class="empty-state">אין שקילות</li>'}</ul></div>
    <div class="card"><h3>תוכניות (${d.plans.length})</h3><ul class="list">${d.plans.map(x => `<li class="li"><div class="m"><b>${esc(GOALS[x.goal])}</b><small>${dmy(x.startDate)} – ${x.endDate ? dmy(x.endDate) : 'פעילה'} · ${x.targets?.kcal || '—'} קק״ל</small></div></li>`).join('')}</ul></div>
    <div class="card"><h3>רישומי יומן אחרונים</h3><ul class="list">${d.entries.slice(-20).reverse().map(e => `<li class="li"><div class="m"><b>${esc(e.snapshot?.n || '')}</b><small>${dmy(e.date)} · ${esc(e.meal)} · ${n0(e.grams)} ג׳ · ${e.status === 'eaten' ? 'אכל' : 'תכנן'}</small></div></li>`).join('') || '<li class="empty-state">אין רישומים</li>'}</ul></div>
    <div class="small muted">רשומות: ${esc(JSON.stringify(r.counts))}</div></div>`;
}

async function auditView(el) {
  const list = await get('/api/admin/audit');
  el.innerHTML = `<div class="stack"><div class="top"><h1>יומן צפיות ופעולות</h1><a class="btn xs plain" href="#/admin">חזרה</a></div>
    <p class="small muted">היומן מוגן: רק המנהל רואה אותו, אחרי אימות דו-שלבי. נרשם מי, מתי ואיזה פרופיל — בלי תוכן.</p>
    <div class="card"><ul class="list">${list.map(a => `<li class="li"><div class="m"><b>${esc(ACTIONS[a.action] || a.action)}</b><small>${esc(savedAt(a.at))}${a.target_user_id ? ' · משתמש ' + esc(a.target_user_id.slice(0, 8)) : ''}${a.actor_id && a.actor_id !== a.target_user_id ? ' · ע״י ' + esc(a.actor_id.slice(0, 8)) : ''}</small></div></li>`).join('')}</ul></div></div>`;
}
