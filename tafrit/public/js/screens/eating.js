// "בנה מחדש את פרופיל האכילה שלי": סוג תזונה, מקורות חלבון שרוצים לקבל, וכלל "לפחות מנת עוף או דג ביום".
// שמירה אחת: הפרופיל נשמר בחשבון, והארוחות שנותרו להיום נבנות מחדש. ארוחות שנאכלו או ננעלו נשארות ונכללות ביעד.
import { D, refresh, profile, baseProfile, targetOn, entriesOn, dayDoc, recentComps, today } from '../data.js';
import { save, del } from '../api.js';
import { $, $$, esc, toast, openSheet, on } from '../ui.js';
import { DIETS, PROTEIN_SOURCES, dietAllows, dailyRuleGroups, eatingProfileFrom, eatingProfileOf, planDay, allergyBlocks } from '/shared/planner.js';
import { ALLERGENS } from '/shared/catalog.js';

const DIET_LABEL = Object.fromEntries(DIETS.map(([k, l]) => [k, l]));
const SRC_LABEL = Object.fromEntries(PROTEIN_SOURCES);
const ruleText = (diet, sources, on) => { const g = dailyRuleGroups(diet, sources, on); return g.length ? `לפחות מנת ${g.map(x => x === 'poultry' ? 'עוף' : 'דג').join(' או ')} אחת ביום` : 'בלי כלל יומי'; };

/** מה ישתנה בשמירה — מוצג לפני האישור */
function changes(cur, next) {
  const out = [];
  if (cur.diet !== next.diet) out.push(`סוג תזונה: ${DIET_LABEL[cur.diet]} ← ${DIET_LABEL[next.diet]}`);
  const add = next.sources.filter(k => !cur.sources.includes(k)), rem = cur.sources.filter(k => !next.sources.includes(k));
  if (add.length) out.push(`מקורות חלבון חדשים: ${add.map(k => SRC_LABEL[k]).join(', ')}`);
  if (rem.length) out.push(`לא יוצעו עוד: ${rem.map(k => SRC_LABEL[k]).join(', ')}`);
  const a = ruleText(cur.diet, cur.sources, cur.daily), b = ruleText(next.diet, next.sources, next.daily);
  if (a !== b) out.push(b === 'בלי כלל יומי' && a !== b ? `הכלל "${a}" יבוטל` : `כלל יומי: ${b}`);
  return out;
}

/**
 * פותח את מסך העריכה. date — היום שהארוחות שלו ייבנו מחדש. onSaved — אחרי שמירה ובנייה (לרענון המסך שפתח).
 */
