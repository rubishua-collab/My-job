// שכבת נתונים: סינון לפי הרשאה, אינדקס לקוחות, מסך ״היום״
import { db, listDocs, getDoc } from './db.js';
import { can } from './auth.js';
import { calcMorning, calcCollectors, calcSplit, workGroups, calcWork, wExpList, collKey, cleanColl, normName, normStatus, normTime, timeMin, sum, r2, lnSum, ST_GOT, ST_NOT, ST_PASS, ST_NA } from '../public/js/calc.js';
import { normPhone } from '../public/js/phone.js';

export const KIND_NAMES = { morning: 'חשבון בוקר', split: 'פיצול', collectors: 'חשבון גובים', work: 'איסוף יום' };
const mine = (u, c) => collKey(cleanColl(c)) === collKey(u.collector_name);

export function headline(a) {
  try {
    if (a.kind === 'morning') { const c = calcMorning(a); return { label: 'קרן סופית', value: c.final, extra: { interest: c.interest, principal: c.principal } }; }
    if (a.kind === 'collectors') { const c = calcCollectors(a.entries || []); return { label: 'נטו', value: c.totalNet, extra: { debts: c.totalDebts, exp: c.totalExp } }; }
    if (a.kind === 'split') { const c = calcSplit(a.records || []); return { label: 'סה״כ גובים', value: c.grand, extra: { all: c.all, count: (a.records || []).length } }; }
    if (a.kind === 'work') { const c = calcWork((a.entries || []).filter(e => e && (e.n || e.a))); return { label: 'נגבה', value: c.gotTotal, extra: { total: c.total, left: c.left, count: c.count } }; }
  } catch { /* */ }
  return null;
}

// מה גובה רשאי לראות: רק השורות שלו, ורק השדות הנחוצים לאיסוף
export function filterForUser(u, a) {
  if (can.finance(u)) return a;
  const pick = (r, keys) => Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
  if (a.kind === 'work') return { id: a.id, kind: a.kind, date: a.date, title: a.title, entries: (a.entries || []).filter(e => mine(u, e.c) || (e.by && collKey(e.by) === collKey(u.collector_name))).map(e => pick(e, ['_k', 'n', 'a', 't', 'p', 'c', 's', 'h', 'by', 'ga', 'pmt', 'nt', 'pg', 'pp'])), expenses: (a.expenses || []).filter(x => mine(u, x.c)) };
  if (a.kind === 'split') return { id: a.id, kind: a.kind, date: a.date, title: a.title, records: (a.records || []).filter(r => mine(u, r.c) && !r.side).map(r => pick(r, ['_k', 'n', 'a', 't', 'ph', 'c', 'h', 'na', 'pg', 'pp'])) };
  if (a.kind === 'collectors') return { id: a.id, kind: a.kind, date: a.date, title: a.title, entries: (a.entries || []).filter(e => mine(u, e.c)) };
  return null;
}

export function listAccounts(u, kind) {
  const out = [];
  for (const r of listDocs('accounts')) {
    const a = { id: r.id, ...r.data };
    if (kind && a.kind !== kind) continue;
    const f = filterForUser(u, a); if (!f) continue;
    if (!can.finance(u) && !((f.entries || f.records || []).length)) continue;
    out.push({ id: a.id, kind: a.kind, kindName: KIND_NAMES[a.kind], date: a.date, title: a.title, version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by, createdAt: a.createdAt, headline: can.finance(u) ? headline(a) : headline(f), rows: (f.rows || f.entries || f.records || []).length });
  }
  return out.sort((x, y) => String(y.date).localeCompare(String(x.date)) || (y.createdAt || 0) - (x.createdAt || 0));
}

