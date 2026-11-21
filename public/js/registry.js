// נקודות הרחבה: כל יכולת (פיצ'ר) נכתבת בקובץ משלה בתיקייה features/ ונרשמת כאן.
// כך אפשר להוסיף יכולות בלי לגעת בקבצי הליבה.
export const R = {
  routes: {},          // name -> async (view, args, query) => cleanup?   (נתיב #/name/...)
  more: [],            // [{href, label, can?: (App)=>bool, order?}]   פריטים בתפריט ״עוד״
  accountActions: {},  // kind -> [{label, can?, run(ctx)}]  כפתורים בכותרת מסך חשבון (ctx.a = החשבון, ctx.reload())
  editorActions: {},   // kind -> [{label, run(state, redraw)}]  כפתורים במסך עריכה (state = עותק החשבון לעריכה)
  accountPanels: {},   // kind -> [(ctx) => html]  תוכן נוסף בתחתית מסך חשבון; ctx.bindPanels?.() אחרי ציור
  panelBinders: {},    // kind -> [(ctx) => void]  חיבור אירועים לתוכן הנוסף
  todayPanels: [],     // [(data, App) => html]   תוכן נוסף במסך ״היום״
  newAccountKinds: [], // [{kind, label}]  לא בשימוש כרגע
};
export const route = (name, fn) => { R.routes[name] = fn; };
export const more = (item) => { R.more.push(item); };
export const accountAction = (kind, a) => { (R.accountActions[kind] ||= []).push(a); };
export const editorAction = (kind, a) => { (R.editorActions[kind] ||= []).push(a); };
export const accountPanel = (kind, render, bind) => { (R.accountPanels[kind] ||= []).push(render); if (bind) (R.panelBinders[kind] ||= []).push(bind); };
export const todayPanel = (fn) => { R.todayPanels.push(fn); };

// טעינת ספרייה חיצונית שנשמרה מקומית (public/vendor), פעם אחת בלבד
const loaded = {};
export function loadVendor(file) {
  return loaded[file] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/vendor/' + file; s.onload = () => res(); s.onerror = () => { delete loaded[file]; rej(new Error('טעינת רכיב נכשלה: ' + file)); };
    document.head.appendChild(s);
  });
}
