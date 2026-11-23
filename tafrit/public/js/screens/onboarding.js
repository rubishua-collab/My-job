// היכרות אישית: שאלה אחת או שתיים בכל מסך, אפשר לחזור ולתקן, וההתקדמות נשמרת
import { route, go } from '../app.js';
import { D, refresh, today } from '../data.js';
import { save } from '../api.js';
import { $, $$, esc, toast, kg } from '../ui.js';
import { GOALS, GOAL_HINT, JOB, GENERAL, weeklyKg, fmtWeekly } from '/shared/nutrition.js';
import { ALLERGENS } from '/shared/catalog.js';
import { savedAt, dmy } from '/shared/dates.js';

const chips = (name, list, sel) => `<div class="chips" data-chips="${name}">${list.map(([v, l]) => `<button type="button" class="chip ${sel.includes(v) ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const opts = (name, list, val) => `<div class="opts" data-opts="${name}">${list.map(([v, l, s]) => `<button type="button" class="opt ${String(val) === String(v) ? 'on' : ''}" data-v="${esc(v)}"><b>${esc(l)}</b>${s ? `<small>${esc(s)}</small>` : ''}</button>`).join('')}</div>`;
const num = (id, label, val, attrs = '') => `<label class="field"><span>${label}</span><input class="in" id="${id}" inputmode="decimal" value="${val ?? ''}" ${attrs}></label>`;
const getOpt = (el, name) => $(`[data-opts="${name}"] .opt.on`, el)?.dataset.v ?? null;
const getChips = (el, name) => $$(`[data-chips="${name}"] .chip.on`, el).map(c => c.dataset.v);
const val = (el, id) => $('#' + id, el)?.value.trim().replace(',', '.') ?? '';
const list = s => String(s || '').split(/[,،\n]+/).map(x => x.trim()).filter(Boolean);

const LIKES = ['עוף', 'ביצים', 'קוטג׳', 'גבינות', 'טונה', 'דגים', 'בשר בקר', 'הודו', 'טופו', 'עדשים וקטניות', 'אורז', 'פסטה', 'פיתה', 'לחם', 'בטטה', 'סלט ירקות', 'פירות', 'יוגורט', 'שיבולת שועל', 'טחינה', 'אבוקדו'];
const MEALS_EX = ['חביתה עם סלט ולחם', 'חזה עוף עם אורז וסלט', 'קוטג׳ עם פיתה וירקות'];

/** כרטיסי הקצב: האחוז, ולצידו הכמות השבועית לפי משקל הבוקר שהוזן בשאלון (גם כשמשקל היעד ריק) */
function paceCards(p) {
  const w = +p._weight; const okW = w >= 30 && w <= 350;
  const gain = p.goal === 'gain';
  const list = gain
    ? [['slow', 'איטי', '0.25% ממשקל הגוף בשבוע'], ['standard', 'רגיל', '0.5% ממשקל הגוף בשבוע']]
    : [['slow', 'עדין', '0.5% ממשקל הגוף בשבוע'], ['moderate', 'מתון', '0.75% ממשקל הגוף בשבוע'], ['fast', 'מהיר', '1% ממשקל הגוף בשבוע']];
  const val = p.rate && list.some(x => x[0] === p.rate) ? p.rate : gain ? 'slow' : 'moderate';
  const cards = list.map(([v, l, pct]) => {
    const kg = okW ? weeklyKg(p.goal, v, p, w) : null;
    const amount = kg ? ` <span class="wk">· ${gain ? 'עלייה' : 'ירידה'} של כ־${esc(fmtWeekly(kg))} בשבוע</span>` : '';
    return `<button type="button" class="opt ${val === v ? 'on' : ''}" data-v="${v}"><b>${l}</b><small>${esc(pct)}${amount}</small></button>`;
  }).join('');
  const note = !okW ? 'לאחר הזנת המשקל הנוכחי תופיע גם הכמות השבועית' : '';
  return `<div class="opts" data-opts="rate">${cards}</div>${note ? `<p class="small muted" style="margin-top:8px">${note}</p>` : ''}`;
}

