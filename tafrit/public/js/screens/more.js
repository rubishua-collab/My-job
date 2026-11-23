// "עוד": פרופיל, יעדים, מועדפים, מתכונים, מוצרים אישיים, ארוחות קבועות, מקורות וגיבוי
import { route, render, logout, wipeLocal } from '../app.js';
import { privacySummaryHtml } from './auth.js';
import { openAiConsent } from './chat.js';
import { D, refresh, food, slots, today } from '../data.js';
import { get, save, del } from '../api.js';
import { $, esc, n0, toast, on, openSheet, confirmSheet } from '../ui.js';
import { openRecipe, openCustomForm, openUsda, openFoodDetail, foodRow, openFixedMeal } from './food.js';
import { sourcesHtml } from './targets.js';
import { SOURCES } from '/shared/sources.js';
import { nutrients, manualFood } from '/shared/foods.js';
import { savedAt } from '/shared/dates.js';

route('more', async (el) => {
  const st = D.state;
  el.innerHTML = `<div class="stack"><div class="top"><h1>עוד</h1></div>
    <div class="card"><ul class="list">
      <li class="li" data-go="#/plan"><div class="m"><b>התוכנית שלי</b><small>מטרה, יעדים, שינוי מטרה ותוכנית, היסטוריית תוכניות</small></div><div class="a">›</div></li>
      <li class="li" data-go="#/targets"><div class="m"><b>היעדים שלי</b><small>כמה אני שורף, כמה לאכול, איך חושב, היסטוריה</small></div><div class="a">›</div></li>
      <li class="li" data-go="#/onboarding"><div class="m"><b>הפרופיל שלי</b><small>עודכן ${esc(savedAt(st.profile?.updatedAt))}</small></div><div class="a">›</div></li>
      <li class="li" data-sec="fav"><div class="m"><b>מועדפים</b><small>${st.favorites.length} פריטים</small></div><div class="a">›</div></li>
      <li class="li" data-sec="recipes"><div class="m"><b>מתכונים ביתיים</b><small>${st.recipes.length} מתכונים · כולל שמן ורטבים</small></div><div class="a">›</div></li>
      <li class="li" data-sec="custom"><div class="m"><b>מוצרים אישיים</b><small>${st.custom.length} מוצרים · לפי תווית או USDA</small></div><div class="a">›</div></li>
      <li class="li" data-sec="fixed"><div class="m"><b>ארוחות קבועות</b><small>${st.fixedMeals.length} ארוחות</small></div><div class="a">›</div></li>
      <li class="li" data-sec="sources"><div class="m"><b>על מה מבוססות ההמלצות?</b><small>מחקרים, הנחיות והחלטות תוכנה</small></div><div class="a">›</div></li>
      <li class="li" data-sec="db"><div class="m"><b>מאגר המזון</b><small>${esc(st.foodsMeta?.source || '')}</small></div><div class="a">›</div></li>
      <li class="li" data-sec="backup"><div class="m"><b>גיבוי ושחזור</b><small>הורדת כל הנתונים לקובץ</small></div><div class="a">›</div></li>
    </ul></div>
    <div class="card"><h3>החשבון שלי</h3><div class="small muted" dir="ltr" style="text-align:right">${esc(D.session.user.email)}</div><ul class="list">
      ${D.session.user.admin ? '<li class="li" data-go="#/admin"><div class="m"><b>ניהול משתמשים</b><small>דורש אימות דו-שלבי</small></div><div class="a">›</div></li>' : ''}
      ${D.session.ai ? `<li class="li" data-sec="ai"><div class="m"><b>מלווה חכם (ספק AI חיצוני)</b><small>${D.session.user.aiConsent ? 'מאושר — אפשר לבטל' : 'לא מאושר — המלווה עובד במצב בסיסי'}</small></div><div class="a">›</div></li>` : ''}
      <li class="li" data-sec="password"><div class="m"><b>שינוי סיסמה</b></div><div class="a">›</div></li>
      <li class="li" data-sec="privacy"><div class="m"><b>פרטיות — מה נשמר ומי רואה</b></div><div class="a">›</div></li>
      <li class="li" data-sec="logout"><div class="m"><b>התנתקות</b><small>המידע המקומי במכשיר יימחק</small></div><div class="a">›</div></li>
      <li class="li" data-sec="logoutAll"><div class="m"><b>התנתקות מכל המכשירים</b></div><div class="a">›</div></li>
      <li class="li" data-sec="deleteAcc"><div class="m"><b style="color:var(--danger)">מחיקת החשבון וכל המידע</b><small>לא ניתן לשחזר</small></div><div class="a">›</div></li>
    </ul></div><p class="tiny muted">האפליקציה עוזרת לתכנן ולתעד. היא לא מחליפה ייעוץ רפואי או תזונתי אישי.</p></div>`;
  on(el, '[data-go]', 'click', (e, li) => { location.hash = li.dataset.go; });
  on(el, '[data-sec]', 'click', (e, li) => SECTIONS[li.dataset.sec]());
});

