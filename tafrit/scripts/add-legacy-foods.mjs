// מוסיף ל-data/foods.json את המזונות מ״יומן התזונה של רובי״ (הגרסה הקודמת):
//  1. הרשימה הנפוצה (ממוצעי USDA ומוצרים ישראליים) — ערכים ל-100 ג׳, מזהה y<n>, מקור 'yoman'
//  2. רשתות מזון מהיר — ערכים למנה אחת (pp = שם המנה), מזהה ff<n>, מקור 'chain'
//  3. מזון מטוגן נפוץ ל-100 ג׳, מזהה j<n>, מקור 'yoman'
// הרצה חוזרת בטוחה: מוחקת קודם את מה שנוסף בהרצה הקודמת. שימוש: node scripts/add-legacy-foods.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'foods.json');
const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const common = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'legacy', 'yoman-common.json'), 'utf8')).rows;
const ff = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'legacy', 'fastfood.json'), 'utf8'));

// מצב ההכנה ביומן הקודם → מצב במאגר החדש. "צלוי/אפוי/מטוגן" נשארים גם בשם, כמו שהוצגו ביומן הקודם.
const ST = { 'מבושל': 'cooked', 'צלוי': 'cooked', 'אפוי': 'cooked', 'מטוגן': 'cooked' };
const label = (name, st) => name + (st ? ` (${st})` : '');

const base = db.foods.filter(f => f.src !== 'yoman' && f.src !== 'chain');
const add = [];
common.forEach((r, i) => add.push({ id: 'y' + (i + 1), n: label(r[0], r[5]), src: 'yoman', k: r[1], p: r[2], c: r[3], f: r[4], st: ST[r[5]] || null }));
ff.FASTFOOD.forEach((r, i) => add.push({ id: 'ff' + (i + 1), n: r[0], src: 'chain', k: r[1], p: r[2], c: r[3], f: r[4], pp: r[5], u: [[r[5], 100]] }));
ff.JUNK100.forEach((r, i) => add.push({ id: 'j' + (i + 1), n: label(r[0], r[5]), src: 'yoman', k: r[1], p: r[2], c: r[3], f: r[4], st: ST[r[5]] || null }));
for (const f of add) for (const k of Object.keys(f)) if (f[k] == null) delete f[k];

db.foods = [...base, ...add];
db.meta.extra = { yoman: common.length + ff.JUNK100.length, chain: ff.FASTFOOD.length, note: 'מזונות נפוצים ורשתות מזון מהיר מ״יומן התזונה של רובי״' };
fs.writeFileSync(FILE, JSON.stringify(db));
console.log(`נוספו ${add.length} מזונות (${common.length} נפוצים, ${ff.FASTFOOD.length} רשתות, ${ff.JUNK100.length} מטוגנים). סה״כ ${db.foods.length}.`);
