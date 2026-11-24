// שקילת בוקר, תיקון שקילה, ממוצע שבועי (ראשון–שבת) וגרף
import { route } from '../app.js';
import { D, refresh, today, profile } from '../data.js';
import { save, del, get } from '../api.js';
import { $, esc, kg, toast, openSheet, on, confirmSheet, sign } from '../ui.js';
import { recentWeeks, compareWeeks, trendLine, uniqueByDate } from '/shared/weights.js';
import { addDays, dmy, dm, hebDay, savedAt, weekStart } from '/shared/dates.js';
import { sourcesHtml } from './targets.js';

/** חלון שקילה: אם כבר יש שקילה לאותו יום — מציע לעדכן */
export function openWeightSheet({ date = today(), onSaved } = {}) {
  const existing = () => D.state.weights.find(w => w.date === d);
  let d = date;
  const s = openSheet({ title: 'שקילת בוקר', body: `<label class="field"><span>תאריך</span><select class="in" id="wd">${[0, 1, 2, 3, 4, 5, 6].map(i => addDays(today(), -i)).map(x => `<option value="${x}" ${x === d ? 'selected' : ''}>${x === today() ? 'היום' : x === addDays(today(), -1) ? 'אתמול' : hebDay(x)} · ${dmy(x)}</option>`).join('')}</select></label>
    <input class="in big" id="wk" inputmode="decimal" placeholder="0.0" aria-label="משקל בק״ג" autocomplete="off"><div id="wex" style="margin-top:8px"></div>
    <p class="small muted" style="margin-top:12px">💡 כדאי להישקל בתנאים דומים: בבוקר, אחרי השירותים ולפני אוכל ושתייה.</p>`, foot: '<button class="btn xl" data-ok>שמור שקילה</button>' });
  const sync = () => { const e = existing(); $('#wex', s.el).innerHTML = e ? `<div class="note warn">כבר רשומה שקילה ל-${dmy(d)}: <b>${kg(e.kg)}</b> ק״ג (נשמרה ${esc(savedAt(e.updatedAt))}). שמירה תעדכן אותה — היא תיספר פעם אחת.</div>` : ''; if (e && !$('#wk', s.el).value) $('#wk', s.el).value = e.kg; };
  $('#wd', s.el).onchange = e => { d = e.target.value; $('#wk', s.el).value = ''; sync(); };
  sync(); setTimeout(() => $('#wk', s.el).focus(), 80);
  on(s.el, '[data-ok]', 'click', async () => {
    const v = +$('#wk', s.el).value.replace(',', '.');
    if (!(v >= 30 && v <= 350)) return toast('הזן משקל בק״ג, למשל 119.8');
    const e = existing();
    if (e && Math.abs(e.kg - v) > 0.001 && !(await confirmSheet('לעדכן שקילה?', `<p>ל-${dmy(d)} כבר רשום <b>${kg(e.kg)}</b> ק״ג. לעדכן ל-<b>${kg(v)}</b>?</p>`, 'עדכן', 'ביטול'))) return;
    const r = await save('PUT', '/api/weights/' + d, { kg: v });
    await refresh(); s.close();
    const wk = recentWeeks(D.state.weights, today(), 1)[0];
    toast(`${r.existed ? 'עודכן' : 'נשמר'}: ${kg(v)} ק״ג. ממוצע השבוע: ${kg(wk.avg)} (${wk.label})`, 3500);
    onSaved?.();
  });
}

