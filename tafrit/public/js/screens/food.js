// בחירה מהמאגר: חיפוש, כרטיס מזון (ל-100 גרם ולכמות שבחרתי), מוצר אישי לפי תווית, USDA ומתכון ביתי
import { D, refresh, food, searchFoods, favorites, slots } from '../data.js';
import { save, get, del } from '../api.js';
import { decodeBarcode, normBc, findByBarcode, readLabelPhoto } from './scan.js';
import { EATOUT, EATOUT_CATS, eatoutById, defaultChoice, composeDish, dishTitle, searchEatout } from '/shared/eatout.js';
import { $, $$, esc, n0, n1, toast, openSheet, on } from '../ui.js';
import { nutrients, unitsFor, defaultUnit, STATE, SRC_LABEL, MAKOR_LABEL, recipeFood, fmtQty, perLabel, qtyText, manualFood } from '/shared/foods.js';

const stPill = f => f.st ? `<span class="pill st-${f.st}">${esc(STATE[f.st].short)}</span>` : '';
const srcLine = f => `${esc(SRC_LABEL[f.src] || '')}${f.src === 'moh' && f.mk ? ` · ${esc(MAKOR_LABEL[f.mk] || '')}` : ''}`;

export function foodRow(f) {
  return `<li class="li" data-food="${esc(f.id)}"><div class="m"><b>${esc(f.n)}</b><small>${stPill(f)} ${n0(f.k)} קק״ל · ${n1(f.p)} ג׳ חלבון ${esc(perLabel(f))}${f.src === 'chain' ? ' · מזון מהיר' : f.src === 'usda' ? ' · USDA ארה״ב' : f.src === 'cofid' ? ' · CoFID בריטניה' : ''}</small></div><div class="a">›</div></li>`;
}

