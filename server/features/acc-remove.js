// מחיקת רישום שמור (חשבון בוקר / פיצול / חשבון גובים / איסוף יום) וביטול ההשפעה הכספית שלו — פעם אחת בלבד.
//
// מה ״ההשפעה הכספית״ של רישום:
// • חשבון בוקר: הקרן הסופית שלו עוברת לחשבון הבוקר הבא כ״קרן קיימת״. ההשפעה של הרישום עצמו היא רק מה שהשורות שלו שינו:
//   delta = קרן סופית − קרן קיימת (ריבית + קרן + משלוחים − הלוואות). דף ריק שרק קיבל קרן מועברת → delta = 0, ושום דבר לא משתנה.
//   אם delta ≠ 0, מורידים אותו מהקרן הקיימת של החשבונות הבאים — רק כל עוד כל אחד מהם קיבל את הקרן בהעברה מהקודם לו
//   (הקרן הקיימת שלו = הקרן הסופית של הקודם). חשבון שהקרן שלו הוקלדה ידנית הוא פעולה עצמאית — לא נוגעים בו ובמה שאחריו.
//   השורות שנרשמו בחשבונות הבאים לא משתנות.
// • פיצול / חשבון גובים / איסוף יום: אין יתרה שמועברת הלאה. היתרות, הסיכומים, כרטיסי הלקוחות, ״היום״ והדוחות מחושבים
//   מהרישומים השמורים, ולכן הסרת הרישום מורידה אותם מיד ובדיוק פעם אחת.
// הכול רץ בטרנזקציה אחת עם opId: לחיצה כפולה / ניסיון חוזר לא מקזזים פעמיים, ותקלה באמצע מבטלת הכול.
import { calcMorning, r2 } from '../../public/js/calc.js';

