// יומן גובים ושליחים + הודעות בוקר — נקודות קצה בשרת.
// GET /api/ledger/data            — חשבונות איסוף יום וחשבונות גובים המלאים + רשימת ההעברות (settings/transfers).
//                                   גובה מקבל רק את השורות שלו (filterForUser) ורק העברות שלו — נאכף כאן בשרת.
// GET /api/ledger/morning?date=   — נמעני הודעות הבוקר ליום, בדיוק כמו mbRecipients במקור (app.html 9635), לשליחה דרך הממשק הרשמי.
import { filterForUser, knownCollectors } from '../data.js';
import { collKey, cleanColl, stripInv } from '../../public/js/calc.js';
import { pickMorningSources, morningRecipients, MB_DEF } from '../../public/js/features/ledger-calc.js';

export async function register(ctx) {
  const { r, need, can, getDoc, listDocs } = ctx;
  const accs = (kinds) => listDocs('accounts').filter(x => !x.deleted && kinds.includes(x.data.kind)).map(x => ({ id: x.id, ...x.data }));

  r.get('/api/ledger/data', (req, res, { user }) => {
    const fin = can.finance(user);
    const accounts = [];
    for (const a of accs(['work', 'collectors'])) {
      const f = filterForUser(user, a); if (!f) continue;
      if (!fin && !((f.entries || []).length || (f.expenses || []).length)) continue;
      // שדות הזמן נחוצים לבחירת הגרסה העדכנית של אותה רשימה (lgVersions)
      accounts.push({ ...f, createdAt: a.createdAt, updatedAt: a.updatedAt });
    }
    const t = getDoc('settings', 'transfers');
    let transfers = t && !t.deleted ? { list: Array.isArray(t.data.list) ? t.data.list : [], at: t.data.at || 0, _version: t.version } : { list: [], at: 0, _version: null };
    if (!fin) {
      const me = collKey(user.collector_name);
      transfers = { list: transfers.list.filter(x => x && (collKey(cleanColl(x.to)) === me || collKey(stripInv(x.from)) === me)), at: transfers.at, _version: null };
    }
    const colls = knownCollectors();
    return { accounts, transfers, collectors: fin ? colls : colls.filter(c => collKey(c) === collKey(user.collector_name)), readOnly: !fin };
  });

  r.get('/api/ledger/morning', (req, res, { user, q }) => {
    need(can.send(user), 'שליחת הודעות בוקר זמינה לבעלים ולמנהל');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
    const all = listDocs('accounts').filter(x => !x.deleted && x.data.date === date).map(x => ({ id: x.id, ...x.data }));
    const dr = getDoc('settings', 'sp_draft');
    const src = pickMorningSources(all, dr && !dr.deleted ? dr.data : null, date);
    const out = morningRecipients({ date, ...src });
    const mb = getDoc('settings', 'mb');
    return {
      date, list: out.list, noPhone: out.noPhone,
      split: src.split ? { id: src.split.id, date: src.split.date, records: (src.split.records || []).length, xstash: (src.split.xstash || []).length } : null,
      work: src.work ? { id: src.work.id, date: src.work.date } : null,
      tpl: mb && !mb.deleted && typeof mb.data.tpl === 'string' && mb.data.tpl.trim() ? mb.data.tpl : MB_DEF, tplVersion: mb && !mb.deleted ? mb.version : null, def: MB_DEF,
    };
  });
}
