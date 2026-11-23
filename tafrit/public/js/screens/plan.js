// "התוכנית שלי", "שינוי מטרה ותוכנית" (אשף) ו"היסטוריית תוכניות"
import { route, go } from '../app.js';
import { D, refresh, profile, baseProfile, planOn, plans, today, baseTargetOn as targetOn, recentComps } from '../data.js';
import { save, del } from '../api.js';
import { $, $$, esc, n0, kg, sign, toast, on, openSheet } from '../ui.js';
import { computeTargets, GOALS, GOAL_HINT, JOB, GENERAL, mealSlots } from '/shared/nutrition.js';
import { pickPlanFields, PLAN_KIND } from '/shared/plans.js';
import { recentWeeks, compareWeeks } from '/shared/weights.js';
import { planDay, suggestMeals } from '/shared/planner.js';
import { COMPONENTS } from '/shared/catalog.js';
import { addDays, dmy, dm } from '/shared/dates.js';
import { sourcesHtml } from './targets.js';
import { suggestionHtml } from './today.js';

/** מצב נוכחי: מטרה, ממוצע השבוע האחרון, מגמה ויעדים */
function currentStatus() {
  const t = today(); const pl = planOn(t); const tgt = targetOn(t);
  const weeks = recentWeeks(D.state.weights, t, 6);
  const done = weeks.filter(w => !w.inProgress && w.n);
  const lastAvg = done[0] || weeks[0];
  const trend = done.slice(0, 4).map((w, i) => ({ w, c: compareWeeks(w, done[i + 1]) })).filter(x => x.c);
  const lw = D.state.weights[D.state.weights.length - 1];
  return { pl, tgt, lastAvg, trend, lw, done };
}
function statusHtml(st) {
  const { pl, tgt, lastAvg, trend, lw, done } = st;
  const basis = lastAvg?.avg ? `ממוצע ${kg(lastAvg.avg)} ק״ג (${esc(lastAvg.label)}, ${dm(lastAvg.start)}–${dm(lastAvg.end)})` : lw ? `אין עדיין ממוצע שבועי — ההערכה מבוססת על שקילה אחת מ-${dmy(lw.date)}: ${kg(lw.kg)} ק״ג` : 'אין שקילות — נבקש משקל בוקר';
  return `<div class="card"><dl class="kv">
    <dt>המטרה הנוכחית</dt><dd>${pl ? esc(GOALS[pl.goal]) : '—'}${pl ? `<div class="tiny muted">מ-${dmy(pl.startDate)}</div>` : ''}</dd>
    <dt>משקל בוקר בשבוע האחרון</dt><dd>${basis}</dd>
    <dt>מגמה בשבועות האחרונים</dt><dd>${trend.length ? trend.map(x => `${sign(x.c.kg)}`).reverse().join(' · ') + ' ק״ג לשבוע' : `<span class="tiny">${done.length < 2 ? 'צריך לפחות שני שבועות עם שקילות' : '—'}</span>`}</dd>
    <dt>יעד יומי</dt><dd>${tgt ? `${tgt.kcal} קק״ל · ${tgt.protein} ג׳ חלבון${tgt.carbs ? ` · ${tgt.carbs} ג׳ פחמימות · ${tgt.fat} ג׳ שומן` : ''}` : '—'}</dd>
    <dt>ארוחות</dt><dd>${profile()?.meals || 3}</dd></dl></div>`;
}

route('plan', async (el) => {
  const st = currentStatus(); const list = [...plans()].reverse(); const t = today();
  el.innerHTML = `<div class="stack"><div class="top"><h1>התוכנית שלי</h1></div>
    ${statusHtml(st)}
    <a class="btn block xl" href="#/plan-change">🎯 שינוי מטרה ותוכנית</a>
    <div class="card"><h3>היסטוריית תוכניות</h3><ul class="list">${list.map(p => `<li class="li" data-plan="${p.id}"><div class="m"><b>${esc(GOALS[p.goal])} ${p.startDate > t ? '<span class="pill">עתידית</span>' : p.startDate <= t && (!p.endDate || p.endDate >= t) ? '<span class="pill st-cooked">פעילה</span>' : ''}</b>
      <small>${dmy(p.startDate)} – ${p.endDate ? dmy(p.endDate) : 'היום'} · ${esc(PLAN_KIND[p.kind] || '')} · ${p.targets?.kcal || '—'} קק״ל · ${p.targets?.protein || '—'} ג׳ חלבון · ${p.settings?.meals || '—'} ארוחות</small></div><div class="a">›</div></li>`).join('') || '<li class="empty-state">עוד אין תוכניות.</li>'}</ul></div>
    <details class="how"><summary>איך נשמרת ההיסטוריה?</summary>${sourcesHtml(['dec_plans'])}</details></div>`;
  on(el, '[data-plan]', 'click', (e, li) => openPlan(D.state.plans.find(p => p.id === li.dataset.plan)));
});

