// ״איחוד שורות״ בפיצול: שורה אחת לכל לקוח, עם פירוט החובות.
// כל חוב נשאר שורה שמורה משלו (עם הגובה, השעה וההערה שלו), ורק מסומן במזהה קבוצה משותף (mg).
// לכן הסכום של כל גובה, סך הפיצול, ההעברה לאיסוף והוואטסאפ לא משתנים — ולחיצה נוספת לא מחברת סכומים פעמיים.
// זיהוי לקוח: מזהה לקוח (cid) אם יש; אחרת שם מלא אחרי ניקוי רווחים ואיחוד צורות של גרש/גרשיים.
// שם זהה עם מזהים שונים או שני טלפונים תקינים ושונים — שואלים לפני איחוד.
import { num, r2, sum } from './calc.js';
import { normPhone } from './phone.js';

export const nameKey = (s) => String(s == null ? '' : s).replace(/[‎‏"'׳״`´‘’“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const idKey = (r) => r.cid ? 'id:' + String(r.cid).trim() : (nameKey(r.n) ? 'n:' + nameKey(r.n) : '');
const newMg = () => 'g' + Math.random().toString(36).slice(2, 10);

// קבוצות לפי שם (ולפי מזהה כשיש). מחזיר [{key, name, rows, ids, phones, conflict, changed}]
export function findGroups(records) {
  const byName = new Map();
  for (const r of records || []) {
    if (!r || !nameKey(r.n)) continue;
    const k = nameKey(r.n); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(r);
  }
  const out = [];
  for (const [k, rows] of byName) {
    if (rows.length < 2) continue;
    const ids = [...new Set(rows.map(r => r.cid ? String(r.cid).trim() : '').filter(Boolean))];
    const phones = [...new Set(rows.map(r => normPhone(r.ph)).filter(Boolean))];
    const mgs = new Set(rows.map(r => r.mg || ''));
    const changed = mgs.size > 1 || mgs.has('');
    out.push({ key: k + '|' + phones.slice().sort().join(',') + '|' + ids.slice().sort().join(','), name: String(rows[0].n).trim(), rows, ids, phones, conflict: ids.length > 1 || phones.length > 1, changed });
  }
  return out;
}

// מבצע את האיחוד על state (רשומות הפיצול שבעריכה). decide(conflicts) => Promise<Set(keys שאושרו כאותו אדם)>
export async function mergeSplit(state, decide) {
  const groups = findGroups(state.records).filter(g => g.changed);
  const same = new Set(state.mgSame || []), diff = new Set(state.mgDiff || []);
  const ask = groups.filter(g => g.conflict && !same.has(g.key) && !diff.has(g.key));
  if (ask.length) {
    const ok = await decide(ask); if (ok === null) return { cancelled: true };
    for (const g of ask) (ok.has(g.key) ? same : diff).add(g.key);
    state.mgSame = [...same]; state.mgDiff = [...diff];
  }
  const done = [], skipped = [];
  for (const g of groups) {
    if (g.conflict && !same.has(g.key)) { skipped.push(g); continue; }
    const mg = (g.rows.find(r => r.mg) || {}).mg || newMg();
    g.rows.forEach(r => { r.mg = mg; });
    done.push({ name: g.name, n: g.rows.length, total: r2(sum(g.rows.map(r => num(r.a)))) });
  }
  // הקבוצות נשמרות צמודות ברשימה (לפי מקום החוב הראשון), כדי שבעריכה ובאקסל הן יופיעו יחד
  const pos = new Map(); state.records.forEach((r, i) => { if (r && r.mg && !pos.has(r.mg)) pos.set(r.mg, i); });
  state.records = state.records.map((r, i) => ({ r, i, p: r && r.mg ? pos.get(r.mg) : i })).sort((x, y) => x.p - y.p || x.i - y.i).map(x => x.r);
  return { done, skipped };
}

export function unmerge(state, mg) { (state.records || []).forEach(r => { if (r && r.mg === mg) delete r.mg; }); }

// מספר הלקוחות = שורות מאוחדות (קבוצה = לקוח אחד)
export function customerCount(records) {
  const seen = new Set(); let n = 0;
  for (const r of records || []) { if (!r || !(r.n || r.a)) continue; if (r.mg) { if (seen.has(r.mg)) continue; seen.add(r.mg); } n++; }
  return n;
}
// קבוצות פעילות (2 חובות ומעלה) לפי mg
export function mgGroups(records) {
  const m = new Map(); (records || []).forEach(r => { if (r && r.mg) { if (!m.has(r.mg)) m.set(r.mg, []); m.get(r.mg).push(r); } });
  for (const [k, v] of m) if (v.length < 2) m.delete(k);
  return m;
}
export const mgTotal = (rows) => r2(sum(rows.map(r => num(r.a))));

// ---- ״איחוד חובות לפי לווה״ (מסך הפיצול) ----
// מזהה לווה: מזהה לקוח (cid) אם יש לכל השורות. שם בלבד = ״לפי שם״ — מוצג לאישור, לא מאוחד לבד.
// ספק (טלפונים תקינים שונים / מזהים שונים) — דורש סימון ידני ״זה אותו לווה — אחד שורות״.
export function borrowerCandidates(records) {
  return findGroups(records).filter(g => g.changed).map(g => {
    const allIds = g.rows.every(r => r.cid) && g.ids.length === 1;
    return { ...g, level: g.conflict ? 'doubt' : (allIds ? 'id' : 'name'), total: mgTotal(g.rows) };
  });
}
export function applyMerge(groups) {
  const done = [];
  for (const g of groups) { const mg = (g.rows.find(r => r.mg) || {}).mg || newMg(); g.rows.forEach(r => { r.mg = mg; }); done.push({ name: g.name, n: g.rows.length, total: g.total }); }
  return done;
}
export const partStatus = (r) => r.xd ? 'הועבר לאיסוף' : r.side ? 'לא נגבה היום' : r.na ? 'לא ענו' : (r.t ? 'לאסוף' : 'ממתין');

// הערות אוטומטיות ללווה מאוחד: סכום לכל גובה (שם הגובה בדיוק כפי שנכתב — ״אושר״ ו״אושר 2״ נשארים נפרדים)
export function byCollector(rows) {
  const m = new Map();
  for (const r of rows || []) { const c = String(r.c || '').trim() || 'ללא גובה'; m.set(c, r2((m.get(c) || 0) + num(r.a))); }
  return [...m.entries()].map(([c, a]) => ({ c, a }));
}
const fmtN = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const collNotes = (rows) => byCollector(rows).map(x => `${x.c} ${fmtN(x.a)} ₪`).join(' | ');
export const collShare = (rows, c) => r2(sum((rows || []).filter(r => String(r.c || '').trim() === String(c || '').trim()).map(r => num(r.a))));
