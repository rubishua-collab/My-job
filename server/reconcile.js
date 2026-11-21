// דוח התאמה: אותם חישובים בדיוק (מהתוכנה המקורית) על הנתונים שבגיבוי ועל הנתונים שבמסד החדש
import { db } from './db.js';
import { calcMorning, calcCollectors, calcSplit, workGroups, calcWork, wExpList, lnSum, r2, sum, num, normName, prevMorning, collKey, cleanColl, CHANGE, NOC_SP } from '../public/js/calc.js';
import { clientIndex } from './data.js';
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
  m.detail = detail(acc);
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

// ---- פירוט לפי תאריך ולפי גובה (אותן נוסחאות מ-calc.js). משמש להשוואה בין המקור לאפליקציה ----
const rowsOf = (a) => ['rows', 'entries', 'records', 'expenses', 'loans'].reduce((t, f) => t + (Array.isArray(a[f]) ? a[f].length : 0), 0);
const z = () => ({ rows: 0, docs: [], morning: { n: 0, keren: 0, final: 0 }, coll: { gross: 0, exp: 0, net: 0 }, work: { expected: 0, got: 0, exp: 0, net: 0 }, split: { grand: 0, all: 0 } });
const zc = () => ({ rows: 0, coll: { gross: 0, exp: 0, net: 0 }, work: { expected: 0, got: 0, exp: 0, net: 0 }, split: { total: 0 } });
export function detail(acc) {
  const perDate = {}, perColl = {};
  const add = (o, k, v) => { o[k] = r2((o[k] || 0) + (+v || 0)); };
  const pc = (date, name) => { const c = cleanColl(name) || NOC_SP; const key = date + '|' + collKey(c); return perColl[key] ||= { date, c, ...zc() }; };
  for (const a of acc) {
    if (!a || !a.kind) continue;
    const d = perDate[a.date || ''] ||= z(); d.docs.push(a.id); d.rows += rowsOf(a);
    if (a.kind === 'morning') { const c = calcMorning(a); d.morning.n++; add(d.morning, 'keren', c.keren); add(d.morning, 'final', c.final); }
    else if (a.kind === 'collectors') {
      const c = calcCollectors(a.entries || []); add(d.coll, 'gross', c.totalDebts); add(d.coll, 'exp', c.totalExp); add(d.coll, 'net', c.totalNet);
      for (const g of c.groups) { const x = pc(a.date, g.c); x.rows += g.debts.length + g.exps.length; add(x.coll, 'gross', g.debtTotal); add(x.coll, 'exp', g.expTotal); add(x.coll, 'net', g.net); }
    } else if (a.kind === 'work') {
      const es = (a.entries || []).filter(e => e && (e.n || e.a)), xs = wExpList(a), c = calcWork(es), ex = sum(xs.map(x => x.a));
      add(d.work, 'expected', c.total); add(d.work, 'got', c.gotTotal); add(d.work, 'exp', ex); add(d.work, 'net', r2(c.total - ex));
      for (const g of workGroups(es, xs) || [{ name: NOC_SP, calc: c, exp: xs, expTotal: ex, net: r2(c.total - ex) }]) { const x = pc(a.date, g.name); x.rows += g.calc.count + g.exp.length; add(x.work, 'expected', g.calc.total); add(x.work, 'got', g.calc.gotTotal); add(x.work, 'exp', g.expTotal); add(x.work, 'net', g.net); }
    } else if (a.kind === 'split') {
      const c = calcSplit(a.records || []); add(d.split, 'grand', c.grand); add(d.split, 'all', c.all);
      for (const b of c.blocks) { const x = pc(a.date, b.c === CHANGE ? CHANGE : b.c); x.rows += b.count; add(x.split, 'total', b.total); }
    }
  }
  return { perDate, perColl };
}
const flat = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => k === 'docs' || k === 'date' || k === 'c' ? [] : (v && typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, +v || 0]]));
const differs = (b, a) => { const fb = Object.fromEntries(flat(b)), fa = Object.fromEntries(flat(a)); return [...new Set([...Object.keys(fb), ...Object.keys(fa)])].filter(k => r2(fb[k] || 0) !== r2(fa[k] || 0)); };

