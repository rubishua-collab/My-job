// איסוף יום ומאגר לקוחות: נתוני קריאה בלבד לספר הטלפונים ולבדיקת כפילויות בהקמת לקוח.
// במקור (app.html 2518-2620, 4101-4125) הדפדפן החזיק את כל החשבונות; כאן השרת מחזיר רק את השדות הנחוצים.
// הכתיבה עצמה (לקוחות, חשבונות) עוברת דרך ה-API הכללי (/api/docs/clients, /api/accounts) עם ההרשאות שלו.
export async function register(ctx) {
  const { r, need, can, listDocs } = ctx;
  const str = (v) => (v == null ? '' : String(v));

  // ספר טלפונים / גובה / קשה: כל הפיצולים השמורים + מאגר הלקוחות. ?full=1 מוסיף את כל המקורות לבדיקת כפילויות (ncIndex)
  r.get('/api/work-tools/book', (req, res, { user, q }) => {
    need(can.finance(user));
    const accs = listDocs('accounts').map(x => ({ id: x.id, ...x.data }));
    const splits = accs.filter(a => a.kind === 'split' && Array.isArray(a.records))
      .map(a => ({ id: a.id, date: str(a.date), records: a.records.filter(Boolean).map(r => ({ k: str(r._k), n: str(r.n), ph: str(r.ph), c: str(r.c), h: str(r.h), side: !!r.side })) }));
    const clients = listDocs('clients').map(x => ({ id: x.id, _version: x.version, ...x.data }));
    const out = { splits, clients };
    if (q.get('full') === '1') {
      out.works = accs.filter(a => a.kind === 'work' && Array.isArray(a.entries)).map(a => ({ id: a.id, date: str(a.date), entries: a.entries.filter(Boolean).map(e => ({ n: str(e.n), p: str(e.p) })) }));
      out.loans = listDocs('loans').map(x => ({ name: str(x.data.name), phone: str(x.data.phone) }));
      out.contracts = can.sensitive(user) ? listDocs('contracts').map(x => ({ o: str(x.data.d && x.data.d.o), q: str(x.data.d && x.data.d.q) })) : [];
    }
    return out;
  });
}
