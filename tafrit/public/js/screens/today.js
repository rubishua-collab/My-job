// "היום שלי": סיכום, שקילת בוקר, שלוש פעולות, הארוחות עם תכננתי / אכלתי / ערוך כמות
import { route, go } from '../app.js';
import { D, refresh, profile, baseProfile, planOn, today, food, foodOf, targetOn, slots, entriesOn, dayDoc, dayTotals, recentComps, waterGoalMl, CUP_ML } from '../data.js';
import { TRAIN_BONUS } from '/shared/nutrition.js';
import { save, del, get } from '../api.js';
import { $, $$, esc, n0, n1, kg, toast, openSheet, meter, on, confirmSheet } from '../ui.js';
import { nutrients, qtyText, unitsFor, STATE, isVegFruit } from '/shared/foods.js';
import { suggestMeals, budgetForSlot, planDay, nextSlot, swapItem, swapCandidates, familyContext, PLANNER_SOURCES, SWAP_LABEL, swapChoices, applySwap, substituteFood, famGroup, otherMeal, recipeContext, requiredGroups } from '/shared/planner.js';
import { COMPONENTS, componentsInText } from '/shared/catalog.js';
import { addDays, dmy, hebDay, israelMinutes, savedAt } from '/shared/dates.js';
import { GOALS } from '/shared/nutrition.js';
import { openFoodPicker, openFoodDetail } from './food.js';
import { openWeightSheet } from './weight.js';

let curDate = null;

route('today', async (el, [d]) => {
  curDate = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today();
  await draw();
});

