// הערות מהפיצול לאיסוף היומי ולרשימה שנשלחת לגובה.
// כל שורה באיסוף שהגיעה מהפיצול מקושרת לשורת המקור (sid + spl). בכל פתיחה של האיסוף ההערות נקראות מחדש מהפיצול
// (כולל שורות שהועברו ויצאו מהפיצול — xstash), כך שהוספה / שינוי / מחיקה של הערה בפיצול מתעדכנים בלי להעביר שוב.
// מה מוצג: הערה כללית (gnote — לכל חלקי חוב שפוצל) + ההערה של השורה עצמה; בחובות מאוחדים (mg) — כל הערות הלקוח, כל הערה פעם אחת.
import { normName, num, r2 } from '../public/js/calc.js';

const recsOf = (d) => (d.records || []).concat(d.xstash || []).filter(Boolean);
export function notesFor(splitData, r) {
  const out = []; const add = (v) => { const t = String(v == null ? '' : v).trim(); if (t && !out.includes(t)) out.push(t); };
  add(r.gnote); add(r.note);
  if (r.mg) for (const x of recsOf(splitData)) if (x !== r && x.mg === r.mg) { add(x.gnote); add(x.note); }
  return out;
}
export function findRec(splitData, sid) { const k = String(sid || '').replace('#g', ''); return k ? recsOf(splitData).find(x => x._k === k) || null : null; }

// מוסיף לכל שורה באיסוף _notes (לתצוגה בלבד — לא נשמר)
export function attachNotes(listDocs, a) {
  if (!a || a.kind !== 'work' || !Array.isArray(a.entries)) return;
  const splits = listDocs('accounts').filter(x => x.data.kind === 'split' && x.data.date === a.date);
  const byId = new Map(splits.map(s => [s.id, s]));
  const used = new Set();
  for (const e of a.entries) {
    if (!e) continue;
    let rec = null, sp = null;
    if (e.sid) for (const s of (e.spl && byId.get(e.spl) ? [byId.get(e.spl)] : splits)) { const r = findRec(s.data, e.sid); if (r) { rec = r; sp = s; break; } }
    if (rec && !(sp.data.records || []).includes(rec)) { const live = (sp.data.records || []).find(r => r && normName(r.n) === normName(e.n) && r2(num(r.a)) === r2(num(e.a))); if (live) rec = live; }
    if (!rec && String(e.n || '').trim()) { // שורות ישנות בלי קישור: אותו שם ואותו סכום בפיצול של אותו יום
      outer: for (const s of splits) for (const r of recsOf(s.data)) { const k = s.id + ':' + r._k; if (used.has(k)) continue; if (normName(r.n) === normName(e.n) && r2(num(r.a)) === r2(num(e.a))) { rec = r; sp = s; used.add(k); break outer; } }
    }
    const lines = rec ? notesFor(sp.data, rec) : (Array.isArray(e.sn) ? e.sn : []);
    if (lines.length) e._notes = lines; else delete e._notes;
  }
}