const SECTIONS = {
  ai() { openAiConsent(); },
  password() {
    const s = openSheet({ title: 'שינוי סיסמה', body: `<label class="field"><span>סיסמה נוכחית</span><input class="in" id="c" type="password" autocomplete="current-password" dir="ltr"></label><label class="field"><span>סיסמה חדשה</span><input class="in" id="n" type="password" autocomplete="new-password" dir="ltr"></label>`, foot: '<button class="btn" data-ok>שמירה</button>' });
    on(s.el, '[data-ok]', 'click', async () => { try { await save('POST', '/api/account/password', { current: $('#c', s.el).value, password: $('#n', s.el).value }); s.close(); toast('הסיסמה עודכנה'); } catch {} });
  },
  privacy() { openSheet({ title: 'פרטיות', body: privacySummaryHtml() }); },
  logout() { logout(); },
  async logoutAll() { if (await confirmSheet('להתנתק מכל המכשירים?', '<p>כל המכשירים שמחוברים לחשבון יתנתקו, כולל זה.</p>', 'התנתק')) logout({ all: true }); },
  deleteAcc() {
    const s = openSheet({ title: 'מחיקת החשבון', body: `<div class="note err">יימחקו לצמיתות: הפרופיל, התוכניות, היעדים, השקילות, יומן האכילה, המתכונים, המועדפים והשיחות עם המלווה. אי אפשר לשחזר.</div><p class="small">כדאי להוריד קודם גיבוי (עוד ← גיבוי ושחזור).</p><label class="field"><span>להמשך, הזן את הסיסמה</span><input class="in" id="p" type="password" autocomplete="current-password" dir="ltr"></label>`, foot: '<button class="btn danger" data-ok>מחק את החשבון לצמיתות</button>' });
    on(s.el, '[data-ok]', 'click', async () => { try { await save('POST', '/api/account/delete', { password: $('#p', s.el).value }); await wipeLocal(); location.hash = '#/welcome'; location.reload(); } catch {} });
  },
  fav() { const list = D.state.favorites.map(f => food(f.id)).filter(Boolean); const s = openSheet({ title: 'מועדפים', body: list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : '<div class="empty-state">אין עדיין. בכרטיס מזון לחץ ☆.</div>' }); on(s.el, '[data-food]', 'click', (e, li) => openFoodDetail(food(li.dataset.food), {})); },
  recipes() {
    const s = openSheet({ title: 'מתכונים ביתיים', body: `<button class="btn block soft" data-new>+ מתכון חדש</button><ul class="list">${D.state.recipes.map(r => { const f = food('r:' + r.id); return `<li class="li" data-r="${r.id}"><div class="m"><b>${esc(r.name)}</b><small>${r.items.length} רכיבים · ${f ? `${n0(f.k)} קק״ל ל-100 ג׳` : ''}</small></div><div class="a">›</div></li>`; }).join('')}</ul>` });
    on(s.el, '[data-new]', 'click', () => { s.close(); openRecipe({ onSaved: () => render() }); });
    on(s.el, '[data-r]', 'click', (e, li) => { s.close(); openRecipe({ recipe: D.state.recipes.find(r => r.id === li.dataset.r), onSaved: () => render() }); });
  },
  custom() {
    const s = openSheet({ title: 'מוצרים אישיים', body: `<div class="row"><button class="btn grow soft" data-new>+ לפי תווית</button><button class="btn grow plain" data-usda>USDA</button></div><ul class="list">${D.state.custom.map(c => `<li class="li" data-c="${c.id}"><div class="m"><b>${esc(c.name)}</b><small>${c.origin === 'usda' ? 'USDA · ' : ''}${n0(c.k)} קק״ל · ${c.p} ג׳ חלבון ל-100 ג׳</small></div><div class="a">›</div></li>`).join('')}</ul>` });
    on(s.el, '[data-new]', 'click', () => { s.close(); openCustomForm({ onSaved: () => render() }); });
    on(s.el, '[data-usda]', 'click', () => { s.close(); openUsda({ onSaved: () => render() }); });
    on(s.el, '[data-c]', 'click', (e, li) => { s.close(); openCustomForm({ data: D.state.custom.find(c => c.id === li.dataset.c), onSaved: () => render() }); });
  },
  fixed() {
    const fOf = i => food(i.foodId) || (i.manual ? manualFood(i.manual) : null);
    const s = openSheet({ title: 'ארוחות קבועות', body: `<button class="btn block soft" data-new>+ ארוחה קבועה חדשה</button><p class="tiny muted">אפשר גם לשמור ארוחה מ״היום שלי״ (☆ קבועה). מוסיפים ליום מכאן, או מ״אבחר בעצמי ← ארוחות קבועות״.</p>${D.state.fixedMeals.length ? `<ul class="list">${D.state.fixedMeals.map(m => { const t = m.items.reduce((a, i) => { const f = fOf(i); if (f) { const n = nutrients(f, i.grams); a.k += n.kcal; a.p += n.protein; } return a; }, { k: 0, p: 0 }); return `<li class="li" data-fm="${m.id}"><div class="m"><b>${esc(m.name)}</b><small>${m.items.map(i => esc(fOf(i)?.n || '')).join(', ')}</small></div><div class="a">${n0(t.k)} קק״ל<br>${n0(t.p)} ג׳ חלבון</div></li>`; }).join('')}</ul>` : '<div class="empty-state">עוד אין ארוחות קבועות.</div>'}` });
    on(s.el, '[data-new]', 'click', () => { s.close(); openFixedMeal({ onSaved: () => render() }); });
    on(s.el, '[data-fm]', 'click', (e, li) => {
      const m = D.state.fixedMeals.find(x => x.id === li.dataset.fm); s.close();
      const a = openSheet({ title: m.name, body: `<label class="field"><span>להוסיף להיום, לארוחה</span><select class="in" id="fmslot">${slots(today()).map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join('')}</select></label>`, foot: '<button class="btn plain" data-edit>עריכה</button><button class="btn" data-add>הוסף להיום</button>' });
      on(a.el, '[data-edit]', 'click', () => { a.close(); openFixedMeal({ meal: m, onSaved: () => render() }); });
      on(a.el, '[data-add]', 'click', async () => { await save('POST', '/api/entries', { entries: m.items.map(i => ({ ...i, date: today(), meal: $('#fmslot', a.el).value, status: 'planned', source: 'fixed' })) }); await refresh(); a.close(); toast(`"${m.name}" נוספה להיום`); });
    });
  },
  sources() { const ids = Object.keys(SOURCES); openSheet({ title: 'על מה מבוססות ההמלצות?', body: `<p class="small">כל המלצה מבוססת על מקור מקצועי (מחקר, הנחיה או מאגר נתונים) או על החלטת תוכנה — כלל עבודה של האפליקציה, כמו מספר השקילות שנדרש כדי להציג מגמה. הם מסומנים בנפרד.</p><h3>מקורות מקצועיים</h3>${sourcesHtml(ids.filter(i => SOURCES[i].kind !== 'decision'))}<h3 style="margin-top:12px">החלטות תוכנה</h3>${sourcesHtml(ids.filter(i => SOURCES[i].kind === 'decision'))}` }); },
  db() { const m = D.state.foodsMeta; openSheet({ title: 'מאגר המזון', body: `<p><b>${esc(m.source)}</b></p><p class="small">${m.count.toLocaleString('he-IL')} מזונות ומתכונים עם ערכים ל-100 גרם ומשקלי יחידות מידה. נמשך מ-data.gov.il בתאריך ${esc(m.fetched)}. רישיון: ${esc(m.license)}.</p><p class="small">מקור הנתון לכל מזון מוצג בכרטיס שלו: ${Object.values(m.makor).map(esc).join(' · ')}.</p>${m.world ? `<h3>מאגרים עולמיים</h3>${Object.values(m.world.sources).map(x => `<p class="small"><b>${esc(x.name)}</b> (${esc(x.country)}) · ${x.count.toLocaleString('he-IL')} פריטים · ${esc(x.license)} · <a href="${esc(x.url)}" target="_blank" rel="noopener">מקור ↗</a></p>`).join('')}<p class="tiny muted">יובא ${esc(m.world.imported)}. ${esc(m.world.hebrewNames)}.</p>` : ''}
      ${m.extra ? `<p class="small">${esc(m.extra.note)}: ${m.extra.yoman} מזונות נפוצים, ${m.extra.chain} מנות מרשתות.</p>` : ''}
      <p class="small">השלמות: מוצר אישי לפי תווית האריזה, ברקוד, צילום טבלה תזונתית, או חיפוש חי ב-USDA.</p><a href="${esc(m.url)}" target="_blank" rel="noopener">לדף המאגר ↗</a>` }); },
  backup() {
    const s = openSheet({ title: 'גיבוי ושחזור', body: `<p class="small">כל הנתונים נשמרים בשרת ונשארים אחרי סגירה ופתיחה. כאן אפשר להוריד עותק לקובץ או לשחזר ממנו.</p><button class="btn block" data-exp>הורדת גיבוי</button><label class="btn block plain" style="margin-top:10px">שחזור מקובץ<input type="file" accept="application/json" id="imp" hidden></label>` });
    on(s.el, '[data-exp]', 'click', async () => { const d = await get('/api/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })); a.download = `tafrit-backup-${D.state.today}.json`; a.click(); });
    $('#imp', s.el).onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!(await confirmSheet('לשחזר?', '<p>רשומות מהקובץ יחליפו רשומות עם אותו מזהה.</p>', 'שחזר'))) return; try { const r = await save('POST', '/api/import', JSON.parse(await f.text())); await refresh(); toast(`שוחזרו ${r.imported} רשומות`); s.close(); render(); } catch {} };
  },
};