const STEPS = [
  { id: 'basic', q: 'נתחיל: גיל ומין', hint: 'המין משמש רק לחישוב ההוצאה האנרגטית (בנוסחה יש ערך שונה לגברים ולנשים).',
    html: p => `${opts('sex', [['male', 'זכר'], ['female', 'נקבה']], p.sex)}<div style="height:12px"></div>${num('age', 'גיל', p.age, 'inputmode="numeric" placeholder="למשל 38"')}`,
    read: (el, p) => { p.sex = getOpt(el, 'sex'); p.age = +val(el, 'age'); if (!p.sex) return 'בחר מין לחישוב'; if (!(p.age >= 14 && p.age <= 100)) return 'הזן גיל בין 14 ל-100'; } },
  { id: 'body', q: 'גובה ומשקל בוקר', hint: 'משקל בוקר: אחרי השירותים ולפני אוכל ושתייה.',
    html: p => `${num('h', 'גובה (ס״מ)', p.heightCm, 'inputmode="numeric" placeholder="למשל 178"')}${num('w', 'משקל הבוקר (ק״ג)', p._weight ?? lastW(), 'placeholder="למשל 119.8"')}`,
    read: (el, p) => { p.heightCm = +val(el, 'h'); p._weight = +val(el, 'w'); if (!(p.heightCm >= 120 && p.heightCm <= 230)) return 'הזן גובה בס״מ'; if (!(p._weight >= 30 && p._weight <= 350)) return 'הזן משקל בק״ג'; } },
  { id: 'goal', q: 'מה המטרה שלך כרגע?', hint: 'אפשר לשנות בכל זמן.',
    html: p => opts('goal', Object.keys(GOALS).map(k => [k, GOALS[k], GOAL_HINT[k]]), p.goal),
    read: (el, p) => { p.goal = getOpt(el, 'goal'); if (!p.goal) return 'בחר מטרה'; } },
  { id: 'range', q: 'טווח משקל רצוי', hint: 'בשמירת משקל — באיזה טווח נוח לך להיות? (לא חובה)', skip: p => p.goal !== 'maintain',
    html: p => `<div class="grid2">${num('rmin', 'מ- (ק״ג)', p.weightRange?.min, 'placeholder="למשל 78"')}${num('rmax', 'עד (ק״ג)', p.weightRange?.max, 'placeholder="למשל 81"')}</div>`,
    read: (el, p) => { const a = +val(el, 'rmin'), b = +val(el, 'rmax'); p.weightRange = a && b ? { min: Math.min(a, b), max: Math.max(a, b) } : null; } },
  { id: 'pace', q: 'משקל יעד וקצב', hint: 'משקל יעד לא חובה. הקצב קובע כמה גדול יהיה הגירעון או העודף.', skip: p => p.goal === 'maintain' || p.goal === 'recomp',
    html: p => `${num('tw', 'משקל יעד (ק״ג, לא חובה)', p.targetWeight, 'placeholder="למשל 100"')}${paceCards(p)}`,
    read: (el, p) => { p.targetWeight = +val(el, 'tw') || null; p.rate = getOpt(el, 'rate'); } },
  { id: 'job', q: 'איך נראה יום עבודה רגיל?', hint: 'בלי האימונים — עליהם נשאל בנפרד.',
    html: p => `${opts('job', Object.entries(JOB).map(([k, v]) => [k, v.label]), p.job)}<div style="height:12px"></div>${num('steps', 'צעדים ביום בממוצע (אם ידוע)', p.steps, 'inputmode="numeric" placeholder="למשל 6500"')}`,
    read: (el, p) => { p.job = getOpt(el, 'job'); p.steps = +val(el, 'steps') || null; if (!p.job) return 'בחר סוג עבודה'; } },
  { id: 'strength', q: 'אימוני כוח', hint: 'משקולות, מכונות, תרגילי משקל גוף.',
    html: p => `<div class="grid2">${num('sp', 'פעמים בשבוע', p.strength?.perWeek ?? 0, 'inputmode="numeric"')}${num('sm', 'דקות לאימון', p.strength?.minutes ?? 60, 'inputmode="numeric"')}</div>${opts('si', [['light', 'קל'], ['moderate', 'בינוני'], ['vigorous', 'מאומץ']], p.strength?.intensity || 'moderate')}`,
    read: (el, p) => { p.strength = { perWeek: +val(el, 'sp') || 0, minutes: +val(el, 'sm') || 0, intensity: getOpt(el, 'si') }; } },
  { id: 'cardio', q: 'אירובי וימי מנוחה', hint: 'הליכה מהירה, ריצה, אופניים, שחייה.',
    html: p => `<div class="grid2">${num('cp', 'אירובי: פעמים בשבוע', p.cardio?.perWeek ?? 0, 'inputmode="numeric"')}${num('cm', 'דקות לאימון', p.cardio?.minutes ?? 30, 'inputmode="numeric"')}</div>${opts('ci', [['light', 'קל'], ['moderate', 'בינוני'], ['vigorous', 'מאומץ']], p.cardio?.intensity || 'moderate')}<div style="height:12px"></div>${num('rest', 'ימי מנוחה בשבוע', p.restDays ?? '', 'inputmode="numeric"')}`,
    read: (el, p) => { p.cardio = { perWeek: +val(el, 'cp') || 0, minutes: +val(el, 'cm') || 0, intensity: getOpt(el, 'ci') }; p.restDays = val(el, 'rest') === '' ? null : +val(el, 'rest'); } },
  { id: 'mode', q: 'איך לחשב את הפעילות?', hint: 'כדי לא לספור את האימונים פעמיים.',
    html: p => opts('am', [['components', 'לפי הפירוט שנתתי (מומלץ)', 'עבודה + צעדים + אימונים, כל אחד בנפרד'], ['general', 'לפי רמת פעילות כללית', 'רמה אחת שכבר כוללת את האימונים — בלי תוספת לאימונים']], p.activityMode || 'components') + `<div id="gl" style="margin-top:12px" class="${p.activityMode === 'general' ? '' : 'hidden'}">${opts('gl', Object.entries(GENERAL), p.generalLevel || 1.375)}</div>`,
    bind: el => $('[data-opts="am"]', el).addEventListener('click', () => setTimeout(() => $('#gl', el).classList.toggle('hidden', getOpt(el, 'am') !== 'general'))),
    read: (el, p) => { p.activityMode = getOpt(el, 'am'); p.generalLevel = p.activityMode === 'general' ? +getOpt(el, 'gl') : null; } },
  { id: 'rhythm', q: 'מתי אתה מתאמן, וכמה ארוחות נוח לך?', hint: '',
    html: p => `${opts('tt', [['morning', 'בבוקר'], ['noon', 'בצהריים'], ['evening', 'בערב'], ['varies', 'משתנה / לא מתאמן']], p.trainingTime || '')}<div style="height:14px"></div><span class="muted small">ארוחות ביום (כולל ביניים)</span><div class="seg" data-seg="meals" style="margin-top:6px">${[2, 3, 4, 5, 6].map(n => `<button type="button" class="${(p.meals || 3) == n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}</div>`,
    bind: el => $('[data-seg]', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('[data-seg] button', el).forEach(x => x.classList.toggle('on', x === b)); }),
    read: (el, p) => { p.trainingTime = getOpt(el, 'tt'); p.meals = +$('[data-seg] .on', el).dataset.v; } },
  { id: 'hunger', q: 'מתי אתה רעב במיוחד, וכמה זמן יש להכנה?', hint: 'בשעות הרעב נגדיל קצת את הארוחה.',
    html: p => `${chips('hunger', [['morning', 'בוקר'], ['noon', 'צהריים'], ['afternoon', 'אחר הצהריים'], ['evening', 'ערב'], ['night', 'לילה']], p.hungerTimes || [])}<div style="height:16px"></div>${opts('prep', [[5, 'עד 5 דקות'], [15, 'עד 15 דקות'], [30, 'עד 30 דקות'], [60, 'יש לי זמן']], p.prepMinutes || 15)}`,
    read: (el, p) => { p.hungerTimes = getChips(el, 'hunger'); p.prepMinutes = +getOpt(el, 'prep'); } },
  { id: 'likes', q: 'מה אתה אוהב לאכול?', hint: 'בחר כמה שרוצים, ואפשר להוסיף בטקסט.',
    html: p => `${chips('likes', LIKES.map(x => [x, x]), p.likes || [])}<label class="field" style="margin-top:12px"><span>עוד (מופרד בפסיקים)</span><input class="in" id="likesx" value="${esc((p.likes || []).filter(x => !LIKES.includes(x)).join(', '))}"></label>`,
    read: (el, p) => { p.likes = [...getChips(el, 'likes'), ...list(val(el, 'likesx'))]; } },
  { id: 'avoid', q: 'ממה אתה מעדיף להימנע?', hint: 'למשל: סלמון, חריף, חצילים. וגם סוג תזונה.',
    html: p => `<label class="field"><span>מאכלים להימנע (מופרד בפסיקים)</span><input class="in" id="avoid" value="${esc((p.avoid || []).join(', '))}"></label>${opts('diet', [['none', 'אוכל הכל'], ['pescatarian', 'בלי בשר (כן דגים)'], ['vegetarian', 'צמחוני'], ['vegan', 'טבעוני']], p.diet || 'none')}`,
    read: (el, p) => { p.avoid = list(val(el, 'avoid')); p.diet = getOpt(el, 'diet'); } },
  { id: 'kosher', q: 'כשרות ותקציב', hint: 'בכשרות לא נשלב בשר וחלב באותה ארוחה.',
    html: p => `${opts('kosher', [['1', 'שומר כשרות'], ['0', 'לא שומר כשרות']], p.kosher == null ? '' : p.kosher ? '1' : '0')}<div style="height:14px"></div>${opts('budget', [['low', 'תקציב חסכוני'], ['mid', 'תקציב רגיל'], ['high', 'לא מוגבל']], p.budget || 'mid')}`,
    read: (el, p) => { const k = getOpt(el, 'kosher'); if (k == null) return 'בחר אם אתה שומר כשרות'; p.kosher = k === '1'; p.budget = getOpt(el, 'budget'); } },
  { id: 'fav', q: 'שלוש ארוחות שאתה כבר אוהב', hint: 'כדי שהתפריט הראשון ירגיש מוכר.',
    html: p => [0, 1, 2].map(i => `<label class="field"><span>ארוחה ${i + 1}</span><input class="in" id="fav${i}" placeholder="${MEALS_EX[i]}" value="${esc(p.favoriteMeals?.[i] || '')}"></label>`).join(''),
    read: (el, p) => { p.favoriteMeals = [0, 1, 2].map(i => val(el, 'fav' + i)).filter(Boolean); } },
  { id: 'allergy', q: 'אלרגיות או רגישויות', hint: 'מזונות עם האלרגנים האלה לא יוצעו לך.',
    html: p => chips('all', Object.entries(ALLERGENS), p.allergies || []) + `<label class="field" style="margin-top:12px"><span>אחר</span><input class="in" id="allx" value="${esc(p.allergyOther || '')}"></label>`,
    read: (el, p) => { p.allergies = getChips(el, 'all'); p.allergyOther = val(el, 'allx'); } },
  { id: 'medical', q: 'הנחיות רפואיות', hint: 'מצבים שמשנים את היעדים. במצב שדורש ליווי מקצועי אפשר להזין את היעדים שקבעו לך.',
    html: p => { const m = p.medical || {}; const pt = p.proTargets || {};
      return `${chips('med', [['kidney', 'מחלת כליה'], ['eatingDisorder', 'הפרעת אכילה (כעת או בעבר)'], ['pregnancy', 'הריון / הנקה'], ['diabetes', 'סוכרת עם תרופות']], Object.keys(m).filter(k => m[k] === true))}
      <label class="field" style="margin-top:12px"><span>הנחיות נוספות (לא חובה)</span><input class="in" id="medx" value="${esc(m.other || '')}"></label>
      <details class="how" ${pt.kcal || pt.protein ? 'open' : ''}><summary>יש לי יעדים שקבע/ה דיאטן/ית</summary>
        <div class="grid2">${num('pk', 'קלוריות ביום', pt.kcal, 'inputmode="numeric"')}${num('pp', 'חלבון (ג׳) ביום', pt.protein, 'inputmode="numeric"')}</div>
        <label class="field"><span>מי קבע</span><input class="in" id="pby" value="${esc(pt.by || '')}" placeholder="למשל: דיאטנית קלינית"></label>
        <label class="field"><span>הערה</span><input class="in" id="pnote" value="${esc(pt.note || '')}"></label></details>`; },
    read: (el, p) => {
      const sel = getChips(el, 'med'); p.medical = { kidney: sel.includes('kidney'), eatingDisorder: sel.includes('eatingDisorder'), pregnancy: sel.includes('pregnancy'), diabetes: sel.includes('diabetes'), other: val(el, 'medx') };
      const pk = +val(el, 'pk') || null, pp = +val(el, 'pp') || null;
      p.proTargets = pk || pp ? { kcal: pk, protein: pp, by: val(el, 'pby'), note: val(el, 'pnote') } : null;
      if ((p.medical.kidney || p.medical.eatingDisorder || p.medical.pregnancy) && !p.proTargets) return 'במצב הזה צריך להזין את היעדים שקבעו לך, כדי שהאפליקציה לא תחשב יעד בעצמה. אם עוד אין לך יעדים — כדאי לקבוע אותם עם דיאטן/ית.';
    } },
  { id: 'confirm', q: 'רגע לפני החישוב', hint: 'אשר את משקל הבוקר הנוכחי ואת המטרה.',
    html: p => `${num('cw', `משקל הבוקר היום (${dmy(today())})`, p._weight ?? lastW(), 'placeholder="ק״ג"')}<div class="card tight"><div class="muted small">המטרה שבחרת</div><b>${esc(GOALS[p.goal] || '')}</b>${p.targetWeight ? `<div class="small">משקל יעד: ${kg(p.targetWeight)} ק״ג</div>` : ''}</div>
      <label class="row" style="margin-top:14px;gap:10px"><input type="checkbox" id="okgoal" style="width:24px;height:24px" ${p._goalOk ? 'checked' : ''}><span>אני מאשר את המטרה</span></label>`,
    read: (el, p) => { p._weight = +val(el, 'cw'); p._goalOk = $('#okgoal', el).checked; if (!(p._weight >= 30 && p._weight <= 350)) return 'הזן את משקל הבוקר'; if (!p._goalOk) return 'סמן שאתה מאשר את המטרה'; } },
];