function openPlan(p) {
  const s = openSheet({ title: `${GOALS[p.goal]} · מ-${dmy(p.startDate)}`, body: `<dl class="kv">
    <dt>תקופה</dt><dd>${dmy(p.startDate)} – ${p.endDate ? dmy(p.endDate) : 'פעילה'}</dd><dt>סוג</dt><dd>${esc(PLAN_KIND[p.kind] || p.kind)}</dd>
    <dt>יעד</dt><dd>${p.targets?.kcal} קק״ל · ${p.targets?.protein} ג׳ חלבון</dd>${p.targets?.carbs ? `<dt>פחמימות / שומן</dt><dd>${p.targets.carbs} / ${p.targets.fat} ג׳</dd>` : ''}
    <dt>ארוחות</dt><dd>${p.settings?.meals || '—'}</dd>${p.settings?.weightRange ? `<dt>טווח משקל</dt><dd>${p.settings.weightRange.min}–${p.settings.weightRange.max}</dd>` : ''}${p.settings?.targetWeight ? `<dt>משקל יעד</dt><dd>${p.settings.targetWeight}</dd>` : ''}
    <dt>אימוני כוח</dt><dd>${p.settings?.strength?.perWeek || 0} בשבוע</dd></dl>${p.reason ? `<p class="small muted">${esc(p.reason)}</p>` : ''}
    ${p.sampleDay?.length ? `<h3>יום לדוגמה</h3>${p.sampleDay.map(d => `<div class="small"><b>${esc(d.label || d.slot)}:</b> ${esc(d.name)} · ${d.totals?.kcal || ''} קק״ל</div>`).join('')}` : ''}`,
    foot: `${p.startDate > today() ? '<button class="btn danger" data-cancel>ביטול תוכנית עתידית</button>' : ''}<button class="btn" data-base>השתמש כבסיס לתקופה חדשה</button>` });
  on(s.el, '[data-base]', 'click', () => { s.close(); go('#/plan-change/base/' + p.id); });
  on(s.el, '[data-cancel]', 'click', async () => { await del('/api/plans/' + p.id); await refresh(); s.close(); toast('התוכנית העתידית בוטלה'); go('#/plan'); });
}