export async function register(ctx) {
  await registerEntryDelete(ctx);
  const { r, err, need, db, getDoc, listDocs, putDoc, deleteDoc, once, logAudit } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };
  const KN = { morning: 'חשבון בוקר', split: 'פיצול', collectors: 'חשבון גובים', work: 'איסוף יום' };

  function plan(id) {
    const d = getDoc('accounts', id); if (!d || d.deleted) return null;
    const a = d.data; const out = { id, kind: a.kind, kindName: KN[a.kind], title: a.title, date: a.date, version: d.version, delta: 0, adjust: [], stop: null };
    const lines = { morning: (a.rows || []).length + (a.loans || []).filter(x => x && (x.n || +x.a)).length, split: (a.records || []).length, collectors: (a.entries || []).length, work: (a.entries || []).length + (a.expenses || []).length };
    out.rows = lines[a.kind] || 0;
    if (a.kind !== 'morning') return out;
    const c = calcMorning(a); out.keren = r2(+a.keren || 0); out.final = r2(c.final);
    out.delta = r2(out.final - out.keren);
    if (!out.delta) return out;
    // החשבונות הבאים לפי הסדר של prevMorning (תאריך, ואז זמן יצירה)
    const ms = listDocs('accounts').filter(x => x.data.kind === 'morning' && x.data.date).map(x => ({ id: x.id, version: x.version, a: x.data }))
      .sort((x, y) => String(x.a.date).localeCompare(String(y.a.date)) || ((x.a.createdAt || 0) - (y.a.createdAt || 0)));
    const i = ms.findIndex(x => x.id === id);
    let prevOld = out.final;
    for (const m of ms.slice(i + 1)) {
      const k = r2(+m.a.keren || 0);
      if (k !== prevOld) { out.stop = { id: m.id, title: m.a.title, date: m.a.date, keren: k }; break; }
      const oldFinal = r2(calcMorning(m.a).final);
      const nk = r2(k - out.delta);
      out.adjust.push({ id: m.id, version: m.version, title: m.a.title, date: m.a.date, from: k, to: nk, finalFrom: oldFinal, finalTo: r2(oldFinal - out.delta) });
      prevOld = oldFinal;
    }
    return out;
  }

  r.get('/api/accounts/:id/remove-plan', (req, res, { user, params }) => {
    need(user.role === 'owner', 'רק בעל התוכנה יכול למחוק רישומים');
    const p = plan(params.id); if (!p) throw err(404, 'הרישום לא נמצא (אולי כבר נמחק)');
    return p;
  });

  r.post('/api/accounts/:id/remove', (req, res, { user, params, body }) => {
    need(user.role === 'owner', 'רק בעל התוכנה יכול למחוק רישומים');
    return tx(() => once(body.opId, user, () => {
      const d = getDoc('accounts', params.id);
      if (!d) throw err(404, 'הרישום לא נמצא');
      if (d.deleted) return { ok: true, already: true, adjusted: [] }; // כבר נמחק (למשל לחיצה כפולה במכשיר אחר) — לא מקזזים שוב
      if (body.baseVersion != null && d.version !== body.baseVersion) throw err(409, 'הרישום עודכן בינתיים ממכשיר אחר. רענן ובדוק לפני מחיקה.');
      const p = plan(params.id);
      for (const x of p.adjust) {
        const m = getDoc('accounts', x.id);
        if (!m || m.deleted || m.version !== x.version) throw err(409, 'חשבון בוקר אחר עודכן בדיוק עכשיו. נסה שוב.');
        const data = { ...m.data, keren: x.to }; data.finalKeren = calcMorning(data).final; data.updatedAt = Date.now();
        putDoc('accounts', x.id, data, { user, baseVersion: x.version, action: 'עדכון קרן אחרי מחיקת רישום', note: `הקרן הקיימת ${x.from} → ${x.to} (בוטלה השפעה של ${p.delta} מ״${p.title}״)` });
      }
      deleteDoc('accounts', params.id, { user, note: 'מחיקת רישום' + (p.delta ? ` · בוטלה השפעה של ${p.delta} על הקרן ב-${p.adjust.length} חשבונות בוקר` : '') });
      logAudit({ user, action: 'מחיקת רישום', col: 'accounts', doc_id: params.id, item: p.title, after: { delta: p.delta, adjusted: p.adjust.map(x => ({ id: x.id, from: x.from, to: x.to })) } });
      return { ok: true, id: params.id, delta: p.delta, adjusted: p.adjust.map(({ id, title, date, from, to }) => ({ id, title, date, from, to })) };
    }));
  });
}

// ״מחק גבייה״: מחיקת שורת גבייה אחת מרשימת איסוף יום, לפי המזהה הייחודי שלה (_k). רק השורה הזו — שאר השורות,
// כרטיס הלקוח, הפיצול וההלוואות לא נוגעים. opId: ניסיון חוזר לא מוחק פעמיים; שורה שכבר נמחקה — מדווח ולא נכשל.
export async function registerEntryDelete(ctx) {
  const { r, err, need, can, db, getDoc, putDoc, once, logAudit } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };
  r.post('/api/accounts/:id/del-entry', (req, res, { user, params, body }) => {
    need(can.finance(user), 'רק בעלים או מנהל יכולים למחוק גבייה');
    return tx(() => once(body.opId, user, () => {
      const d = getDoc('accounts', params.id); if (!d || d.deleted || d.data.kind !== 'work') throw err(404, 'רשימת הגביות לא נמצאה');
      const list = d.data.entries || []; const i = list.findIndex(x => x && x._k === body.key);
      if (i < 0) return { ok: true, already: true, version: d.version };
      const [gone] = list.splice(i, 1);
      const out = putDoc('accounts', params.id, { ...d.data, entries: list }, { user, action: 'מחיקת גבייה', item: gone.n + ' (' + gone._k + ')', note: (gone.c || '') + ' · ' + (gone.a || 0) + ' ₪' + (gone.t ? ' · ' + gone.t : '') });
      logAudit({ user, action: 'מחיקת גבייה', col: 'accounts', doc_id: params.id, item: body.key, before: gone, note: gone.n });
      return { ok: true, version: out.version };
    }));
  });
}
