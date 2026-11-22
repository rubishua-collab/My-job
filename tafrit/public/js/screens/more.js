// "עוד": פרופיל, יעדים, מועדפים, מתכונים, מוצרים אישיים, ארוחות קבועות, מקורות וגיבוי
import { route, render } from '../app.js';
import { D, refresh, food } from '../data.js';
import { get, save, del } from '../api.js';
import { $, esc, n0, toast, on, openSheet, confirmSheet } from '../ui.js';
import { openRecipe, openCustomForm, openUsda, openFoodDetail, foodRow } from './food.js';
import { sourcesHtml } from './targets.js';
import { SOURCES } from '/shared/sources.js';
import { nutrients } from '/shared/foods.js';
import { savedAt } from '/shared/dates.js';

route('more', async (el) => {
  const st = D.state;
  el.innerHTML = `<div class="stack"><div class="top"><h1>עוד</h1></div>
    <div class="card"><ul class="list">
      <li class="li" data-go="#/targets"><div class="m"><b>היעדים שלי</b><small>כמה אני שורף, כמה לאכול, איך חושב, היסטוריה</small></div><div class="a">›</div></li>
      <li class="li" data-go="#/onboarding"><div class="m"><b>הפרופיל שלי</b><small>עודכן ${esc(savedAt(st.profile?.updatedAt))}</small></div><div class="a">›</div></li>
      <li class="li" data-sec="fav"><div class="m"><b>מועדפים</b><small>${st.favorites.length} פריטים</small></div><div class="a">›</div></li>
      <li class="li" data-sec="recipes"><div class="m"><b>מתכונים ביתיים</b><small>${st.recipes.length} מתכונים · כולל שמן ורטבים</small></div><div class="a">›</div></li>
      <li class="li" data-sec="custom"><div class="m"><b>מוצרים אישיים</b><small>${st.custom.length} מוצרים · לפי תווית או USDA</small></div><div class="a">›</div></li>
      <li class="li" data-sec="fixed"><div class="m"><b>ארוחות קבועות</b><small>${st.fixedMeals.length} ארוחות</small></div><div class="a">›</div></li>
      <li class="li" data-sec="sources"><div class="m"><b>על מה מבוססות ההמלצות?</b><small>מחקרים, הנחיות והחלטות תוכנה</small></div><div class="a">›</div></li>
      <li class="li" data-sec="db"><div class="m"><b>מאגר המזון</b><small>${esc(st.foodsMeta?.source || '')}</small></div><div class="a">›</div></li>
      <li class="li" data-sec="backup"><div class="m"><b>גיבוי ושחזור</b><small>הורדת כל הנתונים לקובץ</small></div><div class="a">›</div></li>
    </ul></div><p class="tiny muted">האפליקציה עוזרת לתכנן ולתעד. היא לא מחליפה ייעוץ רפואי או תזונתי אישי.</p></div>`;
  on(el, '[data-go]', 'click', (e, li) => { location.hash = li.dataset.go; });
  on(el, '[data-sec]', 'click', (e, li) => SECTIONS[li.dataset.sec]());
});

const SECTIONS = {
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
    const s = openSheet({ title: 'ארוחות קבועות', body: D.state.fixedMeals.length ? `<ul class="list">${D.state.fixedMeals.map(m => { const t = m.items.reduce((a, i) => { const f = food(i.foodId); if (f) { const n = nutrients(f, i.grams); a.k += n.kcal; a.p += n.protein; } return a; }, { k: 0, p: 0 }); return `<li class="li"><div class="m"><b>${esc(m.name)}</b><small>${m.items.map(i => esc(food(i.foodId)?.n || '')).join(', ')}</small></div><div class="a">${n0(t.k)} קק״ל<br><button class="btn xs danger" data-del="${m.id}">מחק</button></div></li>`; }).join('')}</ul>` : '<div class="empty-state">בכל ארוחה ב״היום שלי״ לחץ ☆ קבועה כדי לשמור אותה.</div>' });
    on(s.el, '[data-del]', 'click', async (e, b) => { await del('/api/fixed-meals/' + b.dataset.del); await refresh(); s.close(); render(); });
  },
  sources() { const ids = Object.keys(SOURCES); openSheet({ title: 'על מה מבוססות ההמלצות?', body: `<p class="small">כל המלצה מבוססת על מקור מקצועי (מחקר, הנחיה או מאגר נתונים) או על החלטת תוכנה — כלל עבודה של האפליקציה, כמו מספר השקילות שנדרש כדי להציג מגמה. הם מסומנים בנפרד.</p><h3>מקורות מקצועיים</h3>${sourcesHtml(ids.filter(i => SOURCES[i].kind !== 'decision'))}<h3 style="margin-top:12px">החלטות תוכנה</h3>${sourcesHtml(ids.filter(i => SOURCES[i].kind === 'decision'))}` }); },
  db() { const m = D.state.foodsMeta; openSheet({ title: 'מאגר המזון', body: `<p><b>${esc(m.source)}</b></p><p class="small">${m.count.toLocaleString('he-IL')} מזונות ומתכונים עם ערכים ל-100 גרם ומשקלי יחידות מידה. נמשך מ-data.gov.il בתאריך ${esc(m.fetched)}. רישיון: ${esc(m.license)}.</p><p class="small">מקור הנתון לכל מזון מוצג בכרטיס שלו: ${Object.values(m.makor).map(esc).join(' · ')}.</p><p class="small">השלמות: מוצר אישי לפי תווית האריזה, או חיפוש ב-USDA FoodData Central.</p><a href="${esc(m.url)}" target="_blank" rel="noopener">לדף המאגר ↗</a>` }); },
  backup() {
    const s = openSheet({ title: 'גיבוי ושחזור', body: `<p class="small">כל הנתונים נשמרים בשרת ונשארים אחרי סגירה ופתיחה. כאן אפשר להוריד עותק לקובץ או לשחזר ממנו.</p><button class="btn block" data-exp>הורדת גיבוי</button><label class="btn block plain" style="margin-top:10px">שחזור מקובץ<input type="file" accept="application/json" id="imp" hidden></label>` });
    on(s.el, '[data-exp]', 'click', async () => { const d = await get('/api/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })); a.download = `tafrit-backup-${D.state.today}.json`; a.click(); });
    $('#imp', s.el).onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!(await confirmSheet('לשחזר?', '<p>רשומות מהקובץ יחליפו רשומות עם אותו מזהה.</p>', 'שחזר'))) return; try { const r = await save('POST', '/api/import', JSON.parse(await f.text())); await refresh(); toast(`שוחזרו ${r.imported} רשומות`); s.close(); render(); } catch {} };
  },
};