// ---- אינדקס לקוחות: כל שורה בכל חשבון, הלוואה, בקשה וחוזה ----
let IDX = null, IDXv = -1;
const stamp = () => db.prepare('SELECT COALESCE(MAX(updated_at),0)+COUNT(*) v FROM docs').get().v;
export function clientIndex() {
  const v = stamp(); if (IDX && IDXv === v) return IDX;
  const rows = [];
  for (const r of listDocs('accounts')) {
    const a = r.data; const base = { acc: r.id, kind: a.kind, date: a.date, title: a.title };
    if (a.kind === 'morning') (a.rows || []).forEach(x => rows.push({ ...base, key: x._k, n: x.n, amount: r2((+x.i || 0) + (+x.p || 0)), i: x.i, p: x.p, what: 'תשלום (ריבית/קרן)' }));
    if (a.kind === 'morning') (a.loans || []).forEach(x => rows.push({ ...base, key: x._k, n: x.n, amount: +x.a || 0, what: 'הלוואה שיצאה' }));
    if (a.kind === 'collectors') (a.entries || []).forEach(x => rows.push({ ...base, key: x._k, n: x.n, amount: +x.a || 0, c: x.c, t: x.t, by: x.by, what: x.k === 'e' ? 'הוצאה' : 'חוב/גבייה', exp: x.k === 'e' }));
    if (a.kind === 'split') (a.records || []).forEach(x => rows.push({ ...base, key: x._k, n: x.n, phone: x.ph, amount: +x.a || 0, c: x.c, t: x.t, h: x.h, note: x.note, what: x.side ? 'יתרה (לא נגבה היום)' : 'יתרה בפיצול' }));
    if (a.kind === 'work') {
      (a.entries || []).forEach(x => rows.push({ ...base, key: x._k, n: x.n, phone: x.p, amount: +x.a || 0, c: x.c, t: x.t, s: normStatus(x.s), by: x.by, ga: x.ga, what: 'איסוף' }));
      (a.expenses || []).forEach(x => rows.push({ ...base, key: x._k, n: x.n, amount: +x.a || 0, c: x.c, what: 'הוצאה', exp: true }));
    }
  }
  for (const r of listDocs('loans')) rows.push({ acc: r.id, kind: 'loan', date: r.data.date, n: r.data.name, phone: r.data.phone, amount: +r.data.amount || 0, what: 'הלוואה (לוח סילוקין)', sensitive: true });
  for (const r of listDocs('loan_requests')) rows.push({ acc: r.id, kind: 'loan_request', date: r.data.date, n: r.data.name, phone: r.data.phone, amount: +r.data.amount || 0, what: 'בקשה להלוואה', sensitive: true });
  for (const r of listDocs('contracts')) { const d = r.data.d || {}; rows.push({ acc: r.id, kind: 'contract', date: d.t, n: d.o, phone: d.q, amount: +d.a || 0, what: 'חוזה (' + (r.data.status === 'signed' ? 'נחתם' : r.data.status === 'sent' ? 'נשלח' : 'טיוטה') + ')', sensitive: true }); }
  for (const r of listDocs('clients')) rows.push({ acc: r.id, kind: 'client', date: (r.data.created || '').slice(0, 10), n: r.data.name, phone: r.data.phone, c: r.data.coll, amount: 0, what: 'כרטיס לקוח' });
  // שם → טלפונים, טלפון → שמות
  const byName = new Map(), byPhone = new Map();
  for (const x of rows) {
    x.nk = normName(x.n); if (!x.nk || x.exp) continue;
    if (!byName.has(x.nk)) byName.set(x.nk, { name: x.n, nk: x.nk, phones: new Set(), colls: new Set(), last: '', count: 0 });
    const c = byName.get(x.nk); c.count++; if (x.date > c.last) c.last = x.date; if (x.c) c.colls.add(cleanColl(x.c));
    const p = normPhone(x.phone); if (p) { c.phones.add(p); if (!byPhone.has(p)) byPhone.set(p, new Set()); byPhone.get(p).add(x.nk); }
  }
  IDX = { rows, byName, byPhone }; IDXv = v; return IDX;
}

export function search(u, { q = '', collector = '', courier = '', from = '', to = '' }) {
  const I = clientIndex(); const qq = normName(q); const qd = String(q).replace(/\D/g, '');
  const res = [];
  for (const c of I.byName.values()) {
    if (qq && !(c.nk.includes(qq) || (qd.length >= 3 && [...c.phones].some(p => p.includes(qd.replace(/^0/, '')))) || [...c.colls].some(x => normName(x).includes(qq)))) continue;
    if (collector && ![...c.colls].some(x => collKey(x) === collKey(collector))) continue;
    if (!can.finance(u) && ![...c.colls].some(x => collKey(x) === collKey(u.collector_name))) continue;
    let rows = I.rows.filter(r => r.nk === c.nk && !r.exp);
    if (courier) rows = rows.filter(r => r.by && collKey(r.by) === collKey(courier));
    if (from) rows = rows.filter(r => r.date >= from);
    if (to) rows = rows.filter(r => r.date <= to);
    if ((courier || from || to) && !rows.length) continue;
    res.push({ key: c.nk, name: c.name, phones: [...c.phones], collectors: [...c.colls], last: c.last, count: rows.length, sharedPhone: [...c.phones].some(p => (I.byPhone.get(p) || new Set()).size > 1) });
  }
  return res.sort((a, b) => String(b.last).localeCompare(String(a.last)) || a.name.localeCompare(b.name, 'he')).slice(0, 300);
}

