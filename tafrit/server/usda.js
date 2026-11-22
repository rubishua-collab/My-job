// השלמה מ-USDA FoodData Central (באנגלית). פריט שנבחר נשמר כמוצר אישי עם ציון המקור.
const KEY = () => process.env.USDA_API_KEY || 'DEMO_KEY';
export const usdaEnabled = () => true;
const NUT = { 1008: 'k', 2047: 'k2', 2048: 'k3', 1003: 'p', 1004: 'f', 1005: 'c', 1079: 'fi', 1093: 'na' };
const cache = new Map();

export async function usdaSearch(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { items: [] };
  if (/[֐-׿]/.test(q)) return { items: [], note: 'החיפוש ב-USDA הוא באנגלית. למשל: greek yogurt, protein bar.' };
  if (cache.has(q)) return cache.get(q);
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(KEY())}&query=${encodeURIComponent(q)}&pageSize=15&dataType=${encodeURIComponent('Foundation,SR Legacy,Survey (FNDDS),Branded')}`;
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(12000) }); } catch { return { items: [], error: 'אין חיבור ל-USDA כרגע.' }; }
  if (r.status === 429) return { items: [], error: 'USDA חסם זמנית בגלל עומס. הגדר USDA_API_KEY (חינם) בשרת.' };
  if (!r.ok) return { items: [], error: `USDA החזיר שגיאה ${r.status}` };
  const d = await r.json();
  const items = (d.foods || []).map(f => {
    const v = {};
    for (const n of f.foodNutrients || []) { const k = NUT[n.nutrientId]; if (k && n.value != null && (n.unitName || '').toUpperCase() !== 'KJ') v[k] = n.value; }
    const kcal = v.k ?? v.k3 ?? v.k2;
    if (kcal == null) return null;
    const serving = f.servingSizeUnit && /^g$/i.test(f.servingSizeUnit) && f.servingSize ? { unitName: f.householdServingFullText || 'מנה', unitGrams: Math.round(f.servingSize) } : {};
    return { fdcId: f.fdcId, name: f.description, brand: f.brandOwner || f.brandName || '', dataType: f.dataType, k: Math.round(kcal), p: v.p ?? 0, f: v.f ?? 0, c: v.c ?? 0, fi: v.fi ?? null, na: v.na ?? null, ...serving };
  }).filter(Boolean);
  const out = { items, source: 'USDA FoodData Central' };
  cache.set(q, out);
  return out;
}