function lastW() { const ws = D.state?.weights || []; return ws.length ? ws[ws.length - 1].kg : ''; }
const draftKey = 'tafrit-ob-draft';

route('onboarding', async (el, [arg]) => {
  const prof = D.state.profile;
  let p; try { p = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { p = null; }
  p = p || structuredClone(prof || {});
  // יש נתונים קודמים — מציגים לאישור עם תאריך העדכון
  if (prof?.onboarding?.done && arg !== 'edit') return review(el, prof);
  // משתמש שכבר יש לו תוכנית: את המטרה, הפעילות, הארוחות וההעדפות משנים דרך "שינוי מטרה ותוכנית" (כדי לשמור היסטוריה)
  const hasPlans = (D.state.plans || []).length > 0;
  const PLAN_STEPS = new Set(['goal', 'range', 'pace', 'job', 'strength', 'cardio', 'mode', 'rhythm', 'hunger', 'likes', 'fav']);
  const visible = () => STEPS.filter(s => !s.skip?.(p) && !(hasPlans && PLAN_STEPS.has(s.id)));
  let i = arg === 'edit' ? 0 : Math.max(0, visible().indexOf(STEPS[Math.min(prof?.onboarding?.step || 0, STEPS.length - 1)]));
  const show = () => {
    const steps = visible(); i = Math.max(0, Math.min(i, steps.length - 1)); const s = steps[i];
    el.innerHTML = `<div class="ob"><div class="row between"><span class="muted small">שאלה ${i + 1} מתוך ${steps.length}</span>${i > 0 ? '' : '<span class="muted small">תפריט יומי רובי</span>'}</div>
      <div class="prog"><i style="width:${(i + 1) / steps.length * 100}%"></i></div>
      <p class="q">${esc(s.q)}</p>${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ''}
      <form class="body" id="obf" novalidate>${s.html(p)}<div id="oberr"></div></form>
      <div class="nav">${i > 0 ? '<button class="btn plain" id="back">חזרה</button>' : ''}<button class="btn" id="next">${s.id === 'confirm' ? 'חשב לי יעדים' : 'המשך'}</button></div></div>`;
    $$('[data-opts]', el).forEach(g => g.addEventListener('click', e => { const b = e.target.closest('.opt'); if (!b) return; $$('.opt', g).forEach(x => x.classList.toggle('on', x === b)); }));
    $$('[data-chips]', el).forEach(g => g.addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) b.classList.toggle('on'); }));
    s.bind?.(el);
    $('#back', el)?.addEventListener('click', () => { s.read(el, p); i--; persist(); show(); });
    $('#next', el).onclick = async () => {
      const er = s.read(el, p);
      if (er) { $('#oberr', el).innerHTML = `<div class="note warn">${esc(er)}</div>`; return; }
      if (s.id === 'confirm') return finish();
      i++; await persist(true); show();
    };
    $('#obf', el).onsubmit = e => { e.preventDefault(); $('#next', el).click(); };
  };
  async function persist(remote) {
    try { localStorage.setItem(draftKey, JSON.stringify(p)); } catch {}
    if (remote) { const clean = strip(p); clean.onboarding = { ...(prof?.onboarding || {}), step: STEPS.indexOf(visible()[i]), done: !!prof?.onboarding?.done }; try { D.state.profile = await save('PUT', '/api/profile', { profile: clean }, { quiet: true }); } catch {} }
  }
  async function finish() {
    const clean = strip(p); clean.onboarding = { step: STEPS.length - 1, done: true, at: Date.now() };
    await save('PUT', '/api/weights/' + today(), { kg: p._weight });
    await save('PUT', '/api/profile', { profile: clean });
    try { localStorage.removeItem(draftKey); } catch {}
    await refresh();
    go('#/targets/new');
  }
  show();
});
const strip = p => { const c = { ...p }; delete c._weight; delete c._goalOk; delete c.id; delete c.createdAt; delete c.updatedAt; return c; };