export function clientCard(u, key) {
  const I = clientIndex(); const c = I.byName.get(key); if (!c) return null;
  let rows = I.rows.filter(r => r.nk === key && !r.exp);
  if (!can.sensitive(u)) rows = rows.filter(r => !r.sensitive && (r.kind === 'work' || r.kind === 'split') && collKey(cleanColl(r.c)) === collKey(u.collector_name));
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const samePhone = [];
  for (const p of c.phones) for (const nk of I.byPhone.get(p) || []) if (nk !== key) samePhone.push({ phone: p, key: nk, name: I.byName.get(nk)?.name });
  const msgs = can.send(u) ? db.prepare('SELECT m.status, m.preview, m.updated_at, m.error_text, b.template_name, b.created_at FROM wa_messages m JOIN wa_batches b ON b.id=m.batch_id WHERE m.phone IN (' + [...c.phones].map(() => '?').join(',') + ') ORDER BY m.updated_at DESC LIMIT 50').all(...c.phones) : [];
  const consent = can.send(u) ? db.prepare('SELECT * FROM wa_consent WHERE phone IN (' + [...c.phones].map(() => '?').join(',') + ')').all(...c.phones) : [];
  const totals = { work: sum(rows.filter(r => r.kind === 'work').map(r => r.amount)), workGot: sum(rows.filter(r => r.kind === 'work' && r.s === ST_GOT).map(r => r.ga != null && r.ga !== '' ? +r.ga : r.amount)), interest: sum(rows.filter(r => r.kind === 'morning').map(r => +r.i || 0)), principal: sum(rows.filter(r => r.kind === 'morning').map(r => +r.p || 0)) };
  const lastSplit = rows.find(r => r.kind === 'split');
  return { key, name: c.name, phones: [...c.phones], collectors: [...c.colls], rows, samePhone, msgs, consent, totals: can.finance(u) ? totals : null, balance: lastSplit ? { date: lastSplit.date, amount: sum(rows.filter(r => r.kind === 'split' && r.acc === lastSplit.acc).map(r => r.amount)) } : null };
}

// ---- מסך ״היום״ ----
export function today(u, date) {
  const accs = listDocs('accounts').filter(r => r.data.date === date);
  const works = accs.filter(r => r.data.kind === 'work').map(r => ({ id: r.id, version: r.version, ...filterForUser(u, { id: r.id, ...r.data }) }));
  const items = [];
  for (const w of works) for (const e of w.entries || []) {
    if (!(e.n || e.a)) continue;
    const s = normStatus(e.s);
    items.push({ acc: w.id, title: w.title, key: e._k, n: e.n, a: +e.a || 0, got: s === ST_GOT ? (e.ga != null && e.ga !== '' ? +e.ga : +e.a || 0) : 0, t: s ? '' : normTime(e.t), rawT: e.t, s, c: cleanColl(e.c), p: e.p, by: e.by || '', h: e.h || '' });
  }
  items.sort((x, y) => (x.t ? timeMin(x.t) : 9999) - (y.t ? timeMin(y.t) : 9999) || String(x.c).localeCompare(String(y.c), 'he'));
  const expenses = works.flatMap(w => wExpList(w).map(x => ({ ...x, acc: w.id })));
  const groups = works.map(w => ({ acc: w.id, title: w.title, groups: (workGroups(w.entries, wExpList(w)) || []).map(g => ({ name: g.name, total: g.calc.total, got: g.calc.gotTotal, left: g.calc.left, notTotal: g.calc.notTotal, exp: g.expTotal, net: g.net, count: g.calc.count })) }));
  const expected = sum(items.map(i => i.a)), got = sum(items.map(i => i.got));
  return {
    date, works: works.map(w => ({ id: w.id, title: w.title, version: w.version })),
    splits: accs.filter(r => r.data.kind === 'split').map(r => ({ id: r.id, title: r.data.title })),
    morning: can.finance(u) ? accs.filter(r => r.data.kind === 'morning').map(r => ({ id: r.id, title: r.data.title, final: calcMorning(r.data).final })) : [],
    expected, got, left: r2(expected - got), expTotal: sum(expenses.map(x => x.a)),
    pending: items.filter(i => i.s !== ST_GOT && i.s !== ST_NOT), items, groups, expenses,
  };
}

export function loansView() {
  return listDocs('loans').map(r => { const L = { id: r.id, ...r.data }; const s = lnSum(L); return { ...L, version: r.version, sum: s ? { remain: s.remain, paidSum: s.paidSum, status: s.st.txt, cls: s.st.cls, next: s.next, lateAmt: s.lateAmt, pay: s.s.pay, totalPay: s.s.totalPay, totalInt: s.s.totalInt, rows: s.s.rows } : null }; });
}
export const knownCollectors = () => {
  const s = getDoc('settings', 'coll'); const set = new Map();
  for (const c of (s?.data?.coll || [])) set.set(collKey(c), cleanColl(c));
  const del = new Set((s?.data?.del || []).map(c => collKey(c)));
  for (const r of listDocs('accounts')) for (const x of [...(r.data.entries || []), ...(r.data.records || [])]) if (x && x.c) { const k = collKey(cleanColl(x.c)); if (k && !set.has(k)) set.set(k, cleanColl(x.c)); }
  for (const k of del) set.delete(k); // גובים שנמחקו מהרשימה, כמו במקור
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'he'));
};