export async function draw() {
  const { freshView } = await import('../app.js');
  if (((location.hash || '').replace(/^#\/?/, '') || 'today').split('/')[0] !== 'today') return; // המשתמש כבר עבר למסך אחר
  const el = freshView();
  const date = curDate; const isToday = date === today();
  const tgt = targetOn(date); const tot = dayTotals(date); const day = dayDoc(date);
  const w = D.state.weights.find(x => x.date === date);
  const p = profile(date);
  el.innerHTML = `<div class="stack">
    <div class="top"><div><h1>${isToday ? 'היום שלי' : hebDay(date)}</h1><div class="sub">${hebDay(date)} · ${dmy(date)}</div></div>
      <div class="daynav"><button class="iconbtn" data-day="-1" aria-label="יום קודם">›</button>${isToday ? '' : '<button class="btn xs plain" data-day="0">היום</button>'}<button class="iconbtn" data-day="1" aria-label="יום הבא" ${date >= addDays(today(), 7) ? 'disabled' : ''}>‹</button></div></div>
    ${tgt ? `<div class="card sum">${meter('קלוריות', tot.eaten.kcal, tot.planned.kcal, tgt.kcal, 'קק״ל')}${meter('חלבון', tot.eaten.protein, tot.planned.protein, tgt.protein, 'ג׳')}
      ${tgt.carbs && tgt.fat ? `<div class="grid2 minis">${meter('פחמימות', tot.eaten.carbs, tot.planned.carbs, tgt.carbs, 'ג׳')}${meter('שומן', tot.eaten.fat, tot.planned.fat, tgt.fat, 'ג׳')}</div>` : ''}
      <div class="tiny muted">נספר רק מה שסימנת "אכלתי". סיבים: ${n0(tot.eaten.fiber)} ג׳ · ירקות ופירות: ${n0(tot.eaten.vf)} ג׳${tgt.train ? ` · כולל תוספת יום אימון ${tgt.train} קק״ל` : ''}</div>
      <label class="row small" style="gap:8px;margin-top:8px;cursor:pointer"><input type="checkbox" id="train" style="width:22px;height:22px" ${day.train ? 'checked' : ''}> היום יום אימון כוח (+${TRAIN_BONUS} קק״ל, כפחמימה)</label></div>`
      : `<div class="note warn">אין עדיין יעד יומי לתאריך הזה. <a href="#/targets/new">לחישוב היעדים</a></div>`}
    ${isToday || date < today() ? `<button class="btn block ${w ? 'soft' : 'xl'}" data-weigh>${w ? `⚖️ שקילת בוקר: <span class="num">${kg(w.kg)}</span> ק״ג · עריכה` : '⚖️ רשום שקילת בוקר'}</button>` : ''}
    ${(() => { const pl = planOn(date); return `<div class="card tight row between"><div class="small"><b>${esc(pl ? GOALS[pl.goal] : GOALS[profile(date)?.goal] || '')}</b>${pl ? ` · מ-${dmy(pl.startDate)}` : ''}${(D.state.plans || []).some(x => x.startDate > date) ? ' · <span class="pill">יש תוכנית עתידית</span>' : ''}</div><a class="btn xs soft" href="#/plan-change">🎯 שינוי מטרה ותוכנית</a></div>`; })()}
    <div class="actions3">
      <button class="btn xl" data-act="self"><span class="ic">🔍</span><span class="t">אבחר בעצמי<small>מהמאגר, מועדפים, מתכונים</small></span></button>
      <button class="btn xl soft" data-act="day"><span class="ic">🗓️</span><span class="t">בנה לי יום שלם<small>ארוחות נעולות ואכולות נשארות</small></span></button>
      <button class="btn xl soft" data-act="next"><span class="ic">✨</span><span class="t">הצע לי את הארוחה הבאה<small>לפי מה שנשאר לך היום</small></span></button>
    </div>
    ${slots(date).map(s => mealCard(s, date, day)).join('')}
    ${waterCard(date, day)}
    <label class="card tight row" style="gap:12px;cursor:pointer"><input type="checkbox" id="complete" style="width:26px;height:26px" ${day.complete ? 'checked' : ''}><span class="grow"><b>תיעדתי את כל מה שאכלתי היום</b><br><span class="tiny muted">רק ימים מסומנים נכנסים לממוצע האכילה השבועי. יום לא מסומן לא נחשב כ"אפס".</span></span></label>
    <div class="grid2"><button class="btn" data-pdf="share">📤 שלח PDF בוואטסאפ</button><button class="btn plain" data-pdf="save">⬇ שמור PDF</button></div><div class="small muted" id="pdfmsg"></div>
  </div>`;
  bind(el, date);
}

/** מים: כוסות ליום (כמו ביומן הקודם). גודל הכוס והיעד — בפרופיל */
function waterCard(date, day) {
  const p = profile(date) || {}; const cup = +p.cupMl || CUP_ML; const n = day.cups || 0;
  const w = [...D.state.weights].filter(x => x.date <= date).pop()?.kg; const goal = waterGoalMl(p, w);
  return `<section class="card tight water"><div class="row between"><b>💧 מים</b><button class="btn xs plain" data-wset>הגדרות</button></div>
    <div class="row" style="gap:12px;margin-top:6px"><button class="cupbtn" data-cup="-1" aria-label="הורד כוס">−</button><div><b class="num" style="font-size:22px">${n}</b> <span class="small muted">כוסות</span></div><button class="cupbtn" data-cup="1" aria-label="הוסף כוס">+</button>
    <span class="small muted num">${(n * cup / 1000).toFixed(2)} מתוך ${(goal / 1000).toFixed(goal % 1000 ? 1 : 0)} ליטר</span></div></section>`;
}
function mealCard(s, date, day) {
  const es = entriesOn(date).filter(e => e.meal === s.id);
  const locked = (day.locked || []).includes(s.id);
  const t = es.reduce((a, e) => { const n = nutrients(foodOf(e), e.grams); a.k += n.kcal; a.p += n.protein; if (e.status === 'eaten') { a.ek += n.kcal; } return a; }, { k: 0, p: 0, ek: 0 });
  const allEaten = es.length && es.every(e => e.status === 'eaten');
  return `<section class="card meal" data-meal="${s.id}">
    <div class="mh"><div class="t"><b>${esc(s.label)}</b><div>${s.time}${es.length ? ` · <span class="num">${n0(t.k)}</span> קק״ל · <span class="num">${n0(t.p)}</span> ג׳ חלבון` : ''}${allEaten ? ' · נאכל' : ''}</div></div>
      <button class="lock ${locked ? 'on' : ''}" data-lock aria-pressed="${locked}" title="נעילה: הארוחה לא תוחלף בבניית יום">${locked ? '🔒 נעול' : '🔓'}</button></div>
    ${es.length ? `<ul class="items">${es.map(itemRow).join('')}</ul>` : '<div class="empty">עוד לא נבחר כלום.</div>'}
    <div class="mf">${es.length ? `<button class="btn xs plain" data-mact="planned">תכננתי</button><button class="btn xs" data-mact="eaten">אכלתי</button><button class="btn xs plain" data-mact="edit">ערוך כמות</button>` : ''}
      <button class="btn xs soft" data-mact="add">+ הוסף</button><button class="btn xs soft" data-mact="suggest">✨ הצע</button>${es.length ? '<button class="btn xs plain" data-mact="fixed" aria-label="שמור כארוחה קבועה">☆ קבועה</button>' : ''}</div></section>`;
}
function itemRow(e) {
  const f = foodOf(e); const n = nutrients(f, e.grams);
  const planned = e.status === 'eaten' && e.plannedGrams && Math.abs(e.plannedGrams - e.grams) > 0.5 ? ` · תוכנן ${n0(e.plannedGrams)} ג׳` : '';
  return `<li class="item" data-entry="${e.id}"><div class="nm"><b>${esc(e.label || COMPONENTS[e.comp]?.name || f.n)}</b><small>${esc(qtyText(f, e.grams, e.unit, e.qty))}${f.st ? ' · ' + esc(STATE[f.st].short) : ''}${planned}</small></div>
    <div class="kc"><b class="num">${n0(n.kcal)}</b> קק״ל<br><span class="num">${n1(n.protein)}</span> ג׳ חלבון</div><span class="st ${e.status}">${e.status === 'eaten' ? 'אכלתי' : 'תכננתי'}</span></li>`;
}

function bind(el, date) {
  const redraw = async () => { await refresh(); draw(); };
  on(el, '[data-day]', 'click', (e, b) => { const d = +b.dataset.day; go(d === 0 ? '#/today' : '#/today/' + addDays(date, d)); });
  on(el, '[data-weigh]', 'click', () => openWeightSheet({ date, onSaved: redraw }));
  $('#train', el)?.addEventListener('change', async e => { await save('PUT', '/api/days/' + date, { train: e.target.checked }); await redraw(); toast(e.target.checked ? `יום אימון: היעד עלה ב-${TRAIN_BONUS} קק״ל` : 'הסימון הוסר'); });
  on(el, '[data-cup]', 'click', async (e, b) => { const n = Math.max(0, (dayDoc(date).cups || 0) + +b.dataset.cup); await save('PUT', '/api/days/' + date, { cups: n }); await redraw(); });
  on(el, '[data-wset]', 'click', () => openWaterSettings(date, redraw));
  on(el, '[data-pdf]', 'click', async (e, b) => { const { sendDayPdf } = await import('./pdf.js'); sendDayPdf(date, b.dataset.pdf, $('#pdfmsg', el)); });
  $('#complete', el).addEventListener('change', async e => { await save('PUT', '/api/days/' + date, { complete: e.target.checked }); await refresh(); toast(e.target.checked ? 'היום סומן כמתועד במלואו' : 'הסימון הוסר'); });
  on(el, '[data-act]', 'click', (e, b) => {
    const a = b.dataset.act;
    if (a === 'self') openFoodPicker({ date, meal: nextSlot(profile(date), entriesOn(date), date === today() ? israelMinutes() : 0) || slots(date)[0].id, onAdded: () => draw() });
    if (a === 'day') openPlanDay(date, () => draw());
    if (a === 'next') { const s = nextSlot(profile(date), entriesOn(date), date === today() ? israelMinutes() : 0); if (!s) return toast('כל הארוחות של היום סומנו כאכולות'); openSuggest(date, s, () => draw()); }
  });
  on(el, '[data-lock]', 'click', async (e, b) => {
    const slot = b.closest('[data-meal]').dataset.meal; const d = dayDoc(date); const set = new Set(d.locked || []);
    set.has(slot) ? set.delete(slot) : set.add(slot);
    await save('PUT', '/api/days/' + date, { locked: [...set] }); await redraw();
  });
  on(el, '[data-mact]', 'click', async (e, b) => {
    const slot = b.closest('[data-meal]').dataset.meal; const es = entriesOn(date).filter(x => x.meal === slot); const a = b.dataset.mact;
    if (a === 'add') return openFoodPicker({ date, meal: slot, onAdded: () => draw() });
    if (a === 'suggest') return openSuggest(date, slot, () => draw());
    if (a === 'planned') { for (const x of es.filter(x => x.status === 'eaten')) await save('PUT', '/api/entries/' + x.id, { status: 'planned' }); await redraw(); return toast('סומן כמתוכנן — לא נספר כנאכל'); }
    if (a === 'eaten') return openEaten(date, slot, () => draw());
    if (a === 'edit') return openEditAmounts(date, slot, () => draw());
    if (a === 'fixed') {
      const name = prompt('שם לארוחה הקבועה', slots(date).find(s => s.id === slot)?.label || ''); if (!name) return;
      await save('PUT', '/api/fixed-meals', { name, items: es.map(x => ({ foodId: x.foodId, grams: x.status === 'eaten' ? x.grams : (x.plannedGrams || x.grams), unit: x.unit, qty: x.qty, comp: x.comp, ...(x.snapshot?.src === 'manual' ? { manual: { name: x.snapshot.n, k: x.snapshot.k, p: x.snapshot.p, c: x.snapshot.c, f: x.snapshot.f, per: x.snapshot.pp ? 'portion' : '100g', unitName: x.snapshot.u?.[0]?.[0], unitGrams: x.snapshot.pp ? null : x.snapshot.u?.[0]?.[1] } } : {}) })) });
      await refresh(); toast('נשמרה ארוחה קבועה');
    }
  });
  on(el, '[data-entry]', 'click', (e, li) => openItem(D.state.entries.find(x => x.id === li.dataset.entry), () => draw()));
}

function openWaterSettings(date, done) {
  const p = profile(date) || {}; const w = [...D.state.weights].filter(x => x.date <= date).pop()?.kg;
  const s = openSheet({ title: 'מים — הגדרות', body: `<label class="field"><span>גודל כוס (מ״ל)</span><input class="in" id="wcup" inputmode="numeric" value="${+p.cupMl || CUP_ML}"></label>
    <label class="field"><span>יעד יומי (מ״ל)</span><input class="in" id="wgoal" inputmode="numeric" value="${waterGoalMl(p, w)}"></label>
    <p class="tiny muted">ברירת המחדל: 33 מ״ל לכל ק״ג משקל, ולפחות 2 ליטר. ביום חם או ביום אימון כדאי יותר.</p>`, foot: '<button class="btn" data-ok>שמור</button>' });
  on(s.el, '[data-ok]', 'click', async () => {
    const cup = +$('#wcup', s.el).value, goal = +$('#wgoal', s.el).value;
    if (!(cup >= 50 && cup <= 1500) || !(goal >= 500 && goal <= 10000)) return toast('ערכים לא סבירים');
    await save('PUT', '/api/profile', { profile: { ...D.state.profile, cupMl: cup, waterGoalMl: goal } }); s.close(); toast('נשמר'); done();
  });
}

/** "אכלתי": אישור הכמות שנאכלה בפועל לכל פריט (ברירת מחדל: מה שתוכנן) */
function openEaten(date, slot, done) {
  const es = entriesOn(date).filter(x => x.meal === slot);
  const s = openSheet({ title: 'אכלתי — כמה בפועל?', body: `<p class="small muted">אם אכלת פחות או יותר ממה שתכננת, תקן כאן. נספר רק מה שתאשר.</p>
    <ul class="list">${es.map(x => { const f = foodOf(x); return `<li class="li"><div class="m"><b>${esc(COMPONENTS[x.comp]?.name || f.n)}</b><small>תוכנן: ${esc(qtyText(f, x.plannedGrams || x.grams, x.unit, x.qty))}</small></div><input class="in" style="width:96px" data-eg="${x.id}" inputmode="decimal" value="${n0(x.status === 'eaten' ? x.grams : (x.plannedGrams || x.grams))}" aria-label="גרמים שנאכלו"><span class="small">ג׳</span></li>`; }).join('')}</ul><div id="eatp" class="note ok"></div>`,
    foot: '<button class="btn" data-ok>אישור — אכלתי</button>' });
  const upd = () => { let k = 0, p = 0; $$('[data-eg]', s.el).forEach(i => { const x = es.find(y => y.id === i.dataset.eg); const n = nutrients(foodOf(x), +i.value.replace(',', '.') || 0); k += n.kcal; p += n.protein; }); $('#eatp', s.el).innerHTML = `ייספר: <b>${n0(k)}</b> קק״ל · <b>${n1(p)}</b> ג׳ חלבון`; };
  s.el.addEventListener('input', upd); upd();
  on(s.el, '[data-ok]', 'click', async () => {
    for (const i of $$('[data-eg]', s.el)) { const g = +i.value.replace(',', '.'); if (g > 0) await save('PUT', '/api/entries/' + i.dataset.eg, { status: 'eaten', eatenGrams: g }); else await del('/api/entries/' + i.dataset.eg); }
    await refresh(); s.close(); toast('נרשם. היתרה וההצעה הבאה עודכנו'); done();
  });
}
function openEditAmounts(date, slot, done) {
  const es = entriesOn(date).filter(x => x.meal === slot);
  const s = openSheet({ title: 'ערוך כמות', body: `<ul class="list">${es.map(x => { const f = foodOf(x); return `<li class="li"><div class="m"><b>${esc(COMPONENTS[x.comp]?.name || f.n)}</b><small>${x.status === 'eaten' ? 'נאכל' : 'מתוכנן'} · ${esc(qtyText(f, x.grams, x.unit, x.qty))}</small></div><input class="in" style="width:96px" data-g="${x.id}" inputmode="decimal" value="${n0(x.grams)}"><span class="small">ג׳</span></li>`; }).join('')}</ul><div id="edp" class="note"></div>`, foot: '<button class="btn" data-ok>שמור כמויות</button>' });
  const upd = () => { let k = 0, p = 0; $$('[data-g]', s.el).forEach(i => { const x = es.find(y => y.id === i.dataset.g); const n = nutrients(foodOf(x), +i.value.replace(',', '.') || 0); k += n.kcal; p += n.protein; }); $('#edp', s.el).innerHTML = `סה״כ בארוחה: <b>${n0(k)}</b> קק״ל · <b>${n1(p)}</b> ג׳ חלבון`; };
  s.el.addEventListener('input', upd); upd();
  on(s.el, '[data-ok]', 'click', async () => {
    for (const i of $$('[data-g]', s.el)) { const x = es.find(y => y.id === i.dataset.g); const g = +i.value.replace(',', '.'); if (g > 0 && Math.abs(g - x.grams) > 0.05) await save('PUT', '/api/entries/' + x.id, { grams: g, unit: 'g', qty: null }); }
    await refresh(); s.close(); toast('הכמויות עודכנו'); done();
  });
}

function openItem(e, done) {
  const f = foodOf(e); const n = nutrients(f, e.grams);
  const s = openSheet({ title: COMPONENTS[e.comp]?.name || f.n, body: `<div class="small muted">${esc(f.n)}</div>
    <dl class="kv" style="margin-top:10px"><dt>כמות</dt><dd>${esc(qtyText(f, e.grams, e.unit, e.qty))}</dd>${e.plannedGrams ? `<dt>תוכנן</dt><dd>${n0(e.plannedGrams)} ג׳</dd>` : ''}${e.status === 'eaten' ? `<dt>נאכל</dt><dd>${n0(e.grams)} ג׳</dd>` : ''}<dt>קלוריות</dt><dd>${n0(n.kcal)}</dd><dt>חלבון</dt><dd>${n1(n.protein)} ג׳</dd><dt>פחמימות</dt><dd>${n1(n.carbs)} ג׳</dd><dt>שומן</dt><dd>${n1(n.fat)} ג׳</dd><dt>מצב</dt><dd>${e.status === 'eaten' ? 'אכלתי' : 'תכננתי'}</dd></dl>
    ${f.st ? `<p class="small">${esc(STATE[f.st].label)}</p>` : ''}<p class="saved">נשמר: ${esc(savedAt(e.updatedAt))} · <a href="#" data-hist>היסטוריה</a></p><div id="hist"></div>`,
    foot: `<button class="btn ${e.status === 'eaten' ? 'plain' : ''}" data-st="${e.status === 'eaten' ? 'planned' : 'eaten'}">${e.status === 'eaten' ? 'תכננתי' : 'אכלתי'}</button><button class="btn plain" data-edit>ערוך כמות</button><button class="btn plain" data-swap>החלף</button><button class="iconbtn" data-del aria-label="מחק">🗑</button>` });
  on(s.el, '[data-st]', 'click', async (ev, b) => { if (b.dataset.st === 'eaten') { s.close(); return openEaten(e.date, e.meal, done); } await save('PUT', '/api/entries/' + e.id, { status: 'planned' }); await refresh(); s.close(); done(); });
  on(s.el, '[data-edit]', 'click', () => { s.close(); openFoodDetail(f, { entry: e, onDone: done }); });
  on(s.el, '[data-swap]', 'click', () => { s.close(); openSwap(e, done); });
  on(s.el, '[data-del]', 'click', async () => { await del('/api/entries/' + e.id); await refresh(); s.close(); toast('הפריט הוסר'); done(); });
  on(s.el, '[data-hist]', 'click', async ev => { ev.preventDefault(); const h = await get('/api/entries/' + e.id + '/history'); $('#hist', s.el).innerHTML = `<ul class="list">${h.map(x => `<li class="li"><div class="m"><b>${x.action === 'create' ? 'נוצר' : x.action === 'status' ? 'שינוי מצב' : 'עדכון'}</b><small>${x.after ? `${n0(x.after.grams)} ג׳ · ${x.after.status === 'eaten' ? 'אכלתי' : 'תכננתי'}` : 'נמחק'}</small></div><div class="a tiny">${esc(savedAt(x.at))}</div></li>`).join('')}</ul>`; });
}

/** החלפת רכיב אחד בלי לבנות מחדש את היום — מציג מיד מה משתנה */
function openSwap(e, done) {
  const of = foodOf(e); const old = nutrients(of, e.grams);
  const date = e.date; const tgt = targetOn(date); const tot = dayTotals(date);
  const mealEs = entriesOn(date).filter(x => x.meal === e.meal);
  const mealOld = mealEs.reduce((a, x) => { const n = nutrients(foodOf(x), x.grams); a.k += n.kcal; a.p += n.protein; return a; }, { k: 0, p: 0 });
  const comp = e.comp && COMPONENTS[e.comp] ? e.comp : null;
  const cands = comp ? swapCandidates(comp, profile(date)).map(k => ({ k, ...swapItem({ ...e, comp }, k, D.foods) })) : [];
  const counted = e.status === 'eaten';
  const s = openSheet({ title: `החלפת ${COMPONENTS[comp]?.name || of.n}`, body: `
    <p class="small muted">עכשיו: ${esc(qtyText(of, e.grams, e.unit, e.qty))} · ${n0(old.kcal)} קק״ל · ${n1(old.protein)} ג׳ חלבון. ${comp && COMPONENTS[comp].role === 'protein' ? 'מקור חלבון מוחלף לפי כמות החלבון.' : 'הכמות מותאמת לפי הקלוריות.'}</p>
    ${cands.length ? `<ul class="list">${cands.map(c => `<li class="li" data-k="${c.k}"><div class="m"><b>${esc(COMPONENTS[c.k].name)}</b><small>${esc(qtyText(food(c.item.foodId), c.item.grams, c.item.unit, c.item.qty))}${c.item.approx ? ' · ' + esc(c.item.approx) : ''}</small></div><div class="a"><span class="num">${c.delta.kcal >= 0 ? '+' : '−'}${Math.abs(c.delta.kcal)}</span> קק״ל<br><span class="num">${c.delta.protein >= 0 ? '+' : '−'}${Math.abs(c.delta.protein)}</span> ג׳ חלבון</div></li>`).join('')}</ul>` : ''}
    <button class="btn block plain" data-any style="margin-top:10px">חיפוש מזון אחר מהמאגר</button><div id="chg"></div>` });
  const showChange = (item) => {
    const mk = mealOld.k - old.kcal + item.kcal; const mp = mealOld.p - old.protein + item.protein;
    const remK = tgt ? tgt.kcal - (tot.eaten.kcal - (counted ? old.kcal - item.kcal : 0)) : null;
    return `<div class="note ok" style="margin-top:12px"><b>מה ישתנה</b><br>הארוחה: ${n0(mealOld.k)} → <b>${n0(mk)}</b> קק״ל · ${n0(mealOld.p)} → <b>${n0(mp)}</b> ג׳ חלבון${counted && tgt ? `<br>נשאר להיום: <b>${n0(remK)}</b> קק״ל` : '<br>הפריט מתוכנן, ולכן היתרה תשתנה רק אחרי "אכלתי".'}</div>`;
  };
  const apply = async (patch, item) => {
    await save('PUT', '/api/entries/' + e.id, patch);
    await refresh(); s.close();
    openSheet({ title: 'הוחלף', body: showChange(item), foot: '<button class="btn" data-x>סגור</button>' });
    done();
  };
  on(s.el, '[data-k]', 'click', (ev, li) => { const c = cands.find(x => x.k === li.dataset.k); apply({ foodId: c.item.foodId, comp: c.k, grams: c.item.grams, unit: c.item.unit, qty: c.item.qty }, c.item); });
  on(s.el, '[data-any]', 'click', () => openFoodPicker({ title: 'במה להחליף?', onPick: nf => {
    const byP = old.protein >= 10 && nf.p >= 8;
    const g = Math.max(10, Math.round((byP ? old.protein / (nf.p / 100) : old.kcal / (nf.k / 100 || 1)) / 10) * 10);
    const item = { ...nutrients(nf, g) };
    apply({ foodId: nf.id, grams: g, unit: 'g', qty: null }, item);
  } }));
}

// ---- הצעות: כרטיסי ארוחה עם החלפת רכיב ----
const amtText = i => { const f = D.foods.get(i.foodId); const a = f && i.qty ? qtyText(f, i.grams, i.unit, i.qty) : `${n0(i.grams)} גרם${i.approx ? ` (${i.approx})` : ''}`; return a; };
const stText = i => !i.st || !STATE[i.st] ? '' : i.st === 'cooked' ? `${/אפוי|בתנור/.test(i.name) ? 'אפוי' : 'מבושל'} — משקל אחרי הכנה` : i.st === 'raw' || i.st === 'dry' ? `${STATE[i.st].short} — משקל לפני בישול` : STATE[i.st].short;
const macroLine = x => `${n0(x.kcal)} קק״ל · ח ${n1(x.protein)} · פ ${n1(x.carbs)} · ש ${n1(x.fat)}`;
const amtLine = i => `${esc(amtText(i))}${stText(i) ? ` · ${esc(stText(i))}` : ''}`;
const GROUP_TAG = { poultry: '🍗 עוף', fish: '🐟 דג', beef: '🥩 בקר רזה', egg: '🥚 ביצים', dairy: '🥛 חלבי', plant: '🌱 צמחי' };
const ALT_LABEL = { poultry: '🍗 מנת עוף', fish: '🐟 מנת דג', beef: '🥩 מנת בקר' };

const swapNotes = o => (o.why || []).filter(w => /^הוחלף|הוצא מהמנה/.test(w));
/** כרטיס ארוחה. key — מזהה הכרטיס בחלון (למשל "d0" ביום שלם, "s1" בהצעות). ui = { open: מספר הפריט שפתוח להחלפה, more, choices } */
export function suggestionHtml(o, key, ui = {}, { addLabel = 'הוסף לתכנון', alts = null, altIdx = 0, swap = true } = {}) {
  return `<div class="sugg" data-opt="${key}">
    ${alts ? `<div class="seg" style="margin-bottom:8px">${alts.map((a, i) => `<button type="button" data-alt="${key}|${i}" class="${i === altIdx ? 'on' : ''}">${ALT_LABEL[famGroup(a.fam)] || esc(a.name)}</button>`).join('')}</div>` : ''}
    <div class="hd"><b data-name class="dish">${esc(o.name)}</b></div>
    ${o.desc ? `<p class="desc">${esc(o.desc)}</p>` : ''}
    <ul class="sitems">${o.items.map((i, j) => `<li class="si"><div class="m"><b>${esc(i.name)}</b><small>${amtLine(i)}<br>${macroLine(i)}</small></div>${swap && SWAP_LABEL[i.role] ? `<button type="button" class="btn xs soft swb" data-sw="${key}|${j}" aria-expanded="${ui.open === j}">${SWAP_LABEL[i.role]}</button>` : ''}</li>
      ${ui.open === j ? swapPanel(key, j, ui, o) : ''}`).join('')}</ul>
    <div class="tot"><b class="num">${n0(o.totals.kcal)}</b> קק״ל · <b class="num">${n0(o.totals.protein)}</b> ג׳ חלבון · ${n0(o.totals.carbs)} ג׳ פחמימה · ${n0(o.totals.fat)} ג׳ שומן · ${n0(o.totals.fiber)} ג׳ סיבים</div>
    ${o.prep || o.steps?.length ? `<details class="howto" ${o.steps?.length ? 'open' : ''}><summary>⏱ ${o.prep ? `${o.prep} דקות` : ''}${o.steps?.length ? ' · איך מכינים' : ''}</summary>${o.steps?.length ? `<ol>${o.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</details>` : ''}
    ${swapNotes(o).length ? `<div class="why">${swapNotes(o).map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
    <div class="row" style="gap:8px">${swap ? `<button type="button" class="btn sm soft" data-other="${key}">🔄 הצע מנה אחרת</button>` : ''}<button class="btn block sm" style="flex:1" data-addopt="${key}">${addLabel}</button></div></div>`;
}
function choiceHtml(key, j, c, o) {
  const meal = `<span class="aft">הארוחה אחרי ההחלפה: ${macroLine(c.meal)}${c.meal.kcal !== o.totals.kcal ? ` — ${c.meal.kcal > o.totals.kcal ? 'עוד' : 'פחות'} ${Math.abs(c.meal.kcal - o.totals.kcal)} קק״ל` : ''}</span>`;
  const tag = c.group && GROUP_TAG[c.group] ? `<span class="gtag">${GROUP_TAG[c.group]}</span>` : '';
  if (c.variants?.length > 1) return `<div class="swo eggs" data-group="${c.group}">${tag}<b>ביצים — בחר צורת הכנה</b>
    <div class="row wrap" style="gap:6px;margin-top:6px">${c.variants.map(v => `<button type="button" class="btn xs soft" data-pick="${key}|${j}|${esc(v.key)}" title="${esc(v.item.name)}">${esc(v.label)} · ${esc(amtText(v.item))} · ${n0(v.item.kcal)} קק״ל</button>`).join('')}</div>
    <small>${macroLine(c.item)} (${esc(c.variants[0].label)})<br>${meal}</small></div>`;
  return `<button type="button" class="swo" role="option" data-group="${c.group || ''}" data-pick="${key}|${j}|${esc(c.key)}">${tag}<b>${esc(c.item.name)}</b><small>${amtLine(c.item)}<br>${macroLine(c.item)}${c.note ? `<br><span class="warn">${esc(c.note)}</span>` : ''}<br>${meal}</small></button>`;
}
function swapPanel(key, j, ui, o) {
  const N = 6; const list = ui.more ? ui.choices : ui.choices.slice(0, N);
  return `<li class="swp" role="listbox" aria-label="תחליפים">${list.length ? list.map(c => choiceHtml(key, j, c, o)).join('') : '<div class="small muted">אין תחליף מתאים מהרשימה — אפשר לחפש במאגר.</div>'}
    <div class="row" style="gap:6px;margin-top:6px">${!ui.more && ui.choices.length > N ? `<button type="button" class="btn xs plain grow" data-more="${key}">הצג עוד (${ui.choices.length - N})</button>` : ''}<button type="button" class="btn xs plain grow" data-db="${key}|${j}">חיפוש במאגר</button><button type="button" class="btn xs plain" data-swclose="${key}">סגור</button></div></li>`;
}
/** על מה מבוססת הבחירה — מקורות שאפשר לפתוח */
export async function plannerSourcesHtml() {
  const { sourcesHtml } = await import('./targets.js');
  return `<details class="how" style="margin-top:10px"><summary>על מה מבוססת הבחירה?</summary>${sourcesHtml(PLANNER_SOURCES)}</details>`;
}
/**
 * החלפות בתוך כרטיסים: cards = Map(key → { opt, slot, alts?, altIdx?, seen }). אחרי כל בחירה — שם, רכיבים וסיכומים מחושבים מחדש (redraw).
 * other(key) — מנה חדשה לאותה ארוחה ("הצע מנה אחרת"); dayFams(key) — מקורות החלבון של שאר היום.
 */
function bindSwaps(root, cards, { date, redraw, other, dayFams }) {
  const ui = new Map(); // key → { open, more, choices }
  const setOpt = (c, o) => { c.opt = o; if (c.alts) c.alts[c.altIdx] = o; };
  on(root, '[data-sw]', 'click', (e, b) => {
    const [key, j] = b.dataset.sw.split('|'); const c = cards.get(key); const u = ui.get(key);
    if (u?.open === +j) { ui.delete(key); return redraw(); }
    const fc = familyContext({ entries: D.state.entries, foods: D.foods, date, slot: c.slot });
    ui.set(key, { open: +j, more: false, choices: swapChoices(c.opt, +j, { foods: D.foods, profile: profile(date), dayFams: dayFams(key), weekFams: fc.weekFams }) }); redraw();
  });
  on(root, '[data-more]', 'click', (e, b) => { ui.get(b.dataset.more).more = true; redraw(); });
  on(root, '[data-swclose]', 'click', (e, b) => { ui.delete(b.dataset.swclose); redraw(); });
  on(root, '[data-pick]', 'click', (e, b) => {
    const [key, j, ck] = b.dataset.pick.split('|'); const c = cards.get(key);
    const ch = ui.get(key).choices.flatMap(x => [x, ...(x.variants || [])]).find(x => x.key === ck);
    setOpt(c, applySwap(c.opt, +j, ch.item, { drop: ch.drops || [] })); ui.delete(key); redraw();
  });
  on(root, '[data-db]', 'click', (e, b) => {
    const [key, j] = b.dataset.db.split('|'); const c = cards.get(key); const old = c.opt.items[+j];
    openFoodPicker({ title: SWAP_LABEL[old.role] + ' — חיפוש במאגר', onPick: f => { setOpt(c, applySwap(c.opt, +j, substituteFood(old, f))); ui.delete(key); redraw(); } });
  });
  on(root, '[data-alt]', 'click', (e, b) => { const [key, i] = b.dataset.alt.split('|'); const c = cards.get(key); c.altIdx = +i; c.opt = c.alts[+i]; ui.delete(key); redraw(); });
  on(root, '[data-other]', 'click', (e, b) => {
    const key = b.dataset.other; const c = cards.get(key); c.seen.add(c.opt.templateId);
    let o = other(key, c.seen);
    if (!o) { c.seen.clear(); c.seen.add(c.opt.templateId); o = other(key, c.seen); } // עברנו על כל המנות — מתחילים סבב חדש
    if (!o) return toast('אין מנה נוספת שמתאימה ליעד');
    c.alts = null; c.opt = o; ui.delete(key); redraw();
  });
  return ui;
}

/** "הצע מנה אחרת" למנת העוף/הדג היחידה ביום: גם החלופה מאותן קבוצות (העדפת הפרופיל) */
function keepGroup(opt, otherFams, p) {
  const req = requiredGroups(p, D.foods); const g = famGroup(opt.fam);
  if (!req.includes(g) || otherFams.some(f => req.includes(famGroup(f)))) return {};
  return { wantGroup: req, strict: true };
}
const PREF_MAIN = [['poultry', '🍗 עוף'], ['fish', '🐟 דג'], ['beef', '🥩 בקר רזה']];
const PREF_NO = [['tofu', 'טופו'], ['legumes', 'קטניות כמנה עיקרית'], ['egg', 'ביצים כמנה עיקרית'], ['turkeyDeli', 'נקניק ופסטרמה']];
/** העדפות התפריט — נשמרות בפרופיל: "בכל יום לפחות מנה אחת של…" ו"לא להציע לי" */
function menuPrefsHtml() {
  const mp = baseProfile()?.menuPrefs || {}; const dm = mp.dailyMain ?? ['poultry', 'fish']; const no = mp.noAuto || [];
  return `<details class="how" id="mprefs"><summary>⚙️ העדפות התפריט שלי</summary>
    <p class="small" style="margin:8px 0 4px">בכל יום לפחות מנה עיקרית אחת של:</p><div class="chips">${PREF_MAIN.map(([k, l]) => `<button type="button" class="chip ${dm.includes(k) ? 'on' : ''}" data-dm="${k}">${l}</button>`).join('')}</div>
    <p class="small" style="margin:10px 0 4px">לא להציע לי אוטומטית:</p><div class="chips">${PREF_NO.map(([k, l]) => `<button type="button" class="chip ${no.includes(k) ? 'on' : ''}" data-no="${k}">${l}</button>`).join('')}</div>
    <button type="button" class="btn sm" style="margin-top:10px" data-saveprefs>שמור ובנה מחדש</button></details>`;
}
function bindMenuPrefs(root, onSaved) {
  on(root, '[data-dm],[data-no]', 'click', (e, b) => b.classList.toggle('on'));
  on(root, '[data-saveprefs]', 'click', async () => {
    const menuPrefs = { dailyMain: $$('[data-dm].on', root).map(x => x.dataset.dm), noAuto: $$('[data-no].on', root).map(x => x.dataset.no) };
    await save('PUT', '/api/profile', { profile: { ...(baseProfile() || {}), menuPrefs } }); await refresh(); toast('העדפות התפריט נשמרו בפרופיל'); onSaved();
  });
}

export async function addOption(date, slot, o, { replace } = {}) {
  const existing = entriesOn(date).filter(e => e.meal === slot && e.status !== 'eaten');
  if (existing.length && replace === undefined) {
    replace = await confirmSheet('יש כבר תכנון לארוחה', `<p>בארוחה הזו כבר מתוכננים ${existing.length} פריטים. להחליף אותם בהצעה?</p>`, 'החלף', 'הוסף בנוסף');
  }
  if (replace) for (const x of existing) await del('/api/entries/' + x.id);
  await save('POST', '/api/entries', { entries: o.items.map((i, k) => ({ date, meal: slot, foodId: i.foodId, grams: i.grams, unit: i.unit, qty: i.qty, comp: i.comp, status: 'planned', source: 'suggestion', ...(o.templateId && o.templateId !== 'pantry' ? { recipe: o.templateId } : {}), order: Date.now() + k })) });
  await refresh();
}

async function openSuggest(date, slot, done) {
  await D.worldReady; // חלק מהרכיבים (קציצות הודו, בקר רזה, סינטה) מגיעים ממאגרי USDA/CoFID שנטענים ברקע
  const p = profile(date); const tgt = targetOn(date);
  if (!tgt) return toast('אין יעד יומי — סיים את השאלון');
  const label = slots(date).find(s => s.id === slot)?.label || '';
  let pantry = ''; let noCook = false; let b = null; let pk = null; let fc = null; let base = null; let lastMainNote = '';
  const cards = new Map();
  const s = openSheet({ title: `הצעות ל${label}`, body: '<div id="sg"></div>' });
  const draw = () => {
    const opts = [...cards.entries()];
    $('#sg', s.el).innerHTML = `<div class="note">נשארו להיום: <b>${n0(b.remain.kcal)}</b> קק״ל, <b>${n0(b.remain.protein)}</b> ג׳ חלבון. לארוחה הזו: כ-<b>${n0(b.kcal)}</b> קק״ל ו-<b>${n0(b.protein)}</b> ג׳ חלבון.</div>${lastMainNote ? `<div class="note ok" style="margin-top:8px">${esc(lastMainNote)}</div>` : ''}
      <form id="pf" class="row" style="margin:10px 0"><input class="in grow" id="pt" value="${esc(pantry)}" placeholder="יש לי בבית… (ביצים, קוטג׳, פיתה)"><button class="btn sm">מה אפשר?</button></form>
      <label class="row small" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="nc" ${noCook ? 'checked' : ''} style="width:22px;height:22px"> בלי לבשל</label>
      ${pk ? `<p class="small">זיהיתי: ${pk.map(k => esc(COMPONENTS[k].name)).join(', ') || '—'}</p>` : ''}
      ${opts.length ? opts.map(([k, c]) => suggestionHtml(c.opt, k, ui.get(k))).join('') : '<div class="empty-state">לא מצאתי הצעה שמתאימה. נסה בלי סינון או הוסף מוצרים.</div>'}
      <p class="tiny muted">"החלף חלבון" שומר את התוספות ומחשב כמות שנותנת חלבון דומה. "הצע מנה אחרת" מחליף את כל הארוחה במתכון אחר שמתאים ליעד.</p>`;
    $('#pf', s.el).onsubmit = e => { e.preventDefault(); pantry = $('#pt', s.el).value.trim(); run(); };
    $('#nc', s.el).onchange = e => { noCook = e.target.checked; run(); };
  };
  const run = () => {
    const entries = entriesOn(date);
    b = budgetForSlot({ profile: p, target: tgt, entries, foods: D.foods, slot });
    pk = pantry ? componentsInText(pantry) : null;
    fc = familyContext({ entries: D.state.entries, foods: D.foods, date, slot });
    base = { foods: D.foods, slot, profile: p, maxPrep: noCook ? 5 : +p.prepMinutes || 0, recent: recentComps(date), pantry: pk, noCook, anySlot: !!pk, ...fc, ...recipeContext({ entries: D.state.entries, date, slot }) };
    // הארוחה העיקרית האחרונה של היום ועדיין אין עוף או דג (לא נאכל ולא מתוכנן) — מציעים אותם עכשיו
    const req = requiredGroups(p, D.foods); const order = slots(date).map(x => x.id);
    const laterMain = order.slice(order.indexOf(slot) + 1).some(id => ['lunch', 'dinner'].includes(id) && !entries.some(e => e.meal === id));
    lastMainNote = '';
    if (!pk && ['lunch', 'dinner'].includes(slot) && req.length && !laterMain && ![...fc.dayFams.keys()].some(f => req.includes(famGroup(f)))) {
      Object.assign(base, { wantGroup: req, strict: true });
      lastMainNote = `עוד לא היה היום ${req.map(g => g === 'poultry' ? 'עוף' : g === 'fish' ? 'דג' : 'בקר').join(' או ')} — אלה ההצעות לארוחה העיקרית האחרונה.`;
    }
    const opts = suggestMeals({ ...base, diverse: true }, b, 3);
    cards.clear(); ui.clear(); opts.forEach((o, i) => cards.set('s' + i, { opt: o, slot, seen: new Set() }));
    draw();
  };
  const ui = bindSwaps(s.el, cards, {
    date, redraw: draw, dayFams: () => fc.dayFams,
    other: (key, seen) => { const c = cards.get(key); return otherMeal({ ...base, avoidMethod: c.opt.method, avoidSauce: c.opt.sauce, ...(base.strict ? {} : keepGroup(c.opt, [...fc.dayFams.keys()], p)) }, b, new Set([...seen, ...[...cards.entries()].filter(([k]) => k !== key).map(([, x]) => x.opt.templateId)])); },
  });
  on(s.el, '[data-addopt]', 'click', async (e, bt) => { await addOption(date, slot, cards.get(bt.dataset.addopt).opt); s.close(); toast('נוסף לתכנון. סמן "אכלתי" אחרי הארוחה'); done(); });
  run();
}

async function openPlanDay(date, done) {
  await D.worldReady;
  const p = profile(date); const tgt = targetOn(date);
  if (!tgt) return toast('אין יעד יומי — סיים את השאלון');
  const day = dayDoc(date);
  const plan = planDay({ profile: p, target: tgt, foods: D.foods, entries: entriesOn(date), history: D.state.entries, date, locked: day.locked || [], recent: recentComps(date), maxPrep: +p.prepMinutes || 0 });
  const keep = slots(date).filter(s => !plan.some(x => x.slot === s.id));
  const keptEntries = entriesOn(date).filter(e => keep.some(s => s.id === e.meal));
  const kept = keptEntries.reduce((a, e) => { const n = nutrients(foodOf(e), e.grams); a.k += n.kcal; a.p += n.protein; a.c += n.carbs; a.f += n.fat; return a; }, { k: 0, p: 0, c: 0, f: 0 });
  const cards = new Map(plan.map((x, i) => ['d' + i, { opt: x.option, slot: x.slot, budget: x.budget, alts: x.alts ? [...x.alts] : null, altIdx: 0, seen: new Set() }]));
  const s = openSheet({ title: 'יום שלם', body: '<div id="pdb"></div>', foot: plan.length ? '<button class="btn" data-all>הוסף את כל היום לתכנון</button>' : '' });
  const added = new Set();
  const draw = () => {
    const sum = [...cards.values()].reduce((a, c) => { a.k += c.opt.totals.kcal; a.p += c.opt.totals.protein; a.c += c.opt.totals.carbs; a.f += c.opt.totals.fat; return a; }, { ...kept });
    $('#pdb', s.el).innerHTML = `${menuPrefsHtml()}${keep.length ? `<div class="note">נשארות כמו שהן (נעולות או נאכלו): ${keep.map(k => esc(k.label)).join(', ')}</div>` : ''}
      ${plan.length ? [...cards.entries()].map(([key, c]) => `<h3 style="margin-top:14px">${esc(slots(date).find(x => x.id === c.slot)?.label)}</h3>${c.alts ? '<div class="small muted">יש ארוחה עיקרית אחת היום — בחר מה מתחשק:</div>' : ''}${suggestionHtml(c.opt, key, ui.get(key), { alts: c.alts, altIdx: c.altIdx, addLabel: added.has(key) ? 'נוסף ✓ — לחץ שוב לעדכון' : 'הוסף לתכנון' })}`).join('') : '<div class="empty-state">כל הארוחות נעולות או נאכלו.</div>'}
      <div class="card tight" style="margin-top:12px" id="daysum">סה״כ ביום: <b>${n0(sum.k)}</b> / ${tgt.kcal} קק״ל · <b>${n0(sum.p)}</b> / ${tgt.protein} ג׳ חלבון · ${n0(sum.c)} ג׳ פחמימה · ${n0(sum.f)} ג׳ שומן</div>`;
  };
  // מקורות החלבון של שאר היום: ארוחות שנשארות + שאר הכרטיסים (אחרי עוף בצהריים — דג או בקר בערב)
  const dayFams = key => {
    const m = new Map(familyContext({ entries: keptEntries, foods: D.foods, date, slot: null }).dayFams);
    for (const [k, c] of cards) if (k !== key && c.opt.fam) m.set(c.opt.fam, (m.get(c.opt.fam) || 0) + 1);
    return m;
  };
  const ui = bindSwaps(s.el, cards, {
    date, redraw: draw, dayFams,
    other: (key, seen) => { const c = cards.get(key); const fc = familyContext({ entries: D.state.entries, foods: D.foods, date, slot: c.slot });
      const dayT = new Set([...cards.entries()].filter(([k]) => k !== key).map(([, x]) => x.opt.templateId));
      const rc = recipeContext({ entries: D.state.entries.filter(e => e.date !== date), date, slot: c.slot });
      return otherMeal({ foods: D.foods, slot: c.slot, profile: p, maxPrep: +p.prepMinutes || 0, recent: recentComps(date), dayFams: dayFams(key), weekFams: fc.weekFams, ...rc, dayT, avoidMethod: c.opt.method, avoidSauce: c.opt.sauce, ...keepGroup(c.opt, [...dayFams(key).keys()], p) }, c.budget, new Set([...seen, ...dayT])); },
  });
  bindMenuPrefs(s.el, () => { s.close(); openPlanDay(date, done); });
  // כל ארוחה נשמרת פעם אחת: הוספה (או הוספה חוזרת) מחליפה את מה שתוכנן לאותה ארוחה
  on(s.el, '[data-addopt]', 'click', async (e, b) => { const c = cards.get(b.dataset.addopt); await addOption(date, c.slot, c.opt, { replace: true }); added.add(b.dataset.addopt); draw(); done(); });
  on(s.el, '[data-all]', 'click', async () => { for (const c of cards.values()) await addOption(date, c.slot, c.opt, { replace: true }); s.close(); toast('היום נבנה. אפשר לשנות כל רכיב'); done(); });
  draw();
}