function chart(weights, todayISO, goal = null) {
  const pts = trendLine(weights).filter(p => p.date >= addDays(todayISO, -62));
  if (pts.length < 2) return '<div class="empty-state small">הגרף יופיע אחרי שתי שקילות לפחות.</div>';
  const weeks = recentWeeks(weights, todayISO, 10).filter(w => w.avg);
  const W = 340, H = 180, P = 28;
  const xs = pts.map(p => p.date); const x0 = xs[0]; const span = Math.max(1, (Date.parse(todayISO) - Date.parse(x0)) / 864e5);
  const all = [...pts.flatMap(p => [p.kg, p.trend]), ...weeks.map(w => w.avg)];
  const near = goal && Math.min(Math.abs(goal - Math.min(...all)), Math.abs(goal - Math.max(...all))) <= 5; if (near) all.push(goal); // יעד רחוק מכווץ את הגרף — אז הוא מוצג בטקסט
  const lo = Math.floor(Math.min(...all) - 0.5), hi = Math.ceil(Math.max(...all) + 0.5);
  const X = d => P + 8 + ((Date.parse(d) - Date.parse(x0)) / 864e5) / span * (W - 2 * P - 8); // ציר זמן משמאל לימין, כמקובל בגרפים
  const Y = v => H - P - (v - lo) / (hi - lo || 1) * (H - 2 * P);
  const ticks = [lo, (lo + hi) / 2, hi];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="גרף משקל" direction="ltr" style="direction:ltr">
    ${ticks.map(t => `<line class="ax" x1="${P}" x2="${W - P}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tx" x="${P - 4}" y="${Y(t) + 3}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
    ${weeks.map(w => { const a = w.start < x0 ? x0 : w.start; const b = w.end > todayISO ? todayISO : w.end; return `<line class="wk ${w.inProgress ? 'prog' : ''}" x1="${X(a)}" x2="${X(b)}" y1="${Y(w.avg)}" y2="${Y(w.avg)}"/>`; }).join('')}
    ${near ? `<line x1="${P}" x2="${W - P}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="#1f7a3f" stroke-width="1.5" stroke-dasharray="5 4"/><text class="tx" x="${W - P}" y="${Y(goal) - 4}" text-anchor="end">יעד ${goal}</text>` : ''}
    <polyline class="tr" points="${pts.map(p => `${X(p.date)},${Y(p.trend)}`).join(' ')}"/>
    ${pts.map(p => `<circle class="pt" cx="${X(p.date)}" cy="${Y(p.kg)}" r="3"/>`).join('')}
    <text class="tx" x="${X(x0)}" y="${H - 8}" text-anchor="middle">${dm(x0)}</text><text class="tx" x="${X(todayISO)}" y="${H - 8}" text-anchor="middle">${dm(todayISO)}</text>
  </svg><div class="legend"><span><i style="background:var(--brand);height:6px;width:6px;border-radius:9px"></i>שקילה</span><span><i style="background:var(--accent)"></i>מגמה</span><span><i style="background:var(--brand)"></i>ממוצע שבועי</span><span><i style="background:repeating-linear-gradient(90deg,var(--brand) 0 4px,transparent 4px 7px)"></i>שבוע בתהליך</span>${near ? '<span><i style="background:repeating-linear-gradient(90deg,#1f7a3f 0 5px,transparent 5px 9px)"></i>משקל יעד</span>' : goal ? `<span>משקל יעד: ${goal} ק״ג (מתחת לטווח הגרף)</span>` : ''}</div>`;
}

const etaDate = wks => { const d = new Date(); d.setDate(d.getDate() + Math.round(wks * 7)); return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }); };
/** כמה זמן עד משקל היעד (מהיומן הקודם): לפי הקצב האמיתי ולפי 1% / 0.75% / 0.5% בשבוע.
 *  הממוצע והקצב לפי ממוצעי השבוע (ראשון–שבת) של האפליקציה. */
function etaCard(weeks, t) {
  const p = profile(t) || {}; const goal = +p.targetWeight;
  const cur = weeks.find(w => w.avg); const done = weeks.filter(w => !w.inProgress && w.avg);
  if (!goal || !cur) return '';
  const a1 = cur.avg; const lose = goal < a1;
  if ((p.goal !== 'lose' && p.goal !== 'recomp') || !lose) return `<div class="card tight row between"><span>נשאר עד היעד (${kg(goal)} ק״ג)</span><b class="num">${kg(Math.max(0, p.goal === 'gain' ? goal - a1 : a1 - goal))} ק״ג</b></div>`;
  const left = a1 - goal; const c = compareWeeks(done[0], done[1]); const wk = c ? -c.kg : null;
  const now = c == null ? 'צריך עוד שבוע שלם של שקילות כדי להעריך לפי הקצב האמיתי שלך. בינתיים, לפי קצב ירידה:'
    : wk > 0.05 ? `בקצב השבועי שלך עכשיו (−${wk.toFixed(2)} ק״ג בשבוע): כ-${Math.ceil(left / wk)} שבועות, בערך ${etaDate(left / wk)}.`
    : `בקצב השבועי הנוכחי (${wk >= 0 ? '−' : '+'}${Math.abs(wk).toFixed(2)} ק״ג בשבוע) הממוצע לא יורד, ולכן אין זמן הגעה ליעד. ההערכה תופיע כשהממוצע יתחיל לרדת. בינתיים, כך זה נראה לפי קצב ירידה:`;
  const rows = [[1, '1% בשבוע (הכי מהיר שבריא)', false], [0.75, '0.75% בשבוע', true], [0.5, '0.5% בשבוע (איטי ובטוח)', false]].map(([pct, label, main]) => {
    const wks = Math.log(a1 / goal) / -Math.log(1 - pct / 100);
    return `<li class="li${main ? ' main' : ''}"><div class="m"><b>${label}</b><small>~${Math.round(a1 * pct) / 100} ק״ג בשבוע</small></div><div class="a"><b class="num">כ-${Math.ceil(wks)} שבועות</b><br><span class="tiny">${etaDate(wks)}</span></div></li>`;
  }).join('');
  return `<div class="card"><h3>כמה זמן עד ${kg(goal)} · נשארו ${left.toFixed(1)} ק״ג</h3>
    <p class="small ${c != null && !(wk > 0.05) ? 'note warn' : ''}">${now}</p><ul class="list">${rows}</ul>
    <p class="tiny muted">החישוב לפי ממוצע השבוע האחרון (${kg(a1)} ק״ג, ${esc(cur.label)}) והשינוי בין שני השבועות המלאים האחרונים. מתעדכן לבד בכל שקילה.</p></div>`;
}

route('weight', async (el) => {
  const t = today();
  const weeks = recentWeeks(D.state.weights, t, 8);
  const list = uniqueByDate(D.state.weights).reverse();
  const done = weeks.filter(w => !w.inProgress && w.n);
  el.innerHTML = `<div class="stack"><div class="top"><h1>שקילה</h1></div>
    <button class="btn block xl" data-weigh>⚖️ ${list[0]?.date === t ? `שקלת היום ${kg(list[0].kg)} · עדכון` : 'רשום שקילת בוקר'}</button>
    <div class="card chart"><h3>המשקל שלך</h3>${chart(D.state.weights, t, +profile(t)?.targetWeight || null)}</div>
    ${etaCard(weeks, t)}
    <div class="card"><h3>ממוצעים שבועיים (ראשון–שבת)</h3>
      <ul class="list">${weeks.filter(w => w.n || w.inProgress).map(w => { const i = done.indexOf(w); const c = i >= 0 ? compareWeeks(w, done[i + 1]) : null;
        return `<li class="li"><div class="m"><b>${dm(w.start)}–${dm(w.end)} ${w.inProgress ? '<span class="pill">שבוע בתהליך</span>' : ''}</b><small>${esc(w.label)}${w.n ? ` · סכום ${w.sum} ÷ ${w.n}` : ''}</small></div><div class="a"><b class="num" style="color:var(--ink);font-size:17px">${w.avg ? kg(w.avg) : '—'}</b>${c ? `<br><span class="num">${sign(c.kg)} ק״ג (${sign(c.pct)}%)</span>` : w.inProgress ? '<br><span class="tiny">יושווה בסוף השבוע</span>' : ''}</div></li>`; }).join('') || '<li class="empty-state">עוד אין שקילות.</li>'}</ul>
      <details class="how"><summary>איך מחושב הממוצע?</summary>${sourcesHtml(['dec_weekavg', 'dec_weighing'])}</details></div>
    <div class="card"><h3>כל השקילות</h3><ul class="list">${list.slice(0, 60).map(w => `<li class="li" data-w="${w.date}"><div class="m"><b>${hebDay(w.date)} ${dmy(w.date)}</b><small>נשמר ${esc(savedAt(w.updatedAt))}${w.createdAt !== w.updatedAt ? ' · תוקן' : ''}</small></div><div class="a"><b class="num" style="color:var(--ink)">${kg(w.kg)}</b> ק״ג</div></li>`).join('')}</ul></div></div>`;
  const redraw = async () => { await refresh(); location.hash === '#/weight' && (await import('../app.js')).render(); };
  on(el, '[data-weigh]', 'click', () => openWeightSheet({ onSaved: redraw }));
  on(el, '[data-w]', 'click', (e, li) => {
    const w = D.state.weights.find(x => x.date === li.dataset.w);
    const s = openSheet({ title: `שקילה ${dmy(w.date)}`, body: `<input class="in big" id="ek" inputmode="decimal" aria-label="משקל בק״ג" value="${w.kg}"><p class="saved">נוצר ${esc(savedAt(w.createdAt))} · עודכן ${esc(savedAt(w.updatedAt))}</p><div id="wh"></div>`, foot: '<button class="btn danger" data-del>מחק</button><button class="btn" data-ok>שמור תיקון</button>' });
    get('/api/weights/' + w.date + '/history').then(h => { $('#wh', s.el).innerHTML = h.length > 1 ? `<div class="small muted">היסטוריה: ${h.map(x => `${x.after ? x.after.kg : 'נמחק'} (${esc(savedAt(x.at))})`).join(' ← ')}</div>` : ''; }).catch(() => {});
    on(s.el, '[data-ok]', 'click', async () => { const v = +$('#ek', s.el).value.replace(',', '.'); if (!(v >= 30 && v <= 350)) return toast('משקל לא תקין'); await save('PUT', '/api/weights/' + w.date, { kg: v }); s.close(); toast('השקילה תוקנה — נספרת פעם אחת'); redraw(); });
    on(s.el, '[data-del]', 'click', async () => { if (!(await confirmSheet('למחוק שקילה?', `<p>${dmy(w.date)}: ${kg(w.kg)} ק״ג</p>`, 'מחק'))) return; await del('/api/weights/' + w.date); s.close(); toast('נמחק'); redraw(); });
  });
});