// המצב של כל חשבון כפי שיובא: מסמך שלא נגעו בו — כמו שהוא; מסמך שנערך — הגרסה שלפני העריכה הראשונה (מיומן השינויים)
export function importedAccounts() {
  const out = [];
  const first = db.prepare("SELECT before FROM audit WHERE col='accounts' AND doc_id=? AND before IS NOT NULL ORDER BY id LIMIT 20");
  for (const r of db.prepare("SELECT id,data,version,updated_by FROM docs WHERE col='accounts' AND source_hash IS NOT NULL").all()) {
    let d = null;
    if (r.version === 1 && r.updated_by === 'ייבוא') d = JSON.parse(r.data);
    else for (const x of first.all(r.id)) { try { const o = JSON.parse(x.before); if (o && o.kind) { d = o; break; } } catch { /* */ } }
    if (d) out.push({ id: r.id, ...strip(d) });
  }
  return out;
}
// מסמכים שנערכו, נמחקו או נוספו אחרי ההעברה
export function editedSince() {
  return new Set(db.prepare("SELECT id FROM docs WHERE col='accounts' AND (source_hash IS NULL OR version>1 OR deleted=1 OR COALESCE(updated_by,'')<>'ייבוא')").all().map(r => r.id));
}

export function compareMigration() {
  const run = db.prepare('SELECT at,report FROM import_runs ORDER BY at DESC').all().map(x => ({ at: x.at, report: JSON.parse(x.report) })).find(x => x.report?.reconcile?.before?.detail);
  const before = run ? run.report.reconcile.before.detail : detail(importedAccounts());
  const after = detail(dbCols().accounts?.map(x => ({ id: x.id, ...strip(x.d) })) || []);
  const edited = editedSince();
  const dates = [...new Set([...Object.keys(before.perDate), ...Object.keys(after.perDate)])].sort().reverse().map(date => {
    const b = before.perDate[date] || z(), a = after.perDate[date] || z();
    const fields = differs(b, a); const ids = new Set([...(b.docs || []), ...(a.docs || [])]);
    const ed = [...ids].filter(id => edited.has(id));
    return { date, before: b, after: a, fields, edited: ed, status: !fields.length ? 'ok' : ed.length ? 'edited' : 'mismatch' };
  });
  const colls = [...new Set([...Object.keys(before.perColl), ...Object.keys(after.perColl)])].map(k => {
    const b = before.perColl[k] || { ...zc(), date: after.perColl[k].date, c: after.perColl[k].c }, a = after.perColl[k] || { ...zc(), date: b.date, c: b.c };
    const fields = differs(b, a); const dd = dates.find(x => x.date === b.date);
    return { date: b.date, c: b.c || a.c, before: b, after: a, fields, status: !fields.length ? 'ok' : (dd && dd.edited.length ? 'edited' : 'mismatch') };
  }).sort((x, y) => y.date.localeCompare(x.date) || String(x.c).localeCompare(String(y.c), 'he'));
  return { baseline: run ? { kind: 'file', at: run.at, source: run.report.source } : { kind: 'db' }, dates, colls,
    counts: { dates: dates.length, ok: dates.filter(x => x.status === 'ok').length, edited: dates.filter(x => x.status === 'edited').length, mismatch: dates.filter(x => x.status === 'mismatch').length, collMismatch: colls.filter(x => x.status === 'mismatch').length },
    duplicates: duplicates() };
}

// ---- ״לבדיקה״: כפילויות אפשריות. דוח בלבד — שום דבר לא מאוחד אוטומטית ----
export function duplicates() {
  const I = clientIndex();
  const namePhones = [...I.byName.values()].filter(c => c.phones.size > 1).map(c => ({ key: c.nk, name: c.name, phones: [...c.phones] })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const phoneNames = [...I.byPhone.entries()].filter(([, s]) => s.size > 1).map(([p, s]) => ({ phone: p, names: [...s].map(k => ({ key: k, name: I.byName.get(k)?.name || k })) }));
  const g = new Map();
  for (const r of I.rows) {
    if (r.exp || !r.nk || !['morning', 'collectors', 'split', 'work'].includes(r.kind) || r.what === 'הלוואה שיצאה' || !num(r.amount)) continue;
    const k = [r.date, r.kind, r.nk, r2(num(r.amount))].join('|');
    if (!g.has(k)) g.set(k, []); g.get(k).push(r);
  }
  const KN = { morning: 'חשבון בוקר', collectors: 'חשבון גובים', split: 'פיצול', work: 'איסוף יום' };
  const sameDay = [...g.values()].filter(l => l.length > 1).map(l => ({ date: l[0].date, kind: l[0].kind, kindName: KN[l[0].kind], name: l[0].n, key: l[0].nk, amount: r2(num(l[0].amount)), count: l.length, accs: [...new Set(l.map(x => x.acc))], rows: l.map(x => ({ acc: x.acc, key: x.key, c: x.c || '', what: x.what })) })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { namePhones, phoneNames, sameDay };
}
