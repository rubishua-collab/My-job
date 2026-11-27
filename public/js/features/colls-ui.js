// ״ניהול גובים״ בכל מסך חשבון (פיצול, איסוף יום, חשבון גובים): תיקון שם, לא פעיל / חזרה לפעילות, הוספה.
// והרשימה של ״רשימת הלקוחות״ באיסוף היום (BOOK.collectors) מתעדכנת אחרי כל שינוי.
import { accountAction } from '../registry.js';
import { openSheet } from '../ui.js';
import { mountManager, onColls, activeColls, addColl } from '../colls.js';
import { BOOK } from './work-tools-lib.js';

accountAction('*', {
  label: 'ניהול גובים',
  can: (A) => A.can.finance,
  run() {
    const s = openSheet(`<div class="hd"><h2>ניהול גובים</h2><button class="x" data-close>×</button></div>
      <div class="cpk-row"><input class="in" id="cm-new" placeholder="שם גובה חדש" autocomplete="off"><button type="button" class="btn sm" id="cm-add">+ הוסף גובה</button></div><div id="cm-msg" class="small" role="status"></div>
      <div id="cm-box"></div>`);
    const box = s.el.querySelector('#cm-box'); mountManager(box);
    s.el.querySelector('#cm-add').onclick = async () => {
      const i = s.el.querySelector('#cm-new'), m = s.el.querySelector('#cm-msg'); if (!i.value.trim()) { m.textContent = 'כתוב שם גובה'; return; }
      try { const r = await addColl(i.value); m.textContent = r.existed ? `״${r.name}״ כבר ברשימה${r.reactivated ? ' — הוחזר לפעילות' : ''}` : `✓ ${r.name} נוסף`; i.value = ''; mountManager(box); }
      catch (e) { m.textContent = 'לא נשמר — ' + (e.network ? 'בעיית קליטה' : e.message); }
    };
  },
});
onColls(async () => { try { if (BOOK && Array.isArray(BOOK.collectors)) BOOK.collectors = await activeColls(); } catch { /* */ } });
