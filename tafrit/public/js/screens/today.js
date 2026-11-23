// "היום שלי": סיכום, שקילת בוקר, שלוש פעולות, הארוחות עם תכננתי / אכלתי / ערוך כמות
import { route, go } from '../app.js';
import { D, refresh, profile, planOn, today, food, foodOf, targetOn, slots, entriesOn, dayDoc, dayTotals, recentComps, waterGoalMl, CUP_ML } from '../data.js';
import { TRAIN_BONUS } from '/shared/nutrition.js';
import { save, del, get } from '../api.js';
import { $, $$, esc, n0, n1, kg, toast, openSheet, meter, on, confirmSheet } from '../ui.js';
import { nutrients, qtyText, unitsFor, STATE, isVegFruit } from '/shared/foods.js';
import { suggestMeals, budgetForSlot, planDay, nextSlot, swapItem, swapCandidates } from '/shared/planner.js';
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
  return `<li class="item" data-entry="${e.id}"><div class="nm"><b>${esc(COMPONENTS[e.comp]?.name || f.n)}</b><small>${esc(qtyText(f, e.grams, e.unit, e.qty))}${f.st ? ' · ' + esc(STATE[f.st].short) : ''}${planned}</small></div>
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

// ---- הצעות ----
export function suggestionHtml(o, idx) {
  return `<div class="sugg" data-opt="${idx}"><div class="hd"><b>${esc(o.name)}</b><span class="small muted">${o.prep ? `~${o.prep} דק׳` : ''}</span></div>
    <ul>${o.items.map(i => `<li>${esc(i.name)}: ${i.qty ? `${esc(String(i.qty))} × ` : ''}${n0(i.grams)} ג׳${i.approx ? ` (${esc(i.approx)})` : ''} <span class="muted small">· ${n0(i.kcal)} קק״ל · ${n1(i.protein)} ג׳</span></li>`).join('')}</ul>
    <div class="tot"><b class="num">${n0(o.totals.kcal)}</b> קק״ל · <b class="num">${n0(o.totals.protein)}</b> ג׳ חלבון · ${n0(o.totals.fiber)} ג׳ סיבים${o.totals.vegFruitG ? ` · ${n0(o.totals.vegFruitG)} ג׳ ירקות/פירות` : ''}</div>
    ${o.why?.length ? `<div class="why">${o.why.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
    <button class="btn block sm" data-addopt="${idx}">הוסף לתכנון</button></div>`;
}
export async function addOption(date, slot, o, { replace } = {}) {
  const existing = entriesOn(date).filter(e => e.meal === slot && e.status !== 'eaten');
  if (existing.length && replace === undefined) {
    replace = await confirmSheet('יש כבר תכנון לארוחה', `<p>בארוחה הזו כבר מתוכננים ${existing.length} פריטים. להחליף אותם בהצעה?</p>`, 'החלף', 'הוסף בנוסף');
  }
  if (replace) for (const x of existing) await del('/api/entries/' + x.id);
  await save('POST', '/api/entries', { entries: o.items.map((i, k) => ({ date, meal: slot, foodId: i.foodId, grams: i.grams, unit: i.unit, qty: i.qty, comp: i.comp, status: 'planned', source: 'suggestion', order: Date.now() + k })) });
  await refresh();
}

