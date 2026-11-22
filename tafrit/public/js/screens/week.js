// סיכום שבועי: ממוצע משקל, שינוי, ממוצע אכילה בימים מתועדים, צ׳ק-אין והצעת התאמה
import { route, render } from '../app.js';
import { D, refresh, profile, today, targetOn } from '../data.js';
import { save } from '../api.js';
import { $, $$, esc, n0, kg, toast, sign, on } from '../ui.js';
import { weeklyReview, MIN_WEIGHINS, MIN_LOGGED_DAYS } from '/shared/adjust.js';
import { dm, dmy, addDays } from '/shared/dates.js';
import { sourcesHtml } from './targets.js';

const STATUS = {
  insufficient: ['חסר מידע', ''], on_track: ['בקצב שבחרת', 'ok'], watch: ['לעקוב עוד שבוע', ''],
  too_slow: ['קצב איטי מהמתוכנן', 'warn'], too_fast: ['קצב מהיר מהמתוכנן', 'warn'], adherence: ['האכילה בפועל מעל היעד', 'warn'], floor: ['היעד כבר במינימום', 'warn'],
};

route('week', async (el) => {
  const p = profile(); const t = today();
  const rv = weeklyReview({ profile: p, targets: D.state.targets, weights: D.state.weights, days: D.state.days, entries: D.state.entries, foods: D.foods, today: t, checkins: D.state.checkins });
  const L = rv.last; const cur = rv.weeks[0];
  const ck = L ? D.state.checkins[L.start] || {} : {};
  const scale = (k, label, lo, hi) => `<div class="field"><span>${label}</span><div class="seg" data-ck="${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${ck[k] == n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}</div><div class="row between tiny muted"><span>${lo}</span><span>${hi}</span></div></div>`;
  const [stLabel, stCls] = STATUS[rv.status] || STATUS.insufficient;
  el.innerHTML = `<div class="stack"><div class="top"><h1>סיכום שבועי</h1></div>
    ${L ? `<div class="card"><div class="row between"><h3>${dm(L.start)}–${dm(L.end)}</h3><span class="pill">שבוע שהסתיים</span></div>
      <dl class="kv">
        <dt>ממוצע משקל</dt><dd>${L.avg ? kg(L.avg) + ' ק״ג' : '—'} <span class="tiny muted">(${esc(L.label)})</span></dd>
        <dt>שינוי לעומת השבוע הקודם</dt><dd>${rv.change ? `${sign(rv.change.kg)} ק״ג (${sign(rv.change.pct)}%)` : '—'} ${rv.prev ? `<span class="tiny muted">(${esc(rv.prev.label)})</span>` : ''}</dd>
        <dt>קצב צפוי לפי המטרה</dt><dd>${rv.expected != null ? sign(rv.expected) + ' ק״ג לשבוע' : '—'}</dd>
        <dt>ממוצע קלוריות</dt><dd>${rv.intake?.avgKcal != null ? n0(rv.intake.avgKcal) : '—'} <span class="tiny muted">(${rv.intake?.nDays || 0} ימים מתועדים)</span></dd>
        <dt>ממוצע חלבון</dt><dd>${rv.intake?.avgProtein != null ? n0(rv.intake.avgProtein) + ' ג׳' : '—'} <span class="tiny muted">(${rv.intake?.nDays || 0} ימים)</span></dd>
        <dt>יעד בתוקף</dt><dd>${rv.target ? `${rv.target.kcal} קק״ל · ${rv.target.protein} ג׳` : '—'}</dd></dl></div>`
      : '<div class="note">עוד אין שבוע שהסתיים. הסיכום יופיע ביום ראשון הקרוב.</div>'}
    ${cur ? `<div class="card tight small">השבוע הנוכחי (${dm(cur.start)}–${dm(cur.end)}): ${cur.avg ? `ממוצע עד עכשיו ${kg(cur.avg)} ק״ג` : 'עוד אין שקילות'} · ${esc(cur.label)} · <span class="pill">בתהליך</span></div>` : ''}
    ${L ? `<div class="card"><h3>איך הרגשת בשבוע שעבר?</h3>${scale('hunger', 'רעב', 'כמעט לא רעב', 'רעב מאוד')}${scale('energy', 'אנרגיה', 'עייף מאוד', 'מלא אנרגיה')}${scale('performance', 'ביצועים באימון', 'ירדו', 'השתפרו')}
      <button class="btn block sm" data-ck-save>שמור</button></div>` : ''}
    <div class="note ${stCls}"><b>${esc(stLabel)}</b>${rv.notes.map(n => `<div>${esc(n)}</div>`).join('')}</div>
    ${rv.missing.length ? `<div class="note warn"><b>מה חסר</b><ul style="margin:4px 0;padding-inline-start:18px">${rv.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    ${rv.proposal ? `<div class="card"><h3>הצעה להתאמת יעד</h3><div class="grid2"><div class="card tight"><div class="tiny muted">יעד קודם</div><b>${rv.proposal.from.kcal} קק״ל</b></div><div class="card tight soft"><div class="tiny muted">יעד מוצע</div><b>${rv.proposal.to.kcal} קק״ל</b></div></div>
      <p class="small">${esc(rv.proposal.reason)}</p><label class="field"><span>להחיל מתאריך</span><input class="in" type="date" id="pe" value="${rv.proposal.effectiveFrom}"></label>
      <div class="row"><button class="btn grow" data-apply>אשר שינוי</button><button class="btn plain grow" data-keep>להשאיר כמו שהוא</button></div></div>` : ''}
    ${rv.protein?.recompute ? `<div class="card"><h3>יעד חלבון</h3><p class="small">${esc(rv.protein.recompute.reason)}</p><div class="row"><span class="grow">${rv.protein.recompute.from} ג׳ → <b>${rv.protein.recompute.to} ג׳</b></span><button class="btn sm" data-prot>עדכן</button></div></div>` : ''}
    ${rv.protein?.notes?.length ? `<div class="card"><h3>להגיע לחלבון</h3>${rv.protein.notes.map(n => `<p class="small">${esc(n)}</p>`).join('')}${rv.protein.tips.map((tp, i) => `<div class="row" style="margin:6px 0"><span class="grow small">${esc(tp.text)}</span><button class="btn xs soft" data-tip="${i}">הוסף למחר</button></div>`).join('')}</div>` : ''}
    <details class="how"><summary>על מה מבוססת ההמלצה?</summary>
      <p class="small">כללי האפליקציה: שבוע נכנס להשוואה רק עם ${MIN_WEIGHINS} שקילות לפחות, וממוצע אכילה נחשב מייצג החל מ-${MIN_LOGGED_DAYS} ימים מתועדים במלואם. אלה החלטות תוכנה. הממצאים המחקריים מסומנים בנפרד:</p>
      ${sourcesHtml(rv.sources)}</details>
    <a class="btn block plain" href="#/targets">היעדים והחישוב שלי</a></div>`;
  $$('[data-ck]', el).forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('button', g).forEach(x => x.classList.toggle('on', x === b)); }));
  on(el, '[data-ck-save]', 'click', async () => {
    const v = k => +($(`[data-ck="${k}"] .on`, el)?.dataset.v) || null;
    await save('PUT', '/api/checkins/' + L.start, { hunger: v('hunger'), energy: v('energy'), performance: v('performance') });
    await refresh(); toast('נשמר'); render();
  });
  on(el, '[data-apply]', 'click', async () => {
    const pr = rv.proposal; const eff = $('#pe', el).value || t;
    await save('POST', '/api/targets', { kcal: pr.to.kcal, protein: pr.to.protein, effectiveFrom: eff, source: 'weekly', reason: pr.reason, expectedWeekly: rv.expected });
    await refresh(); toast(`היעד החדש יחול מ-${dmy(eff)}`); render();
  });
  on(el, '[data-keep]', 'click', () => toast('היעד נשאר כמו שהוא'));
  on(el, '[data-prot]', 'click', async () => {
    const cur = targetOn(t);
    await save('POST', '/api/targets', { kcal: cur.kcal, protein: rv.protein.recompute.to, effectiveFrom: t, source: 'protein', reason: rv.protein.recompute.reason });
    await refresh(); toast('יעד החלבון עודכן'); render();
  });
  on(el, '[data-tip]', 'click', async (e, b) => {
    const tp = rv.protein.tips[+b.dataset.tip]; const d = addDays(t, 1);
    await save('POST', '/api/entries', { entries: [{ date: d, meal: tp.slot, foodId: tp.item.foodId, grams: tp.item.grams, unit: tp.item.unit, qty: tp.item.qty, comp: tp.comp, status: 'planned', source: 'tip' }] });
    await refresh(); b.disabled = true; b.textContent = 'נוסף ✓';
  });
});
