// דוח התאמה: אותם חישובים בדיוק (מהתוכנה המקורית) על הנתונים שבגיבוי ועל הנתונים שבמסד החדש
import { db } from './db.js';
import { calcMorning, calcCollectors, calcSplit, workGroups, calcWork, wExpList, lnSum, r2, sum, normName, prevMorning } from '../public/js/calc.js';
import { normPhone } from '../public/js/phone.js';

const strip = (d) => {
  const c = structuredClone(d);
  for (const f of ['rows', 'entries', 'records', 'expenses', 'loans']) if (Array.isArray(c[f])) c[f].forEach(r => { if (r && typeof r === 'object') delete r._k; });
  return c;
};

export function metrics(cols, files) {
  const acc = (cols.accounts || []).map(x => ({ id: x.id, ...strip(x.d) }));
  const by = (k) => acc.filter(a => a.kind === k);
  const m = {};
  m.counts = {
    'חשבונות בוקר': by('morning').length, 'פיצולים': by('split').length, 'חשבונות גובים': by('collectors').length, 'איסופי יום': by('work').length,
    'שורות גבייה בחשבונות בוקר': by('morning').reduce((t, a) => t + (a.rows || []).length, 0),
    'הלוואות שיצאו (בחשבונות בוקר)': by('morning').reduce((t, a) => t + (a.loans || []).length, 0),
    'שורות חוב בחשבון גובים': by('collectors').reduce((t, a) => t + (a.entries || []).filter(e => e.k !== 'e').length, 0),
    'שורות הוצאה בחשבון גובים': by('collectors').reduce((t, a) => t + (a.entries || []).filter(e => e.k === 'e').length, 0),
    'שורות פיצול': by('split').reduce((t, a) => t + (a.records || []).length, 0),
    'שורות איסוף': by('work').reduce((t, a) => t + (a.entries || []).length, 0),
    'הוצאות באיסוף יום': by('work').reduce((t, a) => t + (a.expenses || []).length, 0),
    'כרטיסי לקוח': (cols.clients || []).length, 'הלוואות (לוח סילוקין)': (cols.loans || []).length,
    'בקשות להלוואה': (cols.loan_requests || []).length, 'חוזים': (cols.contracts || []).length,
    'קבצי חוזים במסד': (cols.contract_files || []).length, 'הגדרות וטיוטות': (cols.settings || []).length,
    'זיכויים': 0, 'שותפים': 0,
  };
  // סכומים
  const ms = by('morning').map(a => ({ a, c: calcMorning(a) })).sort((x, y) => x.a.date.localeCompare(y.a.date) || (x.a.createdAt || 0) - (y.a.createdAt || 0));
  const coll = by('collectors').map(a => calcCollectors(a.entries || []));
  const wk = by('work').map(a => { const g = workGroups(a.entries, wExpList(a)); const c = calcWork((a.entries || []).filter(e => e && (e.n || e.a))); const ex = sum(wExpList(a).map(x => x.a)); return { c, ex, g }; });
  const sp = by('split').map(a => calcSplit(a.records || []));
  const loans = (cols.loans || []).map(x => lnSum({ id: x.id, ...x.d })).filter(Boolean);
  m.sums = {
    'קרן פתיחה (חשבון הבוקר הראשון)': ms.length ? ms[0].c.keren : 0,
    'קרן סופית (חשבון הבוקר האחרון)': ms.length ? ms[ms.length - 1].c.final : 0,
    'סה״כ ריבית שנגבתה (בוקר)': sum(ms.map(x => x.c.interest)),
    'סה״כ קרן שנגבתה (בוקר)': sum(ms.map(x => x.c.principal)),
    'חלק רובי (בוקר)': sum(ms.map(x => x.c.robi)), 'חלק הקו (בוקר)': sum(ms.map(x => x.c.line)),
    'משלוחים (בוקר)': sum(ms.map(x => x.c.courier)), 'הלוואות שיצאו (בוקר)': sum(ms.map(x => x.c.loansTotal)),
    'בדיקת שלמות: סכום הקרנות הסופיות של כל החשבונות (לא יתרה)': sum(ms.map(x => x.c.final)),
    'חובות בחשבון גובים': sum(coll.map(c => c.totalDebts)), 'הוצאות בחשבון גובים': sum(coll.map(c => c.totalExp)), 'נטו בחשבון גובים': sum(coll.map(c => c.totalNet)),
    'צפוי לגבייה (איסוף יום)': sum(wk.map(x => x.c.total)), 'נגבה בפועל (איסוף יום)': sum(wk.map(x => x.c.gotTotal)),
    'נשאר לגבייה (איסוף יום)': sum(wk.map(x => x.c.left)), 'הוצאות (איסוף יום)': sum(wk.map(x => x.ex)),
    'יתרות בפיצולים (גובים)': sum(sp.map(s => s.grand)), 'יתרות בפיצולים (כולל צד/לשנות/ללא גובה)': sum(sp.map(s => s.all)),
    'יתרת קרן בהלוואות': sum(loans.map(l => l.remain)), 'זיכויים': 0,
  };
  // לקוחות וטלפונים שנמצאו בכל הנתונים
  const names = new Set(), phones = new Set();
  for (const a of acc) for (const r of [...(a.rows || []), ...(a.entries || []), ...(a.records || [])]) {
    if (r && r.k !== 'e' && r.n) names.add(normName(r.n));
    const p = normPhone(r && (r.ph || r.p)); if (p) phones.add(p);
  }
  for (const c of cols.clients || []) { names.add(normName(c.d.name)); const p = normPhone(c.d.phone); if (p) phones.add(p); }
  m.counts['לקוחות שונים (לפי שם)'] = names.size; m.counts['מספרי טלפון שונים'] = phones.size;
  // קבצים שהמסמכים מפנים אליהם
  const refs = [];
  for (const c of cols.contracts || []) {
    const d = c.d || {};
    for (const [k, v] of Object.entries(d.gs || {})) if (typeof v === 'string' && /drive\.google\.com/.test(v)) refs.push({ owner: 'contracts/' + c.id, field: k, sourceId: (v.match(/\/d\/([^/]+)/) || [])[1] });
    for (const [i, im] of (d.idImgs || []).entries()) if (im.assetId) refs.push({ owner: 'contracts/' + c.id, field: `idImgs[${i}]`, sourceId: im.assetId });
    if (d.pdfId) refs.push({ owner: 'contracts/' + c.id, field: 'pdfId', sourceId: d.pdfId });
  }
  const have = new Set((files || []).map(f => f.sourceId || f.source_id));
  m.files = { referenced: refs.length, present: refs.filter(r => have.has(r.sourceId)).length, missing: refs.filter(r => !have.has(r.sourceId)) };
  m.counts['קבצים מצורפים'] = (files || []).length;
  // שרשרת הקרן: הקרן ההתחלתית נרשמת פעם אחת, כל חשבון ממשיך מהקרן הסופית של הקודם
  const all = by('morning');
  m.chain = ms.map(({ a, c }) => { const p = prevMorning(all, a.date, a.id); return { id: a.id, date: a.date, keren: c.keren, final: c.final, prevFinal: p ? p.final : null, diff: p ? r2(c.keren - p.final) : null, stored: a.finalKeren ?? null, storedOk: a.finalKeren == null ? null : r2(a.finalKeren) === c.final }; });
  return m;
}

export function dbCols() {
  const cols = {};
  for (const r of db.prepare('SELECT col,id,data FROM docs WHERE deleted=0').all()) (cols[r.col] ||= []).push({ id: r.id, d: JSON.parse(r.data) });
  return cols;
}
export function dbFiles() { return db.prepare('SELECT source_id AS sourceId, name, sha256, size FROM files').all(); }

export function reconcile(backup) {
  const before = metrics(backup.collections, backup.files);
  const after = metrics(dbCols(), dbFiles());
  const diffs = [];
  for (const sec of ['counts', 'sums']) for (const k of Object.keys(before[sec])) {
    const b = before[sec][k], a = after[sec][k];
    if (r2(+b || 0) !== r2(+a || 0)) diffs.push({ what: k, before: b, after: a, diff: r2((+a || 0) - (+b || 0)) });
  }
  return { before, after, diffs, ok: diffs.length === 0 && after.files.missing.length === 0 };
}
