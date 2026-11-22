// בחירה מהמאגר: חיפוש, כרטיס מזון (ל-100 גרם ולכמות שבחרתי), מוצר אישי לפי תווית, USDA ומתכון ביתי
import { D, refresh, food, searchFoods, favorites, slots } from '../data.js';
import { save, get, del } from '../api.js';
import { $, $$, esc, n0, n1, toast, openSheet, on } from '../ui.js';
import { nutrients, unitsFor, defaultUnit, STATE, SRC_LABEL, MAKOR_LABEL, recipeFood, fmtQty } from '/shared/foods.js';

const stPill = f => f.st ? `<span class="pill st-${f.st}">${esc(STATE[f.st].short)}</span>` : '';
const srcLine = f => `${esc(SRC_LABEL[f.src] || '')}${f.src === 'moh' && f.mk ? ` · ${esc(MAKOR_LABEL[f.mk] || '')}` : ''}`;

export function foodRow(f) {
  return `<li class="li" data-food="${esc(f.id)}"><div class="m"><b>${esc(f.n)}</b><small>${stPill(f)} ${n0(f.k)} קק״ל · ${n1(f.p)} ג׳ חלבון ל-100 ג׳</small></div><div class="a">›</div></li>`;
}

/** חיפוש ובחירה. onPick(food) — ברירת מחדל: כרטיס מזון והוספה לארוחה */
export function openFoodPicker({ date, meal, onAdded, onPick, title } = {}) {
  let tab = 'search';
  const s = openSheet({ title: title || 'אבחר בעצמי', body: `
    ${meal ? `<label class="field"><span>לארוחה</span><select class="in" id="fpmeal">${slots().map(x => `<option value="${x.id}" ${x.id === meal ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` : ''}
    <input class="in" id="fpq" type="search" placeholder="חפש מזון, מותג או מנה — למשל אורז, קוטג׳, שניצל" autocomplete="off" enterkeyhint="search">
    <div class="seg" id="fptabs" style="margin:10px 0">${[['search', 'חיפוש'], ['fav', 'מועדפים'], ['recipes', 'מתכונים'], ['fixed', 'ארוחות קבועות'], ['mine', 'מוצר אישי']].map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="fpres"></div>` });
  const q = $('#fpq', s.el); const res = $('#fpres', s.el);
  const curMeal = () => $('#fpmeal', s.el)?.value || meal;
  const draw = () => {
    const term = q.value.trim();
    if (tab === 'search') {
      if (term.length < 2) { res.innerHTML = `<p class="muted small">כתוב לפחות שתי אותיות. החיפוש כולל את מאגר התזונה הלאומי (${D.foods.list.filter(f => f.src === 'moh').length.toLocaleString('he-IL')} מזונות), מוצרים אישיים ומתכונים.</p><p class="small">שים לב לסימון: <span class="pill st-dry">יבש</span> = שוקלים לפני בישול, <span class="pill st-cooked">מבושל</span> = שוקלים בצלחת.</p>`; return; }
      const list = searchFoods(term, 50);
      res.innerHTML = list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : `<div class="empty-state">לא נמצא. אפשר להוסיף <a href="#" data-new>מוצר אישי לפי התווית</a>.</div>`;
    } else if (tab === 'fav') {
      const ids = [...favorites()]; const list = ids.map(food).filter(Boolean);
      res.innerHTML = list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : '<div class="empty-state">עוד אין מועדפים. בכרטיס מזון לחץ ☆ כדי לשמור.</div>';
    } else if (tab === 'recipes') {
      const list = D.state.recipes.map(r => food('r:' + r.id)).filter(Boolean);
      res.innerHTML = `${list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : '<div class="empty-state">עוד אין מתכונים.</div>'}<button class="btn block soft" data-newrecipe>+ מתכון ביתי חדש</button>`;
    } else if (tab === 'fixed') {
      const list = D.state.fixedMeals;
      res.innerHTML = list.length ? `<ul class="list">${list.map(m => { const tot = m.items.reduce((a, i) => { const f = food(i.foodId); if (!f) return a; const n = nutrients(f, i.grams); a.k += n.kcal; a.p += n.protein; return a; }, { k: 0, p: 0 }); return `<li class="li" data-fixed="${esc(m.id)}"><div class="m"><b>${esc(m.name)}</b><small>${m.items.length} רכיבים · ${n0(tot.k)} קק״ל · ${n0(tot.p)} ג׳ חלבון</small></div><div class="a">+</div></li>`; }).join('')}</ul>` : '<div class="empty-state">עוד אין ארוחות קבועות. בכל ארוחה ב״היום שלי״ אפשר לשמור אותה כקבועה.</div>';
    } else {
      res.innerHTML = `<div class="stack"><button class="btn block soft" data-new>+ מוצר אישי לפי תווית האריזה</button><button class="btn block plain" data-usda>חיפוש ב-USDA FoodData Central (באנגלית)</button>
        ${D.state.custom.length ? `<ul class="list">${D.state.custom.map(c => foodRow(food('c:' + c.id))).join('')}</ul>` : ''}</div>`;
    }
  };
  q.addEventListener('input', () => { if (tab !== 'search') { tab = 'search'; $$('#fptabs button', s.el).forEach(b => b.classList.toggle('on', b.dataset.t === 'search')); } draw(); });
  on(s.el, '#fptabs button', 'click', (e, b) => { tab = b.dataset.t; $$('#fptabs button', s.el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  on(s.el, '[data-food]', 'click', (e, li) => { const f = food(li.dataset.food); if (!f) return; if (onPick) { s.close(); onPick(f); } else openFoodDetail(f, { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }); });
  on(s.el, '[data-new]', 'click', e => { e.preventDefault(); openCustomForm({ name: q.value.trim(), onSaved: f => { draw(); openFoodDetail(f, { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }); } }); });
  on(s.el, '[data-usda]', 'click', () => openUsda({ onSaved: f => { draw(); openFoodDetail(f, { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }); } }));
  on(s.el, '[data-newrecipe]', 'click', () => openRecipe({ onSaved: () => draw() }));
  on(s.el, '[data-fixed]', 'click', async (e, li) => {
    const m = D.state.fixedMeals.find(x => x.id === li.dataset.fixed); if (!m || !date) return;
    await save('POST', '/api/entries', { entries: m.items.map(i => ({ ...i, date, meal: curMeal(), status: 'planned', source: 'fixed' })) });
    await refresh(); toast(`"${m.name}" נוספה לתכנון`); s.close(); onAdded?.();
  });
  draw(); setTimeout(() => q.focus(), 60);
  return s;
}

/** כרטיס מזון: מקור, ל-100 גרם, יחידות מידה, מצב (יבש/מבושל/מסונן) והערכים לכמות שבחרתי */
export function openFoodDetail(f, { date, meal, entry, onDone } = {}) {
  const units = unitsFor(f);
  const du = entry ? (entry.unit || 'g') : (defaultUnit(f)?.[0] || 'g');
  let unit = units.find(u => u.key === du) ? du : 'g';
  let qty = entry ? (entry.unit && entry.unit !== 'g' && entry.qty ? entry.qty : entry.grams) : (unit === 'g' ? 100 : 1);
  const grams = () => unit === 'g' ? +qty : +qty * units.find(u => u.key === unit).g;
  const isFav = () => favorites().has(f.id);
  const s = openSheet({ title: f.n, body: '<div id="fdb"></div>', foot: entry
    ? `<button class="btn" data-save>שמור כמות</button>`
    : `<button class="btn plain" data-add="planned">הוסף לתכנון</button><button class="btn" data-add="eaten">אכלתי</button>` });
  const table = () => { const g = grams(); const n = nutrients(f, g || 0); return `<table class="nut"><thead><tr><th></th><th>ל-100 ג׳</th><th>לכמות שלך (${n0(g)} ג׳)</th></tr></thead><tbody>
        <tr><td>קלוריות</td><td class="num">${n0(f.k)}</td><td class="num"><b>${n0(n.kcal)}</b></td></tr>
        <tr><td>חלבון (ג׳)</td><td class="num">${n1(f.p)}</td><td class="num"><b>${n1(n.protein)}</b></td></tr>
        <tr><td>פחמימות (ג׳)</td><td class="num">${n1(f.c)}</td><td class="num">${n1(n.carbs)}</td></tr>
        <tr><td>שומן (ג׳)</td><td class="num">${n1(f.f)}</td><td class="num">${n1(n.fat)}</td></tr>
        <tr><td>סיבים (ג׳)</td><td class="num">${f.fi == null ? '—' : n1(f.fi)}</td><td class="num">${f.fi == null ? '—' : n1(n.fiber)}</td></tr>
        ${f.na != null ? `<tr><td>נתרן (מ״ג)</td><td class="num">${n0(f.na)}</td><td class="num">${n0(n.sodium)}</td></tr>` : ''}
      </tbody></table>`; };
  const draw = () => {
    $('#fdb', s.el).innerHTML = `
      <div class="row between"><div class="small muted">${srcLine(f)}</div><button class="iconbtn" data-fav aria-label="מועדף">${isFav() ? '★' : '☆'}</button></div>
      ${f.st ? `<div class="note ${f.st === 'dry' || f.st === 'raw' ? 'warn' : ''}" style="margin:8px 0"><b>${esc(STATE[f.st].label)}</b><br><span class="small">${esc(STATE[f.st].hint)}</span></div>` : ''}
      ${f.src === 'recipe' ? `<div class="note" style="margin:8px 0">מתכון: ${n0(f.rawGrams)} ג׳ רכיבים (כולל שמן ורטבים) → ${n0(f.finalGrams)} ג׳ בסיר. הערכים לפי החלק שאכלת.</div>` : ''}
      <div class="grid2" style="margin-top:10px"><label class="field"><span>כמות</span><input class="in" id="fq" inputmode="decimal" value="${qty}"></label>
        <label class="field"><span>יחידה</span><select class="in" id="fu">${units.map(u => `<option value="${esc(u.key)}" ${u.key === unit ? 'selected' : ''}>${esc(u.label)}${u.key === 'g' ? '' : ` (${u.g} ג׳)`}</option>`).join('')}</select></label></div>
      ${units.length > 1 ? `<div class="chips" style="margin:-4px 0 10px">${units.filter(u => u.key !== 'g').slice(0, 5).map(u => `<button type="button" class="chip" data-quick="${esc(u.key)}">1 ${esc(u.label)}</button>`).join('')}</div>` : ''}
      <div id="fdt">${table()}</div>
      ${entry ? `<p class="saved">נשמר לאחרונה: ${new Date(entry.updatedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>` : ''}`;
    $('#fq', s.el).addEventListener('input', e => { qty = +e.target.value.replace(',', '.') || 0; $('#fdt', s.el).innerHTML = table(); });
    $('#fu', s.el).addEventListener('change', e => { const g0 = grams(); unit = e.target.value; qty = unit === 'g' ? Math.round(g0) : Math.round(g0 / units.find(u => u.key === unit).g * 4) / 4 || 1; draw(); });
  };
  on(s.el, '[data-quick]', 'click', (e, b) => { unit = b.dataset.quick; qty = 1; draw(); });
  on(s.el, '[data-fav]', 'click', async () => { if (isFav()) await del('/api/favorites/' + encodeURIComponent(f.id)); else await save('PUT', '/api/favorites/' + encodeURIComponent(f.id)); await refresh(); draw(); });
  on(s.el, '[data-add]', 'click', async (e, b) => {
    const g = grams(); if (!(g > 0)) return toast('הזן כמות');
    await save('POST', '/api/entries', { entries: [{ date, meal, foodId: f.id, grams: g, unit, qty: unit === 'g' ? null : qty, status: b.dataset.add, source: 'manual' }] });
    await refresh(); toast(b.dataset.add === 'eaten' ? 'נרשם כ"אכלתי"' : 'נוסף לתכנון'); s.close(); onDone?.();
  });
  on(s.el, '[data-save]', 'click', async () => {
    const g = grams(); if (!(g > 0)) return toast('הזן כמות');
    await save('PUT', '/api/entries/' + entry.id, { grams: g, unit, qty: unit === 'g' ? null : qty });
    await refresh(); toast('הכמות עודכנה'); s.close(); onDone?.();
  });
  draw();
  return s;
}

/** מוצר אישי לפי תווית: ערכים ל-100 גרם (כפי שמופיע בטבלה התזונתית על האריזה) */
export function openCustomForm({ name = '', data = null, onSaved } = {}) {
  const c = data || { name };
  const f = (id, label, v, extra = '') => `<label class="field"><span>${label}</span><input class="in" id="${id}" value="${esc(v ?? '')}" ${extra}></label>`;
  const s = openSheet({ title: data?.id ? 'עריכת מוצר אישי' : 'מוצר אישי לפי תווית', body: `
    <p class="small muted">העתק מהטבלה התזונתית שעל האריזה את הערכים <b>ל-100 גרם</b>.</p>
    ${f('cn', 'שם המוצר', c.name)}${f('cb', 'מותג (לא חובה)', c.brand)}
    <div class="grid2">${f('ck', 'אנרגיה (קק״ל)', c.k, 'inputmode="decimal"')}${f('cp', 'חלבון (ג׳)', c.p, 'inputmode="decimal"')}${f('cc', 'פחמימות (ג׳)', c.c, 'inputmode="decimal"')}${f('cf', 'שומן (ג׳)', c.f, 'inputmode="decimal"')}${f('cfi', 'סיבים (ג׳)', c.fi, 'inputmode="decimal"')}${f('cna', 'נתרן (מ״ג)', c.na, 'inputmode="decimal"')}</div>
    <div class="grid2">${f('cun', 'שם יחידה (לא חובה)', c.unitName, 'placeholder="למשל: גביע, חטיף"')}${f('cug', 'משקל יחידה (ג׳)', c.unitGrams, 'inputmode="decimal"')}</div>
    <label class="field"><span>מצב</span><select class="in" id="cst"><option value="">מוכן לאכילה / לא רלוונטי</option>${Object.entries(STATE).map(([k, v]) => `<option value="${k}" ${c.st === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <div id="cerr"></div>`, foot: `${data?.id ? '<button class="btn danger" data-del>מחק</button>' : ''}<button class="btn" data-ok>שמור מוצר</button>` });
  const v = id => $('#' + id, s.el).value.trim().replace(',', '.');
  on(s.el, '[data-ok]', 'click', async () => {
    try {
      const r = await save('PUT', '/api/custom', { id: data?.id, name: v('cn'), brand: v('cb'), k: v('ck'), p: v('cp'), c: v('cc'), f: v('cf'), fi: v('cfi'), na: v('cna'), unitName: v('cun'), unitGrams: v('cug'), st: v('cst'), origin: data?.origin || 'label', fdcId: data?.fdcId });
      await refresh(); s.close(); toast('המוצר נשמר'); onSaved?.(food('c:' + r.id));
    } catch {}
  });
  on(s.el, '[data-del]', 'click', async () => { await del('/api/custom/' + data.id); await refresh(); s.close(); toast('המוצר נמחק'); onSaved?.(null); });
}

export function openUsda({ onSaved } = {}) {
  const s = openSheet({ title: 'USDA FoodData Central', body: `<p class="small muted">מקור משלים למזונות שאין במאגר הישראלי. החיפוש באנגלית. פריט שתבחר יישמר כמוצר אישי עם ציון המקור.</p>
    <form id="uf" class="row"><input class="in grow" id="uq" placeholder="greek yogurt" dir="ltr"><button class="btn">חפש</button></form><div id="ur" style="margin-top:10px"></div>` });
  let items = [];
  $('#uf', s.el).onsubmit = async e => {
    e.preventDefault(); $('#ur', s.el).innerHTML = '<div class="loading">מחפש…</div>';
    try { const r = await get('/api/usda/search?q=' + encodeURIComponent($('#uq', s.el).value)); items = r.items || [];
      $('#ur', s.el).innerHTML = (r.error || r.note ? `<div class="note warn">${esc(r.error || r.note)}</div>` : '') + (items.length ? `<ul class="list">${items.map((x, i) => `<li class="li" data-u="${i}" dir="ltr"><div class="m"><b>${esc(x.name)}</b><small>${esc(x.brand || x.dataType)} · ${n0(x.k)} kcal · ${n1(x.p)} g protein / 100 g</small></div></li>`).join('')}</ul>` : '');
    } catch (er) { $('#ur', s.el).innerHTML = `<div class="note err">${esc(er.message)}</div>`; }
  };
  on(s.el, '[data-u]', 'click', (e, li) => { const x = items[+li.dataset.u]; s.close(); openCustomForm({ data: { ...x, origin: 'usda', name: x.name, brand: x.brand }, onSaved }); });
}

/** מתכון ביתי: רכיבים (כולל שמן ורטבים) + משקל סופי בסיר + מספר מנות */
export function openRecipe({ recipe = null, onSaved } = {}) {
  const r = recipe ? structuredClone(recipe) : { name: '', items: [], cookedGrams: '', servings: '' };
  const s = openSheet({ title: recipe ? 'עריכת מתכון' : 'מתכון ביתי', body: '<div id="rb"></div>', foot: `${recipe ? '<button class="btn danger" data-del>מחק</button>' : ''}<button class="btn" data-ok>שמור מתכון</button>` });
  const draw = () => {
    const preview = r.items.length ? recipeFood({ ...r, id: 'tmp' }, D.foods) : null;
    $('#rb', s.el).innerHTML = `<label class="field"><span>שם המתכון</span><input class="in" id="rn" value="${esc(r.name)}"></label>
      <h3>רכיבים</h3><p class="tiny muted">כלול גם שמן, רטבים ותוספות. כמויות בגרמים, כפי שנכנסו לסיר.</p>
      <ul class="list">${r.items.map((it, i) => { const f = food(it.foodId); const n = f ? nutrients(f, it.grams) : null; return `<li class="li"><div class="m"><b>${esc(f?.n || it.foodId)}</b><small>${n ? `${n0(n.kcal)} קק״ל · ${n1(n.protein)} ג׳ חלבון` : ''}</small></div><input class="in" style="width:90px;min-height:42px" data-g="${i}" inputmode="decimal" value="${it.grams}"><button class="iconbtn" data-rm="${i}" aria-label="הסר">✕</button></li>`; }).join('')}</ul>
      <button class="btn block soft" data-addi>+ הוסף רכיב</button>
      <div class="grid2" style="margin-top:12px"><label class="field"><span>משקל סופי בסיר (ג׳)</span><input class="in" id="rc" inputmode="decimal" value="${esc(r.cookedGrams || '')}" placeholder="לא חובה"></label><label class="field"><span>מספר מנות</span><input class="in" id="rs" inputmode="numeric" value="${esc(r.servings || '')}"></label></div>
      ${preview ? `<div class="card tight"><b>סה״כ במתכון:</b> ${n0(preview.total.kcal)} קק״ל · ${n0(preview.total.protein)} ג׳ חלבון<br><span class="small">ל-100 ג׳ מוכן: ${n0(preview.k)} קק״ל · ${n1(preview.p)} ג׳ חלבון${preview.u[0] ? ` · מנה ≈ ${preview.u[0][1]} ג׳` : ''}</span><div class="tiny muted">אם לא תזין משקל סופי, החישוב לפי משקל הרכיבים (${n0(preview.rawGrams)} ג׳). בישול מאדה מים, ולכן עדיף לשקול את הסיר.</div></div>` : ''}`;
  };
  const sync = () => { r.name = $('#rn', s.el)?.value || r.name; r.cookedGrams = $('#rc', s.el)?.value || r.cookedGrams; r.servings = $('#rs', s.el)?.value || r.servings; $$('[data-g]', s.el).forEach(i => { r.items[+i.dataset.g].grams = +i.value.replace(',', '.') || 0; }); };
  s.el.addEventListener('change', () => { sync(); draw(); });
  on(s.el, '[data-rm]', 'click', (e, b) => { sync(); r.items.splice(+b.dataset.rm, 1); draw(); });
  on(s.el, '[data-addi]', 'click', () => { sync(); openFoodPicker({ title: 'רכיב למתכון', onPick: f => { r.items.push({ foodId: f.id, grams: 100 }); draw(); } }); });
  on(s.el, '[data-ok]', 'click', async () => { sync(); try { await save('PUT', '/api/recipes', { id: recipe?.id, ...r }); await refresh(); s.close(); toast('המתכון נשמר'); onSaved?.(); } catch {} });
  on(s.el, '[data-del]', 'click', async () => { await del('/api/recipes/' + recipe.id); await refresh(); s.close(); toast('המתכון נמחק'); onSaved?.(); });
  draw();
}
export { fmtQty };