// ---- האשף ----
route('plan-change', async (el, [mode, baseId]) => {
  const t = today(); const st = currentStatus();
  const cur = st.pl || { goal: profile()?.goal || 'maintain', settings: pickPlanFields(baseProfile()) };
  const base = mode === 'base' ? D.state.plans.find(p => p.id === baseId) : null;
  const w = { kind: base ? 'goal_change' : null, goal: (base || cur).goal, settings: structuredClone((base || cur).settings || {}), menuMode: 'keep', start: t, startCustom: addDays(t, 7), weightKg: st.lw?.kg || '', step: base ? 2 : 0, basedOn: base?.id || null, preview: null, sample: [], applySample: true };
  const prof = () => ({ ...baseProfile(), ...w.settings, goal: w.goal });
  const curT = st.tgt;

  const steps = [
    // 0: איזה שינוי
    () => `<p class="q">מה תרצה לשנות?</p>${statusHtml(st)}
      <div class="opts" data-opts="kind">
        <button type="button" class="opt ${w.kind === 'goal_change' ? 'on' : ''}" data-v="goal_change"><b>החלפת מטרה</b><small>חיטוב, עלייה במסה, שמירת משקל או שיפור הרכב הגוף</small></button>
        <button type="button" class="opt ${w.kind === 'same_goal' ? 'on' : ''}" data-v="same_goal"><b>בניית תוכנית חדשה לאותה מטרה</b><small>להישאר ב${esc(GOALS[cur.goal])} ולשנות ארוחות, מאכלים או שעות</small></button></div>`,
    // 1: מטרה
    () => w.kind === 'same_goal' ? `<p class="q">המטרה נשארת: ${esc(GOALS[w.goal])}</p><p class="hint">בשלב הבא תעדכן רק את מה שהשתנה.</p>` : `<p class="q">מה המטרה החדשה?</p>
      <div class="opts" data-opts="goal">${Object.keys(GOALS).map(k => `<button type="button" class="opt ${w.goal === k ? 'on' : ''}" data-v="${k}"><b>${esc(GOALS[k])}${k === cur.goal ? ' (הנוכחית)' : ''}</b><small>${esc(GOAL_HINT[k])}</small></button>`).join('')}</div>`,
    // 2: מה השתנה
    () => { const s = w.settings; const slots = mealSlots(s.meals || 3, s.mealTimes);
      return `<p class="q">עדכן רק את מה שהשתנה</p><p class="hint">הערכים הקיימים כבר ממולאים. אלרגיות והגבלות נשמרות: ${esc((baseProfile().allergies || []).join(', ') || 'אין')}${baseProfile().kosher ? ' · כשרות' : ''}.</p>
      <label class="field"><span>משקל בוקר עדכני (ק״ג)</span><input class="in" id="ww" inputmode="decimal" value="${w.weightKg}"></label>
      ${w.goal === 'maintain' ? `<div class="grid2"><label class="field"><span>טווח רצוי: מ-</span><input class="in" id="rmin" inputmode="decimal" value="${s.weightRange?.min ?? ''}"></label><label class="field"><span>עד</span><input class="in" id="rmax" inputmode="decimal" value="${s.weightRange?.max ?? ''}"></label></div>` : ''}
      ${w.goal === 'lose' || w.goal === 'gain' ? `<label class="field"><span>משקל יעד (לא חובה)</span><input class="in" id="tw" inputmode="decimal" value="${s.targetWeight ?? ''}"></label>
        <label class="field"><span>קצב</span><select class="in" id="rate">${(w.goal === 'gain' ? [['slow', 'איטי (+5%)'], ['standard', 'רגיל (+10%)']] : [['slow', 'עדין (0.5% בשבוע)'], ['moderate', 'מתון (0.75%)'], ['fast', 'מהיר (1%)']]).map(([v, l]) => `<option value="${v}" ${s.rate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <div class="grid2"><label class="field"><span>אימוני כוח בשבוע</span><input class="in" id="sp" inputmode="numeric" value="${s.strength?.perWeek ?? 0}"></label><label class="field"><span>אירובי בשבוע</span><input class="in" id="cp" inputmode="numeric" value="${s.cardio?.perWeek ?? 0}"></label></div>
      <label class="field"><span>עבודה / פעילות יומיומית</span><select class="in" id="job">${Object.entries(JOB).map(([k, v]) => `<option value="${k}" ${s.job === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="field"><span>צעדים ביום (אם ידוע)</span><input class="in" id="steps" inputmode="numeric" value="${s.steps ?? ''}"></label>
      <label class="field"><span>מספר ארוחות</span><div class="seg" data-seg="meals">${[2, 3, 4, 5, 6].map(n => `<button type="button" class="${(s.meals || 3) == n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}</div></label>
      <div id="times" class="grid2">${slots.map(x => `<label class="field"><span>${esc(x.label)}</span><input class="in" type="time" data-time="${x.id}" value="${x.time}"></label>`).join('')}</div>
      <label class="field"><span>מאכלים שאני אוהב (מופרד בפסיקים)</span><input class="in" id="likes" value="${esc((s.likes || []).join(', '))}"></label>
      <label class="field"><span>להימנע מ- (מופרד בפסיקים)</span><input class="in" id="avoid" value="${esc((s.avoid || []).join(', '))}"></label>
      <label class="field"><span>זמן הכנה</span><select class="in" id="prep">${[[5, 'עד 5 דקות'], [15, 'עד 15 דקות'], [30, 'עד 30 דקות'], [60, 'יש לי זמן']].map(([v, l]) => `<option value="${v}" ${+s.prepMinutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; },
    // 3: תפריט
    () => `<p class="q">איך לבנות את התפריט?</p><div class="opts" data-opts="menu">
      <button type="button" class="opt ${w.menuMode === 'keep' ? 'on' : ''}" data-v="keep"><b>שמור את המאכלים שאני אוהב והתאם כמויות</b><small>המאכלים מהשבוע האחרון ומההעדפות שלך, בכמויות של היעד החדש</small></button>
      <button type="button" class="opt ${w.menuMode === 'new' ? 'on' : ''}" data-v="new"><b>בנה לי תפריט חדש מהמאגר</b><small>ארוחות אחרות מהמאגר, לגיוון</small></button></div>
      <p class="small muted">בשני המצבים נשמרות האלרגיות, הרגישויות וההגבלות שסימנת.</p>`,
    // 4: השוואה ואישור
    () => compareHtml(),
  ];

  function readStep(i) {
    if (i === 0) { w.kind = $('[data-opts="kind"] .on', el)?.dataset.v || null; if (!w.kind) return 'בחר סוג שינוי'; if (w.kind === 'same_goal') w.goal = cur.goal; }
    if (i === 1 && w.kind === 'goal_change') { w.goal = $('[data-opts="goal"] .on', el)?.dataset.v || w.goal; }
    if (i === 2) {
      const v = id => $('#' + id, el)?.value?.trim().replace(',', '.') ?? '';
      const s = w.settings; w.weightKg = +v('ww') || w.weightKg;
      if (!(w.weightKg >= 30 && w.weightKg <= 350)) return 'הזן משקל בוקר';
      if (w.goal === 'maintain') { const a = +v('rmin'), b = +v('rmax'); s.weightRange = a && b ? { min: Math.min(a, b), max: Math.max(a, b) } : null; }
      if (w.goal === 'lose' || w.goal === 'gain') { s.targetWeight = +v('tw') || null; s.rate = v('rate'); }
      else { s.rate = null; }
      s.strength = { ...(s.strength || {}), perWeek: +v('sp') || 0, minutes: s.strength?.minutes || 60 };
      s.cardio = { ...(s.cardio || {}), perWeek: +v('cp') || 0, minutes: s.cardio?.minutes || 30 };
      s.job = v('job'); s.steps = +v('steps') || null; s.prepMinutes = +v('prep');
      s.meals = +($('[data-seg="meals"] .on', el)?.dataset.v || s.meals || 3);
      s.mealTimes = Object.fromEntries($$('[data-time]', el).map(i => [i.dataset.time, i.value]));
      s.likes = v('likes').split(/[,،]+/).map(x => x.trim()).filter(Boolean); s.avoid = v('avoid').split(/[,،]+/).map(x => x.trim()).filter(Boolean);
    }
    if (i === 3) { w.menuMode = $('[data-opts="menu"] .on', el)?.dataset.v || 'keep'; buildPreview(); }
  }
  function buildPreview() {
    const p = prof(); w.preview = computeTargets(p, +w.weightKg);
    if (!w.preview.kcal) return;
    // יום לדוגמה: "שמור" = עדיפות למה שאכלת לאחרונה; "חדש" = עונש על מה שאכלת (גיוון)
    const recent = recentComps(today());
    const rec = new Map(); if (w.menuMode === 'new') for (const [k, n] of recent) rec.set(k, n + 3);
    const pp = { ...p }; if (w.menuMode === 'keep') pp.likes = [...(p.likes || []), ...[...recent.keys()].map(k => COMPONENTS[k]?.name).filter(Boolean)];
    w.sample = planDay({ profile: pp, target: { kcal: w.preview.kcal, protein: w.preview.protein }, foods: D.foods, entries: [], locked: [], recent: rec, maxPrep: +p.prepMinutes || 0 });
  }
  function sampleTotals() { return w.sample.reduce((a, x) => { a.k += x.option.totals.kcal; a.p += x.option.totals.protein; return a; }, { k: 0, p: 0 }); }
  function compareHtml() {
    const n = w.preview; if (!n?.kcal) return `<div class="note warn">${esc(n?.eligibility?.reasons?.join(' ') || 'לא ניתן לחשב יעד. בדוק את הנתונים.')}</div>`;
    const curSlots = profile()?.meals || 3; const st2 = sampleTotals();
    const row = (l, a, b, u = '') => `<tr><td>${l}</td><td class="num">${a ?? '—'}${a != null ? u : ''}</td><td class="num"><b>${b ?? '—'}${b != null ? u : ''}</b></td></tr>`;
    const slotsNew = mealSlots(w.settings.meals || 3, w.settings.mealTimes);
    return `<p class="q">התוכנית הנוכחית מול התוכנית החדשה</p>
      <table class="nut"><thead><tr><th></th><th>נוכחית</th><th>חדשה</th></tr></thead><tbody>
      ${row('מטרה', esc(GOALS[cur.goal]), esc(GOALS[w.goal]))}${row('קלוריות', curT?.kcal, n.kcal)}${row('חלבון', curT?.protein, n.protein, ' ג׳')}${row('פחמימות', curT?.carbs, n.carbs, ' ג׳')}${row('שומן', curT?.fat, n.fat, ' ג׳')}${row('ארוחות', curSlots, w.settings.meals || 3)}
      ${w.goal === 'maintain' && w.settings.weightRange ? row('טווח משקל', '—', `${w.settings.weightRange.min}–${w.settings.weightRange.max}`) : ''}</tbody></table>
      <details class="how"><summary>איך חושב?</summary><div class="small">${esc(n.goalLine)} ${esc(n.proteinWhy)} ${esc(n.macroWhy)}</div>${sourcesHtml(n.sources)}</details>
      <h3 style="margin-top:12px">יום אכילה לדוגמה בתוכנית החדשה</h3>
      <div class="note small">סה״כ: <b>${n0(st2.k)}</b> / ${n.kcal} קק״ל · <b>${n0(st2.p)}</b> / ${n.protein} ג׳ חלבון. אפשר להחליף כל ארוחה.</div>
      ${w.sample.map((x, i) => `<div style="margin-top:10px"><div class="row between"><b>${esc(slotsNew.find(s => s.id === x.slot)?.label || x.slot)}</b><button class="btn xs plain" data-swapmeal="${i}">החלף ארוחה</button></div>${suggestionHtml(x.option, 'p' + i).replace(/<button class="btn block sm"[^>]*>הוסף לתכנון<\/button>/, '')}</div>`).join('')}
      <h3 style="margin-top:14px">מתי להתחיל?</h3>
      <div class="opts" data-opts="start"><button type="button" class="opt ${w.start === today() ? 'on' : ''}" data-v="${today()}"><b>היום</b><small>מה שכבר אכלת היום נשמר, והיתרה תחושב לפי היעד החדש</small></button>
        <button type="button" class="opt ${w.start === addDays(today(), 1) ? 'on' : ''}" data-v="${addDays(today(), 1)}"><b>מחר</b></button>
        <button type="button" class="opt ${![today(), addDays(today(), 1)].includes(w.start) ? 'on' : ''}" data-v="custom"><b>בתאריך שאבחר</b><input class="in" type="date" id="sd" min="${today()}" value="${w.startCustom}" style="margin-top:8px"></button></div>
      <label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" id="aps" ${w.applySample ? 'checked' : ''} style="width:22px;height:22px">להוסיף את היום לדוגמה לתכנון של יום ההתחלה (רק בארוחות ריקות)</label>`;
  }

  const show = () => {
    const i = w.step; const last = i === steps.length - 1;
    el.innerHTML = `<div class="ob"><div class="row between"><span class="muted small">שלב ${i + 1} מתוך ${steps.length}</span><a class="btn xs plain" href="#/plan">ביטול</a></div>
      <div class="prog"><i style="width:${(i + 1) / steps.length * 100}%"></i></div><div class="body">${steps[i]()}<div id="er"></div></div>
      <div class="nav">${i > 0 ? '<button class="btn plain" id="back">חזרה</button>' : ''}<button class="btn" id="next">${last ? 'אישור והפעלת התוכנית' : 'המשך'}</button></div></div>`;
    $$('[data-opts]', el).forEach(g => g.addEventListener('click', e => { const b = e.target.closest('.opt'); if (!b) return; $$('.opt', g).forEach(x => x.classList.toggle('on', x === b)); }));
    $('[data-seg="meals"]', el)?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('[data-seg] button', el).forEach(x => x.classList.toggle('on', x === b)); readStep(2); w.settings.mealTimes = {}; show(); });
    $('#back', el)?.addEventListener('click', () => { w.step = Math.max(0, w.step - 1); show(); });
    $('#next', el).onclick = async () => {
      const er = readStep(i); if (er) { $('#er', el).innerHTML = `<div class="note warn">${esc(er)}</div>`; return; }
      if (!last) { w.step++; show(); return; }
      await activate();
    };
  };
  function swapMeal(i) {
    const x = w.sample[i]; const p = prof(); const n = w.preview;
    const others = w.sample.filter((_, j) => j !== i).reduce((a, y) => { a.k += y.option.totals.kcal; a.p += y.option.totals.protein; return a; }, { k: 0, p: 0 });
    const budget = { kcal: Math.max(150, n.kcal - others.k), protein: Math.max(0, n.protein - others.p) };
    const opts = suggestMeals({ foods: D.foods, slot: x.slot, profile: p, maxPrep: +p.prepMinutes || 0, recent: new Map([[x.option.items[0]?.comp, 5]]) }, budget, 3);
    const s = openSheet({ title: 'בחר ארוחה אחרת', body: opts.map((o, k) => suggestionHtml(o, k).replace('הוסף לתכנון', 'בחר את זו') + `<div class="tiny muted">הסיכום היומי יהיה: ${n0(others.k + o.totals.kcal)} קק״ל · ${n0(others.p + o.totals.protein)} ג׳ חלבון</div>`).join('') });
    on(s.el, '[data-addopt]', 'click', (e, b) => { w.sample[i] = { slot: x.slot, option: opts[+b.dataset.addopt] }; s.close(); show(); });
  }
  async function activate() {
    const sel = $('[data-opts="start"] .on', el)?.dataset.v || today();
    w.start = sel === 'custom' ? ($('#sd', el).value || w.startCustom) : sel;
    w.applySample = $('#aps', el).checked;
    if (w.start < today()) { $('#er', el).innerHTML = '<div class="note warn">אפשר להתחיל מהיום או מתאריך עתידי</div>'; return; }
    const slotsNew = mealSlots(w.settings.meals || 3, w.settings.mealTimes);
    const sampleDay = w.sample.map(x => ({ slot: x.slot, label: slotsNew.find(s => s.id === x.slot)?.label, name: x.option.name, totals: x.option.totals, items: x.option.items.map(i => ({ foodId: i.foodId, comp: i.comp, grams: i.grams, unit: i.unit, qty: i.qty, name: i.name })) }));
    const r = await save('POST', '/api/plans', { kind: w.kind, goal: w.goal, settings: w.settings, startDate: w.start, weightKg: +w.weightKg, menuMode: w.menuMode, sampleDay, basedOn: w.basedOn, reason: w.kind === 'same_goal' ? `תוכנית חדשה לאותה מטרה (${GOALS[w.goal]})` : `מעבר מ${GOALS[cur.goal]} ל${GOALS[w.goal]}` });
    if (w.applySample) {
      const existing = new Set(D.state.entries.filter(e => e.date === w.start).map(e => e.meal));
      const add = sampleDay.filter(d => !existing.has(d.slot)).flatMap(d => d.items.map((it, k) => ({ ...it, date: w.start, meal: d.slot, status: 'planned', source: 'plan', order: Date.now() + k })));
      if (add.length) await save('POST', '/api/entries', { entries: add });
    }
    await refresh();
    toast(w.start === today() ? `התוכנית פעילה מהיום: ${r.target.kcal} קק״ל, ${r.target.protein} ג׳ חלבון` : `התוכנית תתחיל ב-${dmy(w.start)}`, 4500);
    go(w.start === today() ? '#/today' : '#/plan');
  }
  on(el, '[data-swapmeal]', 'click', (e, b) => swapMeal(+b.dataset.swapmeal)); // פעם אחת — el נשאר לאורך האשף
  if (w.step >= 3) buildPreview();
  show();
});