export function openEatingProfile({ date = today(), onSaved } = {}) {
  const p = profile(date) || {};
  const cur = eatingProfileOf(p);
  const st = { diet: cur.diet, sources: [...cur.sources], daily: cur.daily };
  // אם עוברים לסוג תזונה שמאפשר יותר — מקורות שהיו חסומים רק בגלל סוג התזונה חוזרים (לא מה שהמשתמש הוציא בעצמו, כמו טופו)
  const userOff = new Set((p.menuPrefs?.noAuto || []).filter(k => dietAllows(cur.diet, k)));
  const s = openSheet({ title: 'פרופיל האכילה שלי', body: '<div id="ep"></div>', foot: '<button class="btn block" data-epsave>שמור ובנה לי תפריט מעודכן</button>' });
  const draw = () => {
    const ch = changes(cur, st);
    const ruleOk = ['poultry', 'fish'].some(g => dietAllows(st.diet, g) && st.sources.includes(g));
    const ruleLbl = st.diet === 'pescatarian' || !st.sources.includes('poultry') ? 'אני רוצה לפחות מנת דג אחת ביום' : !st.sources.includes('fish') || !dietAllows(st.diet, 'fish') ? 'אני רוצה לפחות מנת עוף אחת ביום' : 'אני רוצה לפחות מנת עוף או דג אחת ביום';
    $('#ep', s.el).innerHTML = `
      <p class="small muted">המשקל, המטרה, יעדי הקלוריות והחלבון והיסטוריית האכילה לא משתנים.</p>
      <h3>סגנון האכילה</h3>
      <div class="opts" role="radiogroup">${DIETS.map(([k, l, d]) => `<button type="button" class="opt ${st.diet === k ? 'on' : ''}" role="radio" aria-checked="${st.diet === k}" data-diet="${k}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>
      <h3 style="margin-top:14px">מקורות חלבון שאני רוצה לקבל</h3>
      <div class="chips">${PROTEIN_SOURCES.map(([k, l]) => { const al = allergyBlocks(p, k); const ok = dietAllows(st.diet, k) && !al; return `<button type="button" class="chip ${ok && st.sources.includes(k) ? 'on' : ''}" data-src="${k}" ${ok ? '' : 'disabled aria-disabled="true" style="opacity:.4"'}>${l}${al ? ' (אלרגיה)' : ''}</button>`; }).join('')}</div>
      ${ruleOk ? `<label class="row" style="gap:10px;margin-top:14px;cursor:pointer"><input type="checkbox" id="eprule" style="width:24px;height:24px" ${st.daily ? 'checked' : ''}><b>${ruleLbl}</b></label>`
        : `<p class="small muted" style="margin-top:12px">הכלל "מנת עוף או דג ביום" לא מתאים ל${esc(DIET_LABEL[st.diet])}${cur.daily && dailyRuleGroups(cur.diet, cur.sources, true).length ? ' — הוא יבוטל' : ''}.</p>`}
      <h3 style="margin-top:14px">נשמר בלי שינוי</h3>
      <ul class="small" style="margin:4px 0;padding-inline-start:20px;line-height:1.7">
        <li>אלרגיות ורגישויות: ${esc([...(p.allergies || []).map(a => ALLERGENS[a] || a), p.allergyOther].filter(Boolean).join(', ') || 'אין')}</li>
        <li>להימנע מ-: ${esc((p.avoid || []).join(', ') || 'אין')}</li>
        ${p.kosher ? '<li>כשרות</li>' : ''}
      </ul>
      <div class="note ${ch.length ? 'ok' : ''}" id="epchg" style="margin-top:12px">${ch.length ? `<b>מה ישתנה:</b><ul style="margin:4px 0 0;padding-inline-start:20px">${ch.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : 'אין שינוי בבחירות. אפשר לשמור כדי לבנות מחדש את הארוחות שנותרו להיום.'}</div>
      <p class="tiny muted">בשמירה: ארוחות שסימנת "אכלתי" או נעלת נשארות ביומן ונכללות ביעד; שאר הארוחות של היום נבנות מחדש.</p>`;
  };
  on(s.el, '[data-diet]', 'click', (e, b) => {
    const prev = st.diet; st.diet = b.dataset.diet;
    // מקורות שחזרו להיות מותרים (למשל עוף ודגים אחרי צמחוני) — נבחרים, חוץ ממה שהמשתמש הוציא בעצמו
    for (const [k] of PROTEIN_SOURCES) if (dietAllows(st.diet, k) && !dietAllows(prev, k) && !userOff.has(k) && !allergyBlocks(p, k) && !st.sources.includes(k)) st.sources.push(k);
    st.sources = st.sources.filter(k => dietAllows(st.diet, k));
    draw();
  });
  on(s.el, '[data-src]', 'click', (e, b) => { const k = b.dataset.src; st.sources = st.sources.includes(k) ? st.sources.filter(x => x !== k) : [...st.sources, k]; draw(); });
  on(s.el, '#eprule', 'change', (e, b) => { st.daily = b.checked; draw(); });
  on(s.el, '[data-epsave]', 'click', async (e, b) => {
    b.disabled = true; b.textContent = 'שומר ובונה…';
    try {
      const next = eatingProfileFrom(st);
      await save('PUT', '/api/profile', { profile: { ...(baseProfile() || {}), diet: next.diet, menuPrefs: { ...(baseProfile()?.menuPrefs || {}), ...next.menuPrefs } } });
      await refresh();
      const n = await rebuildRestOfDay(date);
      s.close(); toast(n ? `הפרופיל נשמר. ${n} ארוחות נבנו מחדש לפי הבחירות החדשות` : 'הפרופיל נשמר');
      onSaved?.();
    } catch { b.disabled = false; b.textContent = 'שמור ובנה לי תפריט מעודכן'; }
  });
  draw();
  return s;
}

/** בונה מחדש את הארוחות הפתוחות של היום (לא נאכלו ולא ננעלו), כל ארוחה פעם אחת */
export async function rebuildRestOfDay(date) {
  await D.worldReady;
  const p = profile(date); const tgt = targetOn(date); if (!tgt) return 0;
  const plan = planDay({ profile: p, target: tgt, foods: D.foods, entries: entriesOn(date), history: D.state.entries, date, locked: dayDoc(date).locked || [], recent: recentComps(date), maxPrep: +p.prepMinutes || 0 });
  for (const x of plan) {
    for (const e of entriesOn(date).filter(e => e.meal === x.slot && e.status !== 'eaten')) await del('/api/entries/' + e.id);
    await save('POST', '/api/entries', { entries: x.option.items.map((i, k) => ({ date, meal: x.slot, foodId: i.foodId, grams: i.grams, unit: i.unit, qty: i.qty, comp: i.comp, status: 'planned', source: 'suggestion', ...(x.option.templateId ? { recipe: x.option.templateId } : {}), order: Date.now() + k })) });
  }
  await refresh();
  return plan.length;
}