function review(el, prof) {
  const ws = D.state.weights; const lw = ws[ws.length - 1];
  el.innerHTML = `<div class="stack"><div class="top"><h1>הנתונים שלך</h1></div>
    <div class="note">עודכן לאחרונה: ${esc(savedAt(prof.updatedAt))}</div>
    <div class="card"><dl class="kv">
      <dt>גיל / מין</dt><dd>${prof.age} / ${prof.sex === 'female' ? 'נקבה' : 'זכר'}</dd><dt>גובה</dt><dd>${prof.heightCm} ס״מ</dd>
      <dt>שקילה אחרונה</dt><dd>${lw ? `${kg(lw.kg)} ק״ג (${dmy(lw.date)})` : '—'}</dd><dt>מטרה</dt><dd>${esc(GOALS[prof.goal])}</dd>
      <dt>עבודה</dt><dd>${esc(JOB[prof.job]?.label || '')}</dd><dt>אימוני כוח</dt><dd>${prof.strength?.perWeek || 0} בשבוע</dd><dt>ארוחות</dt><dd>${prof.meals}</dd>
      <dt>כשרות</dt><dd>${prof.kosher ? 'כן' : 'לא'}</dd><dt>אלרגיות</dt><dd>${esc((prof.allergies || []).map(a => ALLERGENS[a]).join(', ') || 'אין')}</dd></dl></div>
    <label class="field"><span>משקל הבוקר היום (${dmy(today())})</span><input class="in big" id="rw" inputmode="decimal" value="${lw?.date === today() ? lw.kg : ''}" placeholder="ק״ג"></label>
    <label class="row" style="gap:10px"><input type="checkbox" id="rok" style="width:24px;height:24px"><span>המטרה עדיין: ${esc(GOALS[prof.goal])}</span></label>
    <button class="btn block xl" id="rgo">הנתונים נכונים — חשב יעדים</button>
    ${(D.state.plans || []).length ? '<button class="btn block soft" id="rplan">שינוי מטרה ותוכנית</button><button class="btn block plain" id="redit">עדכון פרטים אישיים (גיל, גובה, אלרגיות, הנחיות רפואיות)</button>' : '<button class="btn block plain" id="redit">עדכן תשובות</button>'}</div>`;
  $('#redit', el).onclick = () => go('#/onboarding/edit');
  $('#rplan', el)?.addEventListener('click', () => go('#/plan-change'));
  $('#rgo', el).onclick = async () => {
    const w = +$('#rw', el).value.replace(',', '.');
    if (!(w >= 30 && w <= 350)) return toast('הזן את משקל הבוקר');
    if (!$('#rok', el).checked) return toast('סמן שהמטרה נכונה, או עדכן תשובות');
    await save('PUT', '/api/weights/' + today(), { kg: w }); await refresh(); go('#/targets/new');
  };
}