/** חיפוש ובחירה. onPick(food) — ברירת מחדל: כרטיס מזון והוספה לארוחה */
export function openFoodPicker({ date, meal, onAdded, onPick, title } = {}) {
  let tab = 'search';
  const s = openSheet({ title: title || 'אבחר בעצמי', body: `
    ${meal ? `<label class="field"><span>לארוחה</span><select class="in" id="fpmeal">${slots(date).map(x => `<option value="${x.id}" ${x.id === meal ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` : ''}
    <input class="in" id="fpq" type="search" aria-label="חיפוש מזון" placeholder="חפש מזון, מותג או מנה — למשל אורז, קוטג׳, שניצל" autocomplete="off" enterkeyhint="search">
    <div class="seg wrap" id="fptabs" style="margin:10px 0">${[['search', 'חיפוש'], ['fav', 'מועדפים'], ['recipes', 'מתכונים'], ['fixed', 'ארוחות קבועות'], ['mine', 'מוצר אישי'], ...(date && !onPick ? [['out', '🍔 בחוץ'], ['scan', '📷 ברקוד'], ['photo', '📷 ערכים'], ['manual', 'ידני']] : [])].map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="fpres"></div>` });
  const q = $('#fpq', s.el); const res = $('#fpres', s.el);
  const curMeal = () => $('#fpmeal', s.el)?.value || meal;
  let draw = () => {
    const term = q.value.trim();
    if (tab === 'search') {
      if (term.length < 2) { res.innerHTML = `<p class="muted small">כתוב לפחות שתי אותיות. החיפוש כולל את מאגר התזונה הלאומי (${D.foods.list.filter(f => f.src === 'moh').length.toLocaleString('he-IL')} מזונות), המזונות הנפוצים ורשתות המזון המהיר מהיומן הקודם, מוצרים אישיים ומתכונים.</p><p class="small">שים לב לסימון: <span class="pill st-dry">יבש</span> = שוקלים לפני בישול, <span class="pill st-cooked">מבושל</span> = שוקלים בצלחת.</p>`; return; }
      const list = searchFoods(term, 50);
      const out = date && !onPick ? searchEatout(term) : [];
      res.innerHTML = (out.length ? `<div class="small muted" style="margin:4px 0">אוכל בחוץ — להרכבה כמו שמזמינים</div><ul class="list">${out.map(eatoutRow).join('')}</ul>` : '')
        + (list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : out.length ? '' : `<div class="empty-state">לא נמצא. אפשר להוסיף <a href="#" data-new>מוצר אישי לפי התווית</a>.</div>`);
    } else if (tab === 'fav') {
      const ids = [...favorites()]; const list = ids.map(food).filter(Boolean);
      res.innerHTML = list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : '<div class="empty-state">עוד אין מועדפים. בכרטיס מזון לחץ ☆ כדי לשמור.</div>';
    } else if (tab === 'recipes') {
      const list = D.state.recipes.map(r => food('r:' + r.id)).filter(Boolean);
      res.innerHTML = `${list.length ? `<ul class="list">${list.map(foodRow).join('')}</ul>` : '<div class="empty-state">עוד אין מתכונים.</div>'}<button class="btn block soft" data-newrecipe>+ מתכון ביתי חדש</button>`;
    } else if (tab === 'fixed') {
      const list = D.state.fixedMeals;
      res.innerHTML = list.length ? `<ul class="list">${list.map(m => { const tot = m.items.reduce((a, i) => { const f = food(i.foodId) || (i.manual ? manualFood(i.manual) : null); if (!f) return a; const n = nutrients(f, i.grams); a.k += n.kcal; a.p += n.protein; return a; }, { k: 0, p: 0 }); return `<li class="li" data-fixed="${esc(m.id)}"><div class="m"><b>${esc(m.name)}</b><small>${m.items.length} רכיבים · ${n0(tot.k)} קק״ל · ${n0(tot.p)} ג׳ חלבון</small></div><div class="a">+</div></li>`; }).join('')}</ul>` : '<div class="empty-state">עוד אין ארוחות קבועות. בכל ארוחה ב״היום שלי״ אפשר לשמור אותה כקבועה.</div>';
    } else if (tab === 'out') {
      res.innerHTML = Object.entries(EATOUT_CATS).map(([c, l]) => `<h3 style="margin-top:10px">${esc(l)}</h3><ul class="list">${EATOUT.filter(d => d.cat === c).map(eatoutRow).join('')}</ul>`).join('')
        + '<p class="tiny muted">רשתות: הערכים שהרשת פרסמה בארה״ב (אין נתונים רשמיים ישראליים שאפשר לייבא) — המנות בארץ יכולות להיות שונות. מנות ממסעדה: הערכה לפי מזונות במאגר; אפשר לערוך כל כמות אחרי ההוספה.</p>';
    } else if (tab === 'scan') {
      res.innerHTML = scanHtml();
    } else if (tab === 'photo') {
      res.innerHTML = photoHtml();
    } else if (tab === 'manual') {
      res.innerHTML = manualHtml();
    } else {
      res.innerHTML = `<div class="stack"><button class="btn block soft" data-new>+ מוצר אישי לפי תווית האריזה</button><button class="btn block plain" data-usda>חיפוש ב-USDA FoodData Central (באנגלית)</button>
        ${D.state.custom.length ? `<ul class="list">${D.state.custom.map(c => foodRow(food('c:' + c.id))).join('')}</ul>` : ''}</div>`;
    }
  };
  q.addEventListener('input', () => { if (tab !== 'search') { tab = 'search'; $$('#fptabs button', s.el).forEach(b => b.classList.toggle('on', b.dataset.t === 'search')); } draw(); });
  on(s.el, '#fptabs button', 'click', (e, b) => { tab = b.dataset.t; $$('#fptabs button', s.el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  on(s.el, '[data-dish]', 'click', (e, li) => openEatout(eatoutById(li.dataset.dish), { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }));
  on(s.el, '[data-food]', 'click', (e, li) => { const f = food(li.dataset.food); if (!f) return; if (onPick) { s.close(); onPick(f); } else openFoodDetail(f, { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }); });
  on(s.el, '[data-new]', 'click', e => { e.preventDefault(); openCustomForm({ name: q.value.trim(), onSaved: f => { draw(); openFoodDetail(f, { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }); } }); });
  on(s.el, '[data-usda]', 'click', () => openUsda({ onSaved: f => { draw(); openFoodDetail(f, { date, meal: curMeal(), onDone: () => { s.close(); onAdded?.(); } }); } }));
  on(s.el, '[data-newrecipe]', 'click', () => openRecipe({ onSaved: () => draw() }));
  on(s.el, '[data-fixed]', 'click', async (e, li) => {
    const m = D.state.fixedMeals.find(x => x.id === li.dataset.fixed); if (!m || !date) return;
    await save('POST', '/api/entries', { entries: m.items.map(i => ({ ...i, date, meal: curMeal(), status: 'planned', source: 'fixed' })) });
    await refresh(); toast(`"${m.name}" נוספה לתכנון`); s.close(); onAdded?.();
  });
  // ---- ברקוד / צילום ערכים / ידני (מהיומן הקודם) ----
  const added = () => { s.close(); onAdded?.(); };
  const addEntry = async (status, entry) => { await save('POST', '/api/entries', { entries: [{ date, meal: curMeal(), status, source: entry.source || 'manual', ...entry }] }); await refresh(); toast(status === 'eaten' ? 'נרשם כ"אכלתי"' : 'נוסף לתכנון'); added(); };
  let lastScan = null;
  const scanMsg = (t, kind) => { const m = $('#scmsg', s.el); if (m) { m.hidden = !t; m.textContent = t || ''; m.className = 'note ' + (kind || ''); } };
  const lookup = raw => {
    const bc = normBc(raw); $('#scunk', s.el).hidden = true;
    if (bc.length < 6) return scanMsg('המספר קצר מדי לברקוד.', 'warn');
    $('#bcin', s.el).value = bc;
    const c = findByBarcode(bc);
    if (c) { lastScan = null; scanMsg(''); return openFoodDetail(food('c:' + c.id), { date, meal: curMeal(), onDone: added }); }
    lastScan = bc; scanMsg(`ברקוד ${bc} עוד לא שמור אצלך.`, 'warn'); $('#scunk', s.el).hidden = false;
  };
  s.el.addEventListener('change', async e => {
    if (e.target.id === 'scfile') {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      scanMsg('קורא את הברקוד…'); $('#scunk', s.el).hidden = true;
      try { const bc = await decodeBarcode(f); if (bc) lookup(bc); else scanMsg('לא הצלחתי לקרוא את הברקוד. נסה שוב מקרוב ובאור טוב, או הקלד את המספר שמתחתיו.', 'warn'); }
      catch (x) { scanMsg(x?.message === 'zxing' ? 'קורא הברקוד לא נטען. הקלד את המספר שמתחת לברקוד.' : 'לא הצלחתי לקרוא את התמונה. נסה שוב או הקלד את המספר.', 'warn'); }
    }
    if (e.target.id === 'phfile') {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const msg = $('#phmsg', s.el); msg.hidden = false; msg.className = 'note'; msg.textContent = 'קורא את הערכים מהתמונה…'; $('#phbody', s.el).hidden = true;
      try {
        const r = await readLabelPhoto(f);
        if (!r?.found) { msg.className = 'note warn'; msg.textContent = 'לא הצלחתי לקרוא טבלת ערכים. נסה תמונה חדה וקרובה יותר.'; return; }
        ph = r; $('#phbody', s.el).hidden = false; fillPhoto();
        msg.className = 'note ok'; msg.textContent = r.unitGrams ? `נקרא. על האריזה: ${r.unitLabel || 'יחידה'} = ${r.unitGrams} ${r.basis === '100ml' ? 'מ״ל' : 'גרם'}. בדוק את הערכים ורשום כמה אכלת.` : 'נקרא. בדוק את הערכים ורשום כמה אכלת.';
      } catch (x) { msg.className = 'note warn'; msg.innerHTML = esc(x.message) + (x.code === 'consent' ? ' <button class="btn xs" data-consent>לאישור</button>' : ''); }
    }
  });
  on(s.el, '[data-scbtn]', 'click', () => $('#scfile', s.el).click());
  on(s.el, '[data-bcfind]', 'click', () => lookup($('#bcin', s.el).value));
  s.el.addEventListener('keydown', e => { if (e.target.id === 'bcin' && e.key === 'Enter') lookup(e.target.value); });
  on(s.el, '[data-scnew]', 'click', () => openCustomForm({ data: { barcode: lastScan }, onSaved: f => { if (f) openFoodDetail(f, { date, meal: curMeal(), onDone: added }); } }));
  on(s.el, '[data-sclink]', 'click', async () => {
    const id = $('#sclinksel', s.el).value; if (!id || !lastScan) return;
    await save('PUT', '/api/custom/' + id + '/barcode', { barcode: lastScan }); await refresh(); lastScan = null;
    toast('הברקוד שויך'); openFoodDetail(food('c:' + id), { date, meal: curMeal(), onDone: added });
  });
  // צילום ערכים
  let ph = null; let phMode = 'g';
  const phNum = id => +($('#' + id, s.el)?.value || '').replace(',', '.') || 0;
  const phWord = () => ph?.basis === '100ml' ? 'מ״ל' : 'גרם';
  const fillPhoto = () => {
    $('#phn', s.el).value = ph.name || ''; $('#phk', s.el).value = ph.kcal; $('#php', s.el).value = ph.protein; $('#phc', s.el).value = ph.carbs; $('#phf', s.el).value = ph.fat;
    $('#phuw', s.el).value = ph.unitGrams || ''; $('#phbasis', s.el).textContent = ph.basis === '100ml' ? '100 מ״ל' : '100 ג׳';
    $('#phg', s.el).placeholder = `כמה ${phWord()} אכלת?`; $('#phu', s.el).placeholder = `כמה ${ph.unitLabel || 'יחידות'}?`; $('#phuw', s.el).placeholder = `${phWord()} ליחידה`;
    setPhMode('g');
  };
  const setPhMode = m => { phMode = m; $$('[data-phm]', s.el).forEach(b => b.classList.toggle('on', b.dataset.phm === m)); $('#phgrow', s.el).hidden = m !== 'g'; $('#phurow', s.el).hidden = m !== 'u'; phPreview(); };
  const phPending = () => {
    if (!ph) return null; const name = $('#phn', s.el).value.trim(); const k = phNum('phk'); if (!name || !($('#phk', s.el).value !== '' && k >= 0)) return null;
    const u = phNum('phu'), uw = phNum('phuw'); const amt = phMode === 'g' ? phNum('phg') : u * uw; if (!(amt > 0)) return null;
    return { name, k, p: phNum('php'), c: phNum('phc'), f: phNum('phf'), amt, u, uw };
  };
  const phPreview = () => { const x = phPending(); const el = $('#phprev', s.el); if (!el) return; const m = x ? x.amt / 100 : 0; el.textContent = x ? `${n0(x.k * m)} קק״ל · ח ${n1(x.p * m)} · פ ${n1(x.c * m)} · ש ${n1(x.f * m)}` : ''; $$('[data-phadd]', s.el).forEach(b => b.disabled = !x); };
  on(s.el, '[data-phbtn]', 'click', () => $('#phfile', s.el).click());
  on(s.el, '[data-phm]', 'click', (e, b) => setPhMode(b.dataset.phm));
  on(s.el, '[data-consent]', 'click', async () => { const { openAiConsent } = await import('./chat.js'); openAiConsent(); });
  s.el.addEventListener('input', e => { if (e.target.closest('#phbody')) phPreview(); if (e.target.closest('#manbody')) manPreview(); });
  on(s.el, '[data-phadd]', 'click', async (e, b) => {
    const x = phPending(); if (!x) return;
    const unitName = ph.unitLabel || 'יחידה'; const units = phMode === 'u' && x.uw > 0;
    const qtyFields = units ? { unit: unitName, qty: x.u } : { unit: 'g', qty: null };
    if ($('#phsave', s.el).checked) {
      const r = await save('PUT', '/api/custom', { name: x.name, k: x.k, p: x.p, c: x.c, f: x.f, unitName: x.uw > 0 ? unitName : '', unitGrams: x.uw > 0 ? x.uw : '', origin: 'label' });
      await refresh();
      return addEntry(b.dataset.phadd, { foodId: 'c:' + r.id, grams: x.amt, ...qtyFields });
    }
    addEntry(b.dataset.phadd, { manual: { name: x.name, k: x.k, p: x.p, c: x.c, f: x.f, per: '100g', unitName: x.uw > 0 ? unitName : '', unitGrams: x.uw > 0 ? x.uw : '' }, grams: x.amt, ...qtyFields, source: 'photo' });
  });
  // ידני: שם המנה + ערכים לכל המנה
  const manPending = () => { const name = $('#mn', s.el)?.value.trim(); const kv = $('#mk', s.el)?.value; const k = +String(kv).replace(',', '.'); if (!name || kv === '' || !(k >= 0)) return null; const v = id => +($('#' + id, s.el).value.replace(',', '.')) || 0; return { name, k, p: v('mp'), c: v('mc'), f: v('mf') }; };
  const manPreview = () => { const x = manPending(); const el = $('#manprev', s.el); if (el) el.textContent = x ? `${n0(x.k)} קק״ל · ח ${n1(x.p)} · פ ${n1(x.c)} · ש ${n1(x.f)}` : ''; $$('[data-manadd]', s.el).forEach(b => b.disabled = !x); };
  on(s.el, '[data-manadd]', 'click', (e, b) => { const x = manPending(); if (!x) return; addEntry(b.dataset.manadd, { manual: { ...x, per: 'portion' }, grams: 100, unit: 'מנה', qty: 1 }); });
  const _draw = draw;
  draw = () => { _draw(); if (tab === 'manual') manPreview(); if (tab === 'photo') { ph = null; } };
  draw(); setTimeout(() => q.focus(), 60);
  return s;
}

const scanHtml = () => `<div class="stack">
  <button class="btn block xl" data-scbtn>📷 צלם את הברקוד</button><input id="scfile" type="file" accept="image/*" capture="environment" hidden>
  <div class="row"><input class="in grow" id="bcin" inputmode="numeric" placeholder="או הקלד את המספר שמתחת לברקוד" aria-label="מספר ברקוד" dir="ltr"><button class="btn plain" data-bcfind>חפש</button></div>
  <p class="tiny muted">צלם מקרוב, שהקווים יהיו חדים וימלאו את רוב התמונה. פעם ראשונה למוצר: שומרים אותו עם הערכים, ומהפעם הבאה הסריקה מוצאת אותו לבד. הברקוד נקרא במכשיר — התמונה לא נשלחת לשום מקום.</p>
  <div id="scmsg" class="note" hidden></div>
  <div id="scunk" class="stack" hidden><button class="btn block" data-scnew>שמור כמוצר חדש</button>
    ${D.state.custom.length ? `<div class="small muted">או שזה מוצר שכבר שמרתי:</div><div class="row"><select class="in grow" id="sclinksel" aria-label="מוצר שמור לשיוך">${[...D.state.custom].sort((a, b) => a.name.localeCompare(b.name, 'he')).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button class="btn plain" data-sclink>שייך ברקוד</button></div>` : ''}</div></div>`;

const photoHtml = () => `<div class="stack">
  <button class="btn block xl" data-phbtn>📷 העלה או צלם תמונה של הערכים התזונתיים</button><input id="phfile" type="file" accept="image/*" hidden>
  <p class="tiny muted">תמונה של הטבלה התזונתית מהאריזה. אני קורא את הערכים, ואתה רק רושם כמה גרם אכלת, או כמה יחידות. ${D.session?.ai ? 'התמונה בלבד נשלחת לספק ה-AI לקריאה (בלי פרטים מזהים), ורק אם אישרת.' : ''}</p>
  <div id="phmsg" class="note" hidden></div>
  <div id="phbody" class="stack" hidden>
    <label class="field"><span>שם המוצר (חובה)</span><input class="in" id="phn"></label>
    <div class="small muted">ערכים ל-<span id="phbasis">100 ג׳</span> (אפשר לתקן)</div>
    <div class="grid4"><label class="field"><span>קק״ל</span><input class="in" id="phk" inputmode="decimal"></label><label class="field"><span>חלבון</span><input class="in" id="php" inputmode="decimal"></label><label class="field"><span>פחמימה</span><input class="in" id="phc" inputmode="decimal"></label><label class="field"><span>שומן</span><input class="in" id="phf" inputmode="decimal"></label></div>
    <div class="seg"><button type="button" data-phm="g" class="on">אכלתי בגרמים</button><button type="button" data-phm="u">אכלתי יחידות</button></div>
    <div id="phgrow"><input class="in" id="phg" inputmode="decimal" placeholder="כמה גרם אכלת?" aria-label="כמות"></div>
    <div id="phurow" class="grid2" hidden><input class="in" id="phu" inputmode="decimal" placeholder="כמה יחידות?" aria-label="מספר יחידות"><input class="in" id="phuw" inputmode="decimal" placeholder="גרם ליחידה" aria-label="משקל יחידה"></div>
    <label class="row small" style="gap:8px"><input type="checkbox" id="phsave" style="width:22px;height:22px"> שמור גם ב״מוצרים אישיים״ לפעם הבאה</label>
    <div class="note ok" id="phprev"></div>
    <div class="row"><button class="btn plain grow" data-phadd="planned" disabled>הוסף לתכנון</button><button class="btn grow" data-phadd="eaten" disabled>אכלתי</button></div></div></div>`;

const manualHtml = () => `<div class="stack" id="manbody">
  <p class="tiny muted">רישום מהיר של מנה בלי לחפש במאגר: שם וערכים לכל המנה.</p>
  <label class="field"><span>שם המנה</span><input class="in" id="mn"></label>
  <div class="grid4"><label class="field"><span>קק״ל</span><input class="in" id="mk" inputmode="decimal"></label><label class="field"><span>חלבון</span><input class="in" id="mp" inputmode="decimal"></label><label class="field"><span>פחמימה</span><input class="in" id="mc" inputmode="decimal"></label><label class="field"><span>שומן</span><input class="in" id="mf" inputmode="decimal"></label></div>
  <div class="note ok" id="manprev"></div>
  <div class="row"><button class="btn plain grow" data-manadd="planned" disabled>הוסף לתכנון</button><button class="btn grow" data-manadd="eaten" disabled>אכלתי</button></div></div>`;

const eatoutRow = d => `<li class="li" data-dish="${esc(d.id)}"><div class="m"><b>🍽 ${esc(d.name)}${d.chain ? ` · ${esc(d.chain)}` : ''}</b><small>${d.kind === 'official' ? 'ערכי הרשת (ארה״ב)' : 'הערכה'} · ${esc(d.groups.filter(g => g.type !== 'count').map(g => g.label).join(', '))}</small></div><div class="a">›</div></li>`;

/** הרכבת מנה מבחוץ: בחירות → ערכים מתעדכנים מיד → הוספה ליומן, או החלפת מה שתוכנן לארוחה (כל רכיב נספר פעם אחת) */
export function openEatout(dish, { date, meal, onDone } = {}) {
  const choice = defaultChoice(dish);
  const planned = () => D.state.entries.filter(e => e.date === date && e.meal === meal && e.status !== 'eaten');
  const s = openSheet({ title: dish.name + (dish.chain ? ` · ${dish.chain}` : ''), body: '<div id="eob"></div>', foot: '<button class="btn plain" data-eoadd="planned">הוסף לתכנון</button><button class="btn" data-eoadd="eaten">אכלתי</button>' });
  let replace = planned().length > 0;
  const draw = () => {
    const r = composeDish(dish, choice, D.foods); const pl = planned();
    const pr = pl.reduce((a, e) => { const f = D.foods.get(e.foodId) || e.snapshot; const n = nutrients(f, e.grams); a.k += n.kcal; a.p += n.protein; return a; }, { k: 0, p: 0 });
    $('#eob', s.el).innerHTML = `<div class="note ${dish.kind === 'official' ? '' : 'warn'} small">${dish.kind === 'official' ? `ערכים רשמיים שפרסמה ${esc(dish.chain)} בארה״ב. אין נתונים רשמיים ישראליים שאפשר לייבא, והמנה בארץ יכולה להיות שונה.` : '<b>הערכה</b> — מנה כללית ממסעדה, לפי מזונות במאגר. אחרי ההוספה אפשר לערוך כל כמות.'}</div>
      ${dish.groups.map(g => g.type === 'count'
        ? `<div class="field"><span>${esc(g.label)}</span><div class="row" style="gap:12px"><button type="button" class="cupbtn" data-cnt="${g.id}" data-d="-1">−</button><b class="num" style="font-size:22px">${choice[g.id]}</b><button type="button" class="cupbtn" data-cnt="${g.id}" data-d="1">+</button></div></div>`
        : `<div class="field"><span>${esc(g.label)}</span><div class="chips">${g.choices.map(c => `<button type="button" class="chip ${(g.type === 'one' ? choice[g.id] === c.id : (choice[g.id] || []).includes(c.id)) ? 'on' : ''}" data-g="${g.id}" data-c="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div></div>`).join('')}
      <div class="card tight"><b>${esc(dishTitle(dish, choice))}</b><ul class="list" style="margin-top:6px">${r.items.map(i => `<li class="li"><div class="m"><b>${esc(i.label)}</b><small>${esc(qtyText(D.foods.get(i.foodId), i.grams, i.unit, i.qty))}</small></div><div class="a"><b class="num">${n0(i.kcal)}</b> קק״ל<br><span class="num">${n1(i.protein)}</span> ג׳ חלבון</div></li>`).join('')}</ul>
        <div class="note ok" id="eotot">סה״כ: <b class="num">${n0(r.totals.kcal)}</b> קק״ל · <b class="num">${n0(r.totals.protein)}</b> ג׳ חלבון · פחמ׳ ${n0(r.totals.carbs)} · שומן ${n0(r.totals.fat)}</div></div>
      ${pl.length ? `<label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" id="eorep" style="width:22px;height:22px" ${replace ? 'checked' : ''}> להחליף את מה שתוכנן לארוחה הזו (${pl.length} פריטים · ${n0(pr.k)} קק״ל)</label>` : ''}`;
    $('#eorep', s.el)?.addEventListener('change', e => { replace = e.target.checked; });
  };
  on(s.el, '[data-g]', 'click', (e, b) => {
    const g = dish.groups.find(x => x.id === b.dataset.g);
    if (g.type === 'one') choice[g.id] = b.dataset.c;
    else { const set = new Set(choice[g.id] || []); set.has(b.dataset.c) ? set.delete(b.dataset.c) : set.add(b.dataset.c); choice[g.id] = [...set]; }
    draw();
  });
  on(s.el, '[data-cnt]', 'click', (e, b) => { const g = dish.groups.find(x => x.id === b.dataset.cnt); choice[g.id] = Math.max(g.min, Math.min(g.max, (+choice[g.id] || g.def) + +b.dataset.d)); draw(); });
  on(s.el, '[data-eoadd]', 'click', async (e, b) => {
    const r = composeDish(dish, choice, D.foods); const title = dishTitle(dish, choice); const group = 'eo' + Date.now().toString(36);
    if (replace) for (const x of planned()) await del('/api/entries/' + x.id);
    await save('POST', '/api/entries', { entries: r.items.map((i, k) => ({ date, meal, foodId: i.foodId, grams: i.grams, unit: i.unit, qty: i.qty, status: b.dataset.eoadd, source: 'eatout', label: `${dish.name}: ${i.label}`, group, order: Date.now() + k })) });
    await refresh(); s.close(); toast(`${title} — ${replace ? 'הוחלף בארוחה' : 'נוסף'} (${n0(r.totals.kcal)} קק״ל)`, 3500); onDone?.();
  });
  draw();
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
  const table = () => { const g = grams(); const n = nutrients(f, g || 0); return `<table class="nut"><thead><tr><th></th><th>${esc(perLabel(f))}</th><th>לכמות שלך (${esc(qtyText(f, g, unit, qty))})</th></tr></thead><tbody>
        <tr><td>קלוריות</td><td class="num">${n0(f.k)}</td><td class="num"><b>${n0(n.kcal)}</b></td></tr>
        <tr><td>חלבון (ג׳)</td><td class="num">${n1(f.p)}</td><td class="num"><b>${n1(n.protein)}</b></td></tr>
        <tr><td>פחמימות (ג׳)</td><td class="num">${n1(f.c)}</td><td class="num">${n1(n.carbs)}</td></tr>
        <tr><td>שומן (ג׳)</td><td class="num">${n1(f.f)}</td><td class="num">${n1(n.fat)}</td></tr>
        <tr><td>סיבים (ג׳)</td><td class="num">${f.fi == null ? '—' : n1(f.fi)}</td><td class="num">${f.fi == null ? '—' : n1(n.fiber)}</td></tr>
        ${f.na != null ? `<tr><td>נתרן (מ״ג)</td><td class="num">${n0(f.na)}</td><td class="num">${n0(n.sodium)}</td></tr>` : ''}
      </tbody></table>`; };
  const draw = () => {
    $('#fdb', s.el).innerHTML = `
      <div class="row between"><div class="small muted">${srcLine(f)}</div>${f.src === 'manual' ? '' : `<button class="iconbtn" data-fav aria-label="מועדף">${isFav() ? '★' : '☆'}</button>`}</div>
      ${(f.src === 'usda' || f.src === 'cofid') ? `<div class="small muted" dir="ltr" style="text-align:right">${esc(f.e)}</div>${f.he === 1 ? '<div class="tiny muted">השם העברי תורגם אוטומטית מהתיאור באנגלית.</div>' : ''}` : ''}
      ${f.st ? `<div class="note ${f.st === 'dry' || f.st === 'raw' ? 'warn' : ''}" style="margin:8px 0"><b>${esc(STATE[f.st].label)}</b><br><span class="small">${esc(STATE[f.st].hint)}</span></div>` : ''}
      ${f.src === 'recipe' ? `<div class="note" style="margin:8px 0">מתכון: ${n0(f.rawGrams)} ג׳ רכיבים (כולל שמן ורטבים) → ${n0(f.finalGrams)} ג׳ בסיר. הערכים לפי החלק שאכלת.</div>` : ''}
      <div class="grid2" style="margin-top:10px"><label class="field"><span>כמות</span><input class="in" id="fq" inputmode="decimal" value="${qty}"></label>
        <label class="field"><span>יחידה</span><select class="in" id="fu">${units.map(u => `<option value="${esc(u.key)}" ${u.key === unit ? 'selected' : ''}>${esc(u.label)}${u.key === 'g' || f.pp ? '' : ` (${u.g} ג׳)`}</option>`).join('')}</select></label></div>
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
    ${D.session?.ai ? '<button type="button" class="btn block soft" data-lbl>📷 צלם טבלה תזונתית</button><input id="lblfile" type="file" accept="image/*" hidden><div id="lblmsg" class="note" hidden style="margin-top:8px"></div>' : ''}
    ${f('cn', 'שם המוצר', c.name)}${f('cb', 'מותג (לא חובה)', c.brand)}${f('cbc', 'ברקוד (לא חובה)', c.barcode, 'inputmode="numeric" dir="ltr"')}
    <div class="grid2">${f('ck', 'אנרגיה (קק״ל)', c.k, 'inputmode="decimal"')}${f('cp', 'חלבון (ג׳)', c.p, 'inputmode="decimal"')}${f('cc', 'פחמימות (ג׳)', c.c, 'inputmode="decimal"')}${f('cf', 'שומן (ג׳)', c.f, 'inputmode="decimal"')}${f('cfi', 'סיבים (ג׳)', c.fi, 'inputmode="decimal"')}${f('cna', 'נתרן (מ״ג)', c.na, 'inputmode="decimal"')}</div>
    <div class="grid2">${f('cun', 'שם יחידה (לא חובה)', c.unitName, 'placeholder="למשל: גביע, חטיף"')}${f('cug', 'משקל יחידה (ג׳)', c.unitGrams, 'inputmode="decimal"')}</div>
    <label class="field"><span>מצב</span><select class="in" id="cst"><option value="">מוכן לאכילה / לא רלוונטי</option>${Object.entries(STATE).map(([k, v]) => `<option value="${k}" ${c.st === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <div id="cerr"></div>`, foot: `${data?.id ? '<button class="btn danger" data-del>מחק</button>' : ''}<button class="btn" data-ok>שמור מוצר</button>` });
  const v = id => $('#' + id, s.el).value.trim().replace(',', '.');
  on(s.el, '[data-ok]', 'click', async () => {
    try {
      const r = await save('PUT', '/api/custom', { id: data?.id, name: v('cn'), brand: v('cb'), k: v('ck'), p: v('cp'), c: v('cc'), f: v('cf'), fi: v('cfi'), na: v('cna'), unitName: v('cun'), unitGrams: v('cug'), st: v('cst'), barcode: v('cbc'), origin: data?.origin || 'label', fdcId: data?.fdcId });
      await refresh(); s.close(); toast('המוצר נשמר'); onSaved?.(food('c:' + r.id));
    } catch {}
  });
  on(s.el, '[data-lbl]', 'click', () => $('#lblfile', s.el).click());
  $('#lblfile', s.el)?.addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const m = $('#lblmsg', s.el); m.hidden = false; m.className = 'note'; m.textContent = 'קורא את הטבלה…';
    try {
      const r = await readLabelPhoto(file);
      if (!r?.found) { m.className = 'note warn'; m.textContent = 'לא הצלחתי לקרוא את הטבלה. נסה תמונה חדה יותר או מלא ידנית.'; return; }
      const setv = (id, x) => { $('#' + id, s.el).value = x ?? ''; };
      if (!$('#cn', s.el).value.trim() && r.name) setv('cn', r.name);
      setv('ck', r.kcal); setv('cp', r.protein); setv('cc', r.carbs); setv('cf', r.fat);
      if (r.unitGrams) { setv('cug', r.unitGrams); if (!$('#cun', s.el).value) setv('cun', r.unitLabel || 'יחידה'); }
      m.className = 'note ok'; m.textContent = 'בדוק שהערכים נכונים ולחץ שמור.' + (r.basis === '100ml' ? ' (הערכים ל-100 מ״ל)' : '');
    } catch (x) { m.className = 'note warn'; m.textContent = x.code === 'consent' ? 'לא ניתן אישור לקריאת התמונה (עוד ← מלווה חכם). מלא ידנית.' : 'קריאת הטבלה נכשלה. מלא ידנית.'; }
  });
  on(s.el, '[data-del]', 'click', async () => { await del('/api/custom/' + data.id); await refresh(); s.close(); toast('המוצר נמחק'); onSaved?.(null); });
}

export function openUsda({ onSaved } = {}) {
  const s = openSheet({ title: 'USDA FoodData Central', body: `<p class="small muted">מקור משלים למזונות שאין במאגר הישראלי. החיפוש באנגלית. פריט שתבחר יישמר כמוצר אישי עם ציון המקור.</p>
    <form id="uf" class="row"><input class="in grow" id="uq" aria-label="חיפוש במאגר USDA (באנגלית)" placeholder="greek yogurt" dir="ltr"><button class="btn">חפש</button></form><div id="ur" style="margin-top:10px"></div>` });
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
      <ul class="list">${r.items.map((it, i) => { const f = food(it.foodId); const n = f ? nutrients(f, it.grams) : null; return `<li class="li"><div class="m"><b>${esc(f?.n || it.foodId)}</b><small>${n ? `${n0(n.kcal)} קק״ל · ${n1(n.protein)} ג׳ חלבון` : ''}</small></div><input class="in" style="width:90px;min-height:42px" data-g="${i}" inputmode="decimal" aria-label="כמות בגרמים" value="${it.grams}"><button class="iconbtn" data-rm="${i}" aria-label="הסר">✕</button></li>`; }).join('')}</ul>
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

/** בניית ארוחה קבועה מאפס או עריכה (מהיומן הקודם: "תפריט קבוע שלי"): שם, רכיבים מהמאגר או מהמוצרים, כמויות */
export function openFixedMeal({ meal = null, onSaved } = {}) {
  const m = meal ? structuredClone(meal) : { name: '', items: [] };
  const fOf = it => food(it.foodId) || (it.manual ? manualFood(it.manual) : null);
  const s = openSheet({ title: meal ? 'עריכת ארוחה קבועה' : 'ארוחה קבועה חדשה', body: '<div id="fmb"></div>', foot: `${meal ? '<button class="btn danger" data-delm>מחק</button>' : ''}<button class="btn" data-ok>שמור ארוחה</button>` });
  const draw = () => {
    const tot = m.items.reduce((a, it) => { const f = fOf(it); if (!f) return a; const n = nutrients(f, it.grams); a.k += n.kcal; a.p += n.protein; a.c += n.carbs; a.f += n.fat; return a; }, { k: 0, p: 0, c: 0, f: 0 });
    $('#fmb', s.el).innerHTML = `<label class="field"><span>שם הארוחה</span><input class="in" id="fmn" value="${esc(m.name)}" placeholder="למשל ארוחת בוקר קבועה"></label>
      <ul class="list">${m.items.map((it, i) => { const f = fOf(it); const n = f ? nutrients(f, it.grams) : null; const pp = f?.pp; return `<li class="li"><div class="m"><b>${esc(f?.n || 'מזון לא זמין')}</b><small>${n ? `${n0(n.kcal)} קק״ל · ${n1(n.protein)} ג׳ חלבון` : ''}</small></div><input class="in" style="width:80px;min-height:42px" data-g="${i}" inputmode="decimal" aria-label="כמות" value="${pp ? (it.qty || it.grams / 100) : n0(it.grams)}"><span class="small">${pp ? esc(pp) : 'ג׳'}</span><button class="iconbtn" data-out="${i}" aria-label="הסר">✕</button></li>`; }).join('') || '<li class="empty-state">עוד אין רכיבים.</li>'}</ul>
      <button class="btn block soft" data-addi>+ הוסף רכיב</button>
      ${m.items.length ? `<div class="card tight" style="margin-top:10px">סה״כ: <b>${n0(tot.k)}</b> קק״ל · חלבון ${n0(tot.p)} · פחמימה ${n0(tot.c)} · שומן ${n0(tot.f)}</div>` : ''}`;
  };
  const sync = () => {
    m.name = $('#fmn', s.el)?.value ?? m.name;
    $$('[data-g]', s.el).forEach(i => { const it = m.items[+i.dataset.g]; const v = +i.value.replace(',', '.') || 0; const f = fOf(it); if (f?.pp) { it.qty = v; it.grams = v * 100; it.unit = f.pp; } else { it.grams = v; it.unit = 'g'; it.qty = null; } });
  };
  s.el.addEventListener('change', e => { sync(); if (e.target.dataset.g != null) draw(); }); // שינוי שם לא מצייר מחדש — כדי לא לבלוע לחיצה על כפתור
  on(s.el, '[data-out]', 'click', (e, b) => { sync(); m.items = m.items.filter((_, k) => k !== +b.dataset.out); draw(); });
  on(s.el, '[data-addi]', 'click', () => { sync(); openFoodPicker({ title: 'רכיב לארוחה', onPick: f => { const du = defaultUnit(f); m.items.push(f.pp ? { foodId: f.id, grams: 100, unit: f.pp, qty: 1 } : { foodId: f.id, grams: du ? du[1] : 100, unit: 'g', qty: null }); draw(); } }); });
  on(s.el, '[data-ok]', 'click', async () => {
    sync(); if (!m.name.trim()) return toast('תן שם לארוחה'); if (!m.items.length) return toast('הוסף לפחות רכיב אחד');
    try { await save('PUT', '/api/fixed-meals', { id: meal?.id, name: m.name.trim(), items: m.items }); await refresh(); s.close(); toast('הארוחה הקבועה נשמרה'); onSaved?.(); } catch {}
  });
  on(s.el, '[data-delm]', 'click', async () => { await del('/api/fixed-meals/' + meal.id); await refresh(); s.close(); toast('נמחק'); onSaved?.(); });
  draw();
}
