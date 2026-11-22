// ״עדכון אחרון״ ו״שמירה אחרונה״ — תאריך מלא ושעה (24 שעות) לפי שעון ישראל
import { esc } from './ui.js';
const F = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export function fmtIL(ts) {
  if (!ts) return null;
  const p = Object.fromEntries(F.formatToParts(new Date(+ts)).map(x => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} בשעה ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
export function timesHTML(t) {
  t = t || {};
  const ch = fmtIL(t.changedAt), sv = fmtIL(t.savedAt);
  return `<div class="tl">עדכון אחרון: ${ch ? `<span class="nw">${esc(ch)}</span>` : '<span class="nd">לא תועד</span>'}${ch ? ' | <span class="nw">עודכן על ידי ' + (t.changedBy ? esc(t.changedBy) : '<span class="nd">לא תועד</span>') + '</span>' : ''}</div>
    <div class="tl">שמירה אחרונה: ${sv ? `<span class="nw">${esc(sv)}</span>` : '<span class="nd">לא תועד</span>'}</div>`;
}
