// ״שורה אחת לכל לקוח״ בפיצול: כל שורות החוב של אותו לקוח בחשבון מתאחדות לשורת גבייה אחת עם הסכום הכולל (cons),
// והשורות המקוריות נשמרות בפירוט (src: סכום, הגובה שהופיע באקסל, הערה). לקוח שהופיע אצל כמה גובים נכנס ל״ללא גובה״
// עד שבוחרים גובה; לקוח שכל השורות שלו אצל אותו גובה נשאר אצלו. הבחירה נשמרת (consC) גם לייבוא חוזר של אותו קובץ.
// זיהוי: מזהה לקוח (cid) כשקיים; אחרת שם מלא מנוקה. אותו שם עם מזהים שונים או טלפונים תקינים שונים — שואלים לפני איחוד.
import { num, r2, sum, isSagi } from './calc.js';
import { normPhone } from './phone.js';
import { nameKey } from './split-merge.js';

export const consKey = (r) => r && r.cid ? 'id:' + String(r.cid).trim() : 'n:' + nameKey(r && r.n);
const eligible = (r) => r && nameKey(r.n) && !r.side && !r.pg && !r.xd && !isSagi(r.n);
const srcOf = (r) => r.cons && Array.isArray(r.src) ? r.src : [{ a: r2(num(r.a)), c: String(r.c || '').trim(), note: String(r.note || '').trim(), ...(r.ph ? { ph: r.ph } : {}), ...(r.h ? { h: r.h } : {}) }];
const newK = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// קבוצות של שורות שאפשר לאחד. key = לפי שם + הטלפונים/המזהים, כדי שהחלטה ״אותו אדם / לא״ תישמר לאותו מצב בלבד
export function consGroups(records) {
  const byName = new Map();
  for (const r of records || []) { if (!eligible(r)) continue; const k = nameKey(r.n); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(r); }
  const out = [];
  const mk = (k, rows, conflict) => {
    const ids = [...new Set(rows.map(r => r.cid ? String(r.cid).trim() : '').filter(Boolean))];
    const phones = [...new Set(rows.flatMap(r => [r.ph].concat(srcOf(r).map(x => x.ph))).map(normPhone).filter(Boolean))];
    out.push({ key: 'c|' + k + '|' + phones.slice().sort().join(',') + '|' + ids.slice().sort().join(',') + '|' + rows.length, name: String(rows[0].n).trim(), rows, parts: rows.flatMap(srcOf), ids, phones, conflict: conflict || (!ids.length && phones.length > 1) });
  };
  for (const [k, rows] of byName) {
    // מזהה לקוח קובע: שורות עם אותו מזהה הן אותו לקוח (בלי לשאול); שורות בלי מזהה לצד מזהה אחד — שואלים; לצד כמה מזהים — לא ודאי
    const byId = new Map(), noId = [];
    rows.forEach(r => { const id = r.cid ? String(r.cid).trim() : ''; if (!id) noId.push(r); else { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(r); } });
    for (const g of byId.values()) if (g.length >= 2 && !(noId.length && byId.size === 1)) mk(k, g, false);
    if (noId.length && byId.size === 1) { const g = noId.concat([...byId.values()][0]); if (g.length >= 2) mk(k, g, true); }
    else if (noId.length >= 2) mk(k, noId, byId.size > 1);
  }
  return out;
}

// איחוד (סינכרוני). opts: same/diff = החלטות קודמות, consC = הגובה שנבחר לכל לקוח. מחזיר גם ask = קבוצות שצריך לשאול עליהן
export function consolidate(records, { same = new Set(), diff = new Set(), consC = {} } = {}) {
  const groups = consGroups(records), ask = [], done = [], skipped = [];
  const replace = new Map(); // השורה הראשונה של הקבוצה → השורה המאוחדת; שאר השורות יוצאות
  const drop = new Set();
  for (const g of groups) {
    if (g.conflict && !same.has(g.key)) { (diff.has(g.key) ? skipped : ask).push(g); continue; }
    const base = g.rows.find(r => r.cons) || g.rows[0];
    const src = g.parts.map(x => ({ ...x }));
    const colls = [...new Set(src.map(x => x.c))];
    const key = consKey(base);
    let c;
    if (base.cons) c = String(base.c || '').trim();
    else if (consC[key] !== undefined) c = consC[key];
    else c = colls.length === 1 ? colls[0] : '';
    const notes = [...new Set(src.map(x => x.note).filter(Boolean))];
    const rec = { ...base, n: String(base.n).trim(), a: r2(sum(src.map(x => num(x.a)))), c, cons: 1, src, cnt: src.length };
    if (!rec._k) rec._k = newK();
    delete rec.mg; delete rec.byPhone;
    rec.ph = base.ph || (g.rows.find(r => r.ph) || {}).ph || (src.find(x => x.ph) || {}).ph || '';
    if (src.some(x => x.h === 'קשה') || g.rows.some(r => r.h === 'קשה')) rec.h = 'קשה';
    if (!rec.t) { const t = g.rows.map(r => r.t).filter(Boolean).sort()[0]; if (t) rec.t = t; }
    if (g.rows.some(r => r.na) && g.rows.every(r => r.na || !r.t)) rec.na = true;
    if (!base.cons) { rec.note = ''; if (notes.length) rec.gnote = notes.join(' · '); else delete rec.gnote; } // הערות האקסל — הערה כללית לשורה (מופיעה גם באיסוף ולגובה)
    replace.set(g.rows[0], rec); g.rows.slice(1).forEach(r => drop.add(r));
    done.push({ name: rec.n, n: src.length, total: rec.a, c, multi: colls.length > 1 });
  }
  const recs = []; for (const r of records || []) { if (drop.has(r)) continue; recs.push(replace.get(r) || r); }
  return { recs, ask, done, skipped };
}
// עם שאלה על מקרי ספק. decide(groups) => Promise<Set(keys שאושרו כאותו אדם) | null>
export async function consolidateAsk(state, decide, records) {
  const same = new Set(state.mgSame || []), diff = new Set(state.mgDiff || []);
  let res = consolidate(records, { same, diff, consC: state.consC || {} });
  if (res.ask.length) {
    const ok = await decide(res.ask); if (ok === null) return { cancelled: true };
    res.ask.forEach(g => (ok.has(g.key) ? same : diff).add(g.key));
    state.mgSame = [...same]; state.mgDiff = [...diff];
    res = consolidate(records, { same, diff, consC: state.consC || {} });
  }
  return res;
}
// בחירת גובה בשורה מאוחדת — נשמרת לחשבון, כדי שייבוא חוזר של אותו קובץ יחזיר אותה
export function rememberColl(state, r) { if (!r || !r.cons) return; (state.consC ||= {})[consKey(r)] = String(r.c || '').trim(); }
