// "כמה אני שורף וכמה כדאי לי לאכול" + "איך חישבת לי?" + היסטוריית יעדים
import { route, go } from '../app.js';
import { D, refresh, profile, baseProfile, today, targetOn } from '../data.js';
import { pickPlanFields } from '/shared/plans.js';
import { save } from '../api.js';
import { $, esc, n0, kg, toast } from '../ui.js';
import { computeTargets, GOALS } from '/shared/nutrition.js';
import { sourcesFor } from '/shared/sources.js';
import { dmy, savedAt } from '/shared/dates.js';

export function sourcesHtml(ids) {
  return sourcesFor(ids).map(s => `<div class="src">${s.kind === 'decision' ? '<span class="k dec">החלטת תוכנה</span>' : `<span class="k">${s.kind === 'data' ? 'מאגר נתונים' : s.kind === 'guideline' ? 'הנחיה מקצועית' : 'מחקר'} · ${s.year}</span>`}
    <b>${esc(s.title)}</b>${s.authors ? `<div class="tiny muted">${esc(s.authors)}${s.journal ? ' · ' + esc(s.journal) : ''}</div>` : ''}
    <div>${esc(s.supports)}</div>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">פתיחת המקור ↗</a>` : ''}</div>`).join('');
}

route('targets', async (el, [mode]) => {
  const p = profile(); const ws = D.state.weights; const w = ws[ws.length - 1];
  if (!p || !w) { el.innerHTML = '<div class="note">חסרים נתונים. השלם את השאלון.</div>'; return; }
  const t = computeTargets(p, w.kg);
  const cur = targetOn(today());
  const hist = [...D.state.targets].reverse();
  let main = '';
  if (t.mode === 'blocked') {
    main = `<div class="note warn">${t.eligibility.reasons.map(esc).join('<br>')}</div><a class="btn block" href="#/onboarding/edit">הזנת יעדים מקצועיים</a>`;
  } else if (t.mode === 'professional') {
    main = `<div class="card soft"><b>יעדים מקצועיים</b><div>${esc(t.note)}</div></div>
      <div class="big4"><div class="card"><div class="q">כמה לאכול ביום</div><div class="a"><span class="num">${n0(t.kcal)}</span> <small>קק״ל</small></div></div>
      <div class="card"><div class="q">חלבון ביום</div><div class="a"><span class="num">${n0(t.protein)}</span> <small>גרם</small></div><div class="small">${t.perMeal.map(m => `${esc(m.label)}: ${m.g} ג׳`).join(' · ')}</div></div></div>`;
  } else {
    main = `<div class="big4">
      <div class="card"><div class="q">כמה הגוף שלך מוציא במנוחה?</div><div class="a"><span class="num">${n0(t.bmr)}</span> <small>קק״ל ביום</small></div><div class="small muted">אנרגיה לנשימה, דופק וחום גוף — גם בלי לזוז.</div></div>
      <div class="card"><div class="q">כמה אתה כנראה מוציא ביום ממוצע?</div><div class="a"><span class="num">${n0(t.tdeeRange[0])}–${n0(t.tdeeRange[1])}</span> <small>קק״ל</small></div><div class="small muted">הערכה כוללת עבודה, צעדים ואימונים. זה טווח, כי נוסחה לא מדויקת לכל אחד.</div></div>
      <div class="card soft"><div class="q">כמה כדאי לך לאכול ביום כדי להתקדם?</div><div class="a"><span class="num">${n0(t.kcal)}</span> <small>קק״ל</small></div><div class="small">${esc(GOALS[t.goal])}. מספר פתיחה — נבדוק אותו מול השקילות.</div>${t.etaWeeks ? `<div class="small muted">בקצב הזה: כ-${t.etaWeeks} שבועות למשקל היעד.</div>` : ''}</div>
      <div class="card"><div class="q">כמה חלבון ביום?</div><div class="a"><span class="num">${n0(t.protein)}</span> <small>גרם</small></div><div class="small">טווח אישי: ${t.proteinRange[0]}–${t.proteinRange[1]} ג׳. ${t.refWeight.kg !== w.kg ? `חושב לפי משקל ייחוס ${kg(t.refWeight.kg)} ק״ג.` : ''}</div>
        <div class="small" style="margin-top:6px">${t.perMeal.map(m => `${esc(m.label)}: <b>${m.g}</b> ג׳`).join(' · ')}</div></div>
      <div class="card"><div class="q">פחמימות ושומן</div><div class="a"><span class="num">${n0(t.carbs)}</span> <small>ג׳ פחמימות</small> · <span class="num">${n0(t.fat)}</span> <small>ג׳ שומן</small></div><div class="small muted">${esc(t.macroWhy)}</div></div></div>
      <details class="how" id="how"><summary>איך חישבת לי?</summary><div class="calc">
        <div class="ln small muted">נתונים: ${p.sex === 'female' ? 'אישה' : 'גבר'}, גיל ${p.age}, ${p.heightCm} ס״מ, משקל בוקר ${kg(w.kg)} ק״ג (${dmy(w.date)})</div>
        ${t.tdeeLines.map(l => `<div class="ln"><b class="num">${l.k === 'bmr' ? '' : '+'}${n0(l.v)}</b>${esc(l.label)}<div class="tiny muted">${esc(l.how)}</div></div>`).join('')}
        <div class="ln"><b class="num">${n0(t.tdee)}</b>סה״כ הוצאה יומית משוערת<div class="tiny muted">מוצג כטווח ±10%: ${n0(t.tdeeRange[0])}–${n0(t.tdeeRange[1])}</div></div>
        <div class="ln"><b class="num">${n0(t.kcal)}</b>יעד אכילה<div class="tiny muted">${esc(t.goalLine)} ${t.capped.map(esc).join(' ')} מעוגל ל-50.</div></div>
        <div class="ln"><b class="num">${n0(t.protein)} ג׳</b>חלבון<div class="tiny muted">${esc(t.proteinWhy)} ${t.proteinPerKg} ג׳ × ${kg(t.refWeight.kg)} ק״ג. ${esc(t.refWeight.reason)}</div></div>
        <div class="ln"><b class="num">${t.fiber} ג׳</b>סיבים<div class="tiny muted">יעד סיבים יומי לפי סקירות על איכות פחמימות.</div></div>
      </div><h3 style="margin-top:10px">על מה מבוסס החישוב?</h3>${sourcesHtml([...t.sources, 'reynolds2019'])}</details>`;
  }
  const fresh = t.kcal && t.protein;
  const differs = cur && fresh && (cur.kcal !== t.kcal || cur.protein !== t.protein);
  el.innerHTML = `<div class="stack"><div class="top"><h1>היעדים שלי</h1><a class="btn xs plain" href="#/today">להיום שלי</a></div>
    ${main}
    ${fresh ? `<div class="card"><h3>${cur ? (differs ? 'עדכון היעד' : 'היעד בתוקף') : 'שמירת היעד'}</h3>
      ${cur ? `<div class="small">בתוקף עכשיו: <b>${cur.kcal}</b> קק״ל, <b>${cur.protein}</b> ג׳ חלבון — מ-${dmy(cur.effectiveFrom)}</div>` : ''}
      ${!cur || differs || mode === 'new' ? `<label class="field" style="margin-top:10px"><span>להחיל מתאריך</span><input class="in" type="date" id="eff" value="${today()}"></label>
      <button class="btn block xl" id="savet">${cur ? `החל יעד: ${t.kcal} קק״ל, ${t.protein} ג׳` : `שמור יעד: ${t.kcal} קק״ל, ${t.protein} ג׳ חלבון`}</button>
      <p class="tiny muted">ימים קודמים ישמרו את היעד שהיה בתוקף בהם.</p>` : ''}</div>` : ''}
    ${hist.length ? `<div class="card"><h3>היסטוריית יעדים</h3><ul class="list">${hist.map(h => `<li class="li"><div class="m"><b>${h.kcal} קק״ל · ${h.protein} ג׳</b><small>מ-${dmy(h.effectiveFrom)} · ${esc(h.reason || (h.source === 'onboarding' ? 'חישוב ראשוני' : h.source))}</small></div><div class="a tiny">נשמר ${esc(savedAt(h.createdAt))}</div></li>`).join('')}</ul></div>` : ''}
    <a class="btn block plain" href="#/onboarding">בדיקת הנתונים שלי</a></div>`;
  $('#savet', el)?.addEventListener('click', async () => {
    const eff = $('#eff', el).value || today();
    const hasPlans = (D.state.plans || []).length > 0;
    if (!hasPlans) await save('POST', '/api/plans', { kind: 'initial', goal: p.goal || 'maintain', settings: pickPlanFields(baseProfile()), startDate: eff, weightKg: w.kg, reason: 'חישוב ראשוני' });
    else await save('POST', '/api/targets', { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber, effectiveFrom: eff, source: 'recalc', reason: 'חישוב מחדש לפי הפרופיל והמשקל', mode: t.mode, expectedWeekly: t.expectedWeekly ?? null, details: t.mode === 'auto' ? { bmr: t.bmr, tdee: t.tdee, refWeight: t.refWeight.kg, weight: w.kg } : null });
    await refresh(); toast('היעד נשמר'); go('#/today');
  });
});