function openSuggest(date, slot, done) {
  const p = profile(date); const tgt = targetOn(date);
  if (!tgt) return toast('אין יעד יומי — סיים את השאלון');
  const label = slots(date).find(s => s.id === slot)?.label || '';
  let pantry = ''; let noCook = false;
  const s = openSheet({ title: `הצעות ל${label}`, body: '<div id="sg"></div>' });
  const run = () => {
    const entries = entriesOn(date);
    const b = budgetForSlot({ profile: p, target: tgt, entries, foods: D.foods, slot });
    const pk = pantry ? componentsInText(pantry) : null;
    const opts = suggestMeals({ foods: D.foods, slot, profile: p, maxPrep: noCook ? 5 : +p.prepMinutes || 0, recent: recentComps(date), pantry: pk, noCook, anySlot: !!pk }, b, 3);
    $('#sg', s.el).innerHTML = `<div class="note">נשארו להיום: <b>${n0(b.remain.kcal)}</b> קק״ל, <b>${n0(b.remain.protein)}</b> ג׳ חלבון. לארוחה הזו: כ-<b>${n0(b.kcal)}</b> קק״ל ו-<b>${n0(b.protein)}</b> ג׳ חלבון.</div>
      <form id="pf" class="row" style="margin:10px 0"><input class="in grow" id="pt" value="${esc(pantry)}" placeholder="יש לי בבית… (ביצים, קוטג׳, פיתה)"><button class="btn sm">מה אפשר?</button></form>
      <label class="row small" style="gap:8px;margin-bottom:10px"><input type="checkbox" id="nc" ${noCook ? 'checked' : ''} style="width:22px;height:22px"> בלי לבשל</label>
      ${pk ? `<p class="small">זיהיתי: ${pk.map(k => esc(COMPONENTS[k].name)).join(', ') || '—'}</p>` : ''}
      ${opts.length ? opts.map(suggestionHtml).join('') : '<div class="empty-state">לא מצאתי הצעה שמתאימה. נסה בלי סינון או הוסף מוצרים.</div>'}`;
    $('#pf', s.el).onsubmit = e => { e.preventDefault(); pantry = $('#pt', s.el).value.trim(); run(); };
    $('#nc', s.el).onchange = e => { noCook = e.target.checked; run(); };
    s._opts = opts;
  };
  on(s.el, '[data-addopt]', 'click', async (e, b) => { await addOption(date, slot, s._opts[+b.dataset.addopt]); s.close(); toast('נוסף לתכנון. סמן "אכלתי" אחרי הארוחה'); done(); });
  run();
}

function openPlanDay(date, done) {
  const p = profile(date); const tgt = targetOn(date);
  if (!tgt) return toast('אין יעד יומי — סיים את השאלון');
  const day = dayDoc(date);
  const plan = planDay({ profile: p, target: tgt, foods: D.foods, entries: entriesOn(date), locked: day.locked || [], recent: recentComps(date), maxPrep: +p.prepMinutes || 0 });
  const keep = slots(date).filter(s => !plan.some(x => x.slot === s.id));
  const sum = plan.reduce((a, x) => { a.k += x.option.totals.kcal; a.p += x.option.totals.protein; return a; }, { k: 0, p: 0 });
  const kept = entriesOn(date).filter(e => keep.some(s => s.id === e.meal)).reduce((a, e) => { const n = nutrients(foodOf(e), e.grams); a.k += n.kcal; a.p += n.protein; return a; }, { k: 0, p: 0 });
  const s = openSheet({ title: 'יום שלם', body: `${keep.length ? `<div class="note">נשארות כמו שהן (נעולות או נאכלו): ${keep.map(k => esc(k.label)).join(', ')}</div>` : ''}
    ${plan.length ? plan.map((x, i) => `<h3 style="margin-top:14px">${esc(slots(date).find(s => s.id === x.slot)?.label)}</h3>${suggestionHtml(x.option, i)}`).join('') : '<div class="empty-state">כל הארוחות נעולות או נאכלו.</div>'}
    <div class="card tight" style="margin-top:12px">סה״כ ביום: <b>${n0(sum.k + kept.k)}</b> / ${tgt.kcal} קק״ל · <b>${n0(sum.p + kept.p)}</b> / ${tgt.protein} ג׳ חלבון</div>`,
    foot: plan.length ? '<button class="btn" data-all>הוסף את כל היום לתכנון</button>' : '' });
  on(s.el, '[data-addopt]', 'click', async (e, b) => { const x = plan[+b.dataset.addopt]; await addOption(date, x.slot, x.option, { replace: true }); b.disabled = true; b.textContent = 'נוסף ✓'; done(); });
  on(s.el, '[data-all]', 'click', async () => { for (const x of plan) await addOption(date, x.slot, x.option, { replace: true }); s.close(); toast('היום נבנה. אפשר לשנות כל רכיב'); done(); });
}
