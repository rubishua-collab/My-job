// רכיבי ארוחה שמנוע ההמלצות מרכיב מהם ארוחות. כל רכיב מפנה למזון אמיתי במאגר משרד הבריאות (קוד m…).
// role: protein / carb / veg / fruit / fat / extra
// kosher: meat / dairy / parve. allergens: egg, milk, gluten, fish, soy, sesame, nuts, peanuts
// step: עיגול הכמות. unit: יחידה להצגה (כפי שמופיעה במאגר). min/max בגרמים.
export const COMPONENTS = {
  egg:        { id: 'm1561', fam: 'egg', name: 'ביצים', role: 'protein', kosher: 'parve', allergens: ['egg'], unit: 'יחידה גדולה', step: 1, min: 1, max: 3, def: 2, prep: 7, words: ['ביצה', 'ביצים', 'חביתה'] },
  hardEgg:    { id: 'm1564', fam: 'egg', name: 'ביצה קשה', role: 'protein', kosher: 'parve', allergens: ['egg'], unit: 'יחידה גדולה', step: 1, min: 1, max: 3, def: 2, prep: 10, nocook: false, words: ['ביצה קשה'] },
  cottage:    { id: 'm494', fam: 'dairy', name: 'קוטג׳ 5%', role: 'protein', kosher: 'dairy', allergens: ['milk'], unit: 'גביע', stepG: 50, min: 100, max: 250, def: 125, prep: 1, nocook: true, words: ['קוטג', 'קוטג׳', "קוטג'"] },
  whiteCheese:{ id: 'm532', fam: 'dairy', name: 'גבינה לבנה 5%', role: 'protein', kosher: 'dairy', allergens: ['milk'], unit: 'כף', stepG: 50, min: 100, max: 250, def: 100, prep: 1, nocook: true, words: ['גבינה לבנה'] },
  yellowCheese:{ id: 'm8608', fam: 'dairy', name: 'גבינה צהובה 5%', role: 'protein', kosher: 'dairy', allergens: ['milk'], unit: 'פרוסה', step: 1, min: 1, max: 4, def: 2, prep: 1, nocook: true, words: ['גבינה צהובה'] },
  yogurt:     { id: 'm56', fam: 'dairy', name: 'יוגורט 0%', role: 'protein', kosher: 'dairy', allergens: ['milk'], unit: 'גביע', step: 1, min: 1, max: 2, def: 1, prep: 1, nocook: true, words: ['יוגורט'] },
  tuna:       { id: 'm1360', fam: 'fish', name: 'טונה במים (מסוננת)', role: 'protein', kosher: 'parve', allergens: ['fish'], unit: 'אריזה אישית', stepG: 40, min: 80, max: 240, def: 120, prep: 3, nocook: true, words: ['טונה'] },
  chicken:    { id: 'm805', fam: 'chicken', name: 'חזה עוף צלוי', role: 'protein', kosher: 'meat', allergens: [], stepG: 10, min: 100, max: 250, def: 150, prep: 25, cookAhead: true, words: ['עוף', 'חזה עוף'] },
  thigh:      { id: 'm880', fam: 'pargit', name: 'פרגית (ירך עוף בלי עור)', role: 'protein', kosher: 'meat', allergens: [], stepG: 10, min: 100, max: 250, def: 150, prep: 30, cookAhead: true, words: ['פרגית', 'פרגיות', 'ירך עוף', 'עוף'] },
  turkey:     { id: 'm1009', fam: 'turkeyDeli', name: 'חזה הודו מעושן', role: 'protein', kosher: 'meat', allergens: [], unit: 'פרוסה', step: 1, min: 2, max: 6, def: 4, prep: 1, nocook: true, words: ['הודו', 'פסטרמה'] },
  beef:       { id: 'm1478', fam: 'beef', name: 'בקר טחון מבושל', role: 'protein', kosher: 'meat', allergens: [], stepG: 10, min: 80, max: 200, def: 120, prep: 20, cookAhead: true, words: ['בשר טחון', 'בקר'] },
  steak:      { id: 'm609', fam: 'beef', name: 'סטייק בקר צלוי', role: 'protein', kosher: 'meat', allergens: [], stepG: 10, min: 120, max: 250, def: 150, prep: 15, budget: 'high', words: ['סטייק', 'בקר', 'אנטריקוט'] },
  turkeyPatty:{ id: 'u172849', fam: 'turkey', name: 'קציצות הודו צלויות', role: 'protein', kosher: 'meat', allergens: [], unit: 'קציצה', step: 1, min: 1, max: 3, def: 2, prep: 20, cookAhead: true, words: ['הודו', 'קציצות הודו', 'קציצות'] },
  schnitzel:  { id: 'm815', fam: 'chicken', name: 'שניצל עוף', role: 'protein', kosher: 'meat', allergens: ['gluten', 'egg'], unit: 'יחידה בינונית', stepG: 20, min: 100, max: 220, def: 140, prep: 20, cookAhead: true, words: ['שניצל', 'עוף'] },
  salmon:     { id: 'm1298', fam: 'fish', name: 'סלמון אפוי', role: 'protein', kosher: 'parve', allergens: ['fish'], stepG: 10, min: 100, max: 220, def: 150, prep: 25, budget: 'high', words: ['סלמון', 'דג'] },
  tilapia:    { id: 'm1152', fam: 'fish', name: 'אמנון מבושל', role: 'protein', kosher: 'parve', allergens: ['fish'], stepG: 10, min: 120, max: 250, def: 170, prep: 20, words: ['אמנון', 'מושט', 'דג'] },
  tofu:       { id: 'm10141', fam: 'tofu', name: 'טופו קשה', role: 'protein', kosher: 'parve', allergens: ['soy'], stepG: 25, min: 100, max: 250, def: 150, prep: 15, words: ['טופו'] },
  lentils:    { id: 'm1669', fam: 'legumes', name: 'עדשים מבושלות', cookAhead: true, role: 'protein', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 20, min: 120, max: 300, def: 180, prep: 25, fiberRich: true, words: ['עדשים'] },
  chickpeas:  { id: 'm1653', fam: 'legumes', name: 'גרגרי חומוס מבושלים', role: 'protein', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 20, min: 100, max: 250, def: 150, prep: 5, fiberRich: true, words: ['חומוס', 'גרגרי חומוס'] },
  milk:       { id: 'm25', name: 'חלב 1%', role: 'extra', kosher: 'dairy', allergens: ['milk'], unit: 'כוס', stepG: 60, min: 120, max: 300, def: 240, prep: 1, nocook: true, words: ['חלב'] },

  pita:       { id: 'm1955', name: 'פיתה', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'יחידה', step: 0.5, min: 0.5, max: 2, def: 1, prep: 1, nocook: true, words: ['פיתה', 'פיתות'] },
  wwPita:     { id: 'm8588', name: 'פיתה מקמח מלא', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'יחידה', step: 0.5, min: 0.5, max: 2, def: 1, prep: 1, nocook: true, fiberRich: true, words: ['פיתה מלאה'] },
  bread:      { id: 'm1995', name: 'לחם מחיטה מלאה', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'פרוסה בינונית', step: 1, min: 1, max: 4, def: 2, prep: 1, nocook: true, fiberRich: true, words: ['לחם', 'פרוסה', 'פרוסות'] },
  lightBread: { id: 'm2016', name: 'לחם קל מחיטה מלאה', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'פרוסה', step: 1, min: 2, max: 4, def: 3, prep: 1, nocook: true, fiberRich: true, words: ['לחם קל'] },
  rice:       { id: 'm2721', name: 'אורז לבן מבושל', role: 'carb', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 20, min: 80, max: 350, def: 150, prep: 20, words: ['אורז'] },
  brownRice:  { id: 'm2727', name: 'אורז מלא מבושל', role: 'carb', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 20, min: 80, max: 350, def: 150, prep: 35, fiberRich: true, words: ['אורז מלא'] },
  pasta:      { id: 'm8552', name: 'פסטה מבושלת', role: 'carb', kosher: 'parve', allergens: ['gluten'], stepG: 20, min: 80, max: 300, def: 150, prep: 15, words: ['פסטה', 'ספגטי', 'אטריות'] },
  potato:     { id: 'm3453', name: 'תפוח אדמה אפוי', role: 'carb', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', stepG: 25, min: 100, max: 400, def: 200, prep: 40, words: ['תפוח אדמה', 'תפוחי אדמה', 'תפוא'] },
  sweetPotato:{ id: 'm3654', name: 'בטטה אפויה', role: 'carb', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', stepG: 25, min: 100, max: 400, def: 200, prep: 40, fiberRich: true, words: ['בטטה'] },
  oats:       { id: 'm8199', name: 'שיבולת שועל (יבשה)', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'כף', stepG: 10, min: 30, max: 90, def: 40, prep: 5, fiberRich: true, words: ['שיבולת שועל', 'קוואקר', 'דייסה'] },
  quinoa:     { id: 'm2773', name: 'קינואה מבושלת', role: 'carb', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 20, min: 80, max: 300, def: 150, prep: 20, budget: 'high', words: ['קינואה'] },
  bulgur:     { id: 'm9550', name: 'בורגול מבושל', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'כוס', stepG: 20, min: 80, max: 350, def: 150, prep: 20, fiberRich: true, words: ['בורגול'] },
  couscous:   { id: 'm10127', name: 'קוסקוס מבושל', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'כוס', stepG: 20, min: 80, max: 300, def: 150, prep: 10, words: ['קוסקוס'] },
  ptitim:     { id: 'm2625', name: 'פתיתים מבושלים', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'כוס', stepG: 20, min: 80, max: 300, def: 150, prep: 15, words: ['פתיתים'] },
  riceCakes:  { id: 'm2566', name: 'פריכיות אורז מלא', role: 'carb', kosher: 'parve', allergens: [], unit: 'יחידה', step: 1, min: 2, max: 6, def: 3, prep: 1, nocook: true, words: ['פריכיות'] },
  tortilla:   { id: 'm2052', name: 'טורטיה מחיטה מלאה', role: 'carb', kosher: 'parve', allergens: ['gluten'], unit: 'יחידה', step: 1, min: 1, max: 3, def: 1, prep: 1, nocook: true, words: ['טורטיה', 'לאפה', 'ראפ'] },

  salad:      { id: 'm9704', name: 'סלט ירקות ישראלי', role: 'veg', kosher: 'parve', allergens: [], unit: 'מנה גדולה', stepG: 50, min: 100, max: 300, def: 200, prep: 7, nocook: true, words: ['סלט', 'ירקות'] },
  cucumber:   { id: 'm3793', name: 'מלפפון', role: 'veg', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 3, def: 1, prep: 1, nocook: true, words: ['מלפפון', 'מלפפונים'] },
  tomato:     { id: 'm3663', name: 'עגבניה', role: 'veg', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 2, def: 1, prep: 1, nocook: true, words: ['עגבניה', 'עגבניות'] },
  pepper:     { id: 'm3839', name: 'פלפל אדום', role: 'veg', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 0.5, min: 0.5, max: 2, def: 1, prep: 1, nocook: true, words: ['פלפל'] },
  carrot:     { id: 'm3626', name: 'גזר', role: 'veg', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 2, def: 1, prep: 1, nocook: true, words: ['גזר'] },
  broccoli:   { id: 'm8215', name: 'ברוקולי מאודה', role: 'veg', kosher: 'parve', allergens: [], stepG: 50, min: 100, max: 300, def: 150, prep: 10, words: ['ברוקולי'] },
  greenBeans: { id: 'm3918', name: 'שעועית ירוקה מבושלת', role: 'veg', kosher: 'parve', allergens: [], stepG: 50, min: 100, max: 300, def: 150, prep: 10, words: ['שעועית ירוקה'] },
  zucchini:   { id: 'm4067', name: 'קישואים מבושלים', role: 'veg', kosher: 'parve', allergens: [], stepG: 50, min: 100, max: 300, def: 150, prep: 15, words: ['קישוא', 'קישואים'] },
  mushrooms:  { id: 'm3812', name: 'פטריות', role: 'veg', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 50, min: 70, max: 200, def: 100, prep: 8, words: ['פטריות'] },

  apple:      { id: 'm3201', name: 'תפוח עץ', role: 'fruit', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 1, def: 1, prep: 0, nocook: true, words: ['תפוח'] },
  banana:     { id: 'm3225', name: 'בננה', role: 'fruit', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 1, def: 1, prep: 0, nocook: true, words: ['בננה'] },
  orange:     { id: 'm3120', name: 'תפוז', role: 'fruit', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 1, def: 1, prep: 1, nocook: true, words: ['תפוז'] },
  clementine: { id: 'm3127', name: 'קלמנטינה', role: 'fruit', kosher: 'parve', allergens: [], unit: 'יחידה בינונית', step: 1, min: 1, max: 3, def: 2, prep: 1, nocook: true, words: ['קלמנטינה', 'קלמנטינות'] },
  strawberry: { id: 'm3339', name: 'תותים', role: 'fruit', kosher: 'parve', allergens: [], unit: 'כוס', stepG: 50, min: 100, max: 200, def: 150, prep: 2, nocook: true, words: ['תות', 'תותים'] },
  dates:      { id: 'm8213', name: 'תמר מג׳הול', role: 'fruit', kosher: 'parve', allergens: [], unit: 'יחידה', step: 1, min: 1, max: 3, def: 2, prep: 0, nocook: true, words: ['תמר', 'תמרים'] },

  oliveOil:   { id: 'm4443', name: 'שמן זית', role: 'fat', kosher: 'parve', allergens: [], unit: 'כפית', step: 1, min: 1, max: 3, def: 1, prep: 0, words: ['שמן זית', 'שמן'] },
  tahini:     { id: 'm1898', name: 'טחינה גולמית', role: 'fat', kosher: 'parve', allergens: ['sesame'], unit: 'כף', step: 1, min: 1, max: 2, def: 1, prep: 1, nocook: true, words: ['טחינה'] },
  avocado:    { id: 'm3223', name: 'אבוקדו', role: 'fat', kosher: 'parve', allergens: [], unit: 'כף', stepG: 25, min: 25, max: 100, def: 50, prep: 2, nocook: true, words: ['אבוקדו'] },
  almonds:    { id: 'm1823', name: 'שקדים', role: 'fat', kosher: 'parve', allergens: ['nuts'], stepG: 5, min: 10, max: 30, def: 15, prep: 0, nocook: true, words: ['שקדים'] },
  walnuts:    { id: 'm1854', name: 'אגוזי מלך', role: 'fat', kosher: 'parve', allergens: ['nuts'], unit: 'יחידה', stepG: 5, min: 10, max: 30, def: 15, prep: 0, nocook: true, words: ['אגוזים', 'אגוזי מלך'] },
  peanutButter:{ id: 'm1858', name: 'חמאת בוטנים', role: 'fat', kosher: 'parve', allergens: ['peanuts'], unit: 'כף', step: 1, min: 1, max: 2, def: 1, prep: 0, nocook: true, words: ['חמאת בוטנים'] },
  hummusSpread:{ id: 'm1646', name: 'סלט חומוס', role: 'fat', kosher: 'parve', allergens: ['sesame'], unit: 'כף', step: 1, min: 1, max: 3, def: 2, prep: 0, nocook: true, words: ['חומוס', 'ממרח חומוס'] },
};

// תבניות ארוחה. parts: רשימת חלקים; כל חלק = רשימת חלופות (מפתחות ב-COMPONENTS).
// fixed: חלק שלא משנים את כמותו (ירק, שמן), opt: חלק אופציונלי. slots: באילו ארוחות מתאים.
export const TEMPLATES = [
  { id: 'omelet', name: 'חביתה, לחם וסלט', slots: ['breakfast', 'dinner'], parts: [['egg'], ['bread', 'lightBread', 'pita', 'wwPita'], ['salad'], ['oliveOil'], { opt: ['cottage', 'whiteCheese'] }] },
  { id: 'cottageBread', name: 'קוטג׳, לחם וירקות', slots: ['breakfast', 'dinner'], parts: [['cottage', 'whiteCheese'], ['bread', 'lightBread', 'riceCakes'], ['cucumber', 'tomato', 'pepper', 'salad'], { opt: ['hardEgg'] }] },
  { id: 'yogurtOats', name: 'יוגורט, שיבולת שועל ופרי', slots: ['breakfast', 'snack', 'snack1', 'dinner'], parts: [['yogurt'], ['oats'], ['banana', 'apple', 'strawberry'], { opt: ['cottage'] }, { opt: ['almonds', 'walnuts'] }] },
  { id: 'tunaPita', name: 'פיתה עם טונה וסלט', slots: ['lunch', 'dinner', 'breakfast'], parts: [['tuna'], ['pita', 'wwPita', 'bread', 'tortilla'], ['salad', 'cucumber'], { opt: ['tahini', 'hummusSpread'] }] },
  { id: 'chickenRice', name: 'חזה עוף, אורז וסלט', slots: ['lunch', 'dinner'], parts: [['chicken'], ['rice', 'brownRice', 'quinoa', 'bulgur', 'couscous', 'ptitim', 'pita', 'potato', 'sweetPotato'], ['salad', 'broccoli', 'greenBeans'], ['oliveOil', 'tahini']] },
  { id: 'pargitRice', name: 'פרגית, אורז וסלט', slots: ['lunch', 'dinner'], parts: [['thigh'], ['rice', 'brownRice', 'bulgur', 'couscous', 'ptitim'], ['salad', 'greenBeans'], { opt: ['tahini', 'oliveOil'] }] },
  { id: 'turkeyPatties', name: 'קציצות הודו, פתיתים וסלט', slots: ['lunch', 'dinner'], parts: [['turkeyPatty'], ['ptitim', 'rice', 'couscous', 'potato', 'bulgur'], ['salad', 'zucchini', 'greenBeans']] },
  { id: 'steakPotato', name: 'סטייק בקר, תפוח אדמה אפוי וסלט', slots: ['lunch', 'dinner'], parts: [['steak'], ['potato', 'sweetPotato', 'rice'], ['salad', 'greenBeans', 'broccoli']] },
  { id: 'schnitzelRice', name: 'שניצל, אורז וסלט', slots: ['lunch'], parts: [['schnitzel'], ['rice', 'ptitim', 'potato', 'bulgur'], ['salad', 'cucumber']] },
  { id: 'thighPotato', name: 'פרגית בתנור, תפוח אדמה וירק מבושל', slots: ['lunch', 'dinner'], parts: [['thigh'], ['potato', 'sweetPotato', 'rice', 'couscous'], ['greenBeans', 'zucchini', 'broccoli', 'salad']] },
  { id: 'salmonSweet', name: 'סלמון, בטטה וירקות', slots: ['lunch', 'dinner'], parts: [['salmon'], ['sweetPotato', 'potato', 'rice', 'quinoa'], ['broccoli', 'salad', 'greenBeans']] },
  { id: 'fishBulgur', name: 'אמנון, בורגול וסלט', slots: ['lunch', 'dinner'], parts: [['tilapia'], ['bulgur', 'rice', 'couscous', 'potato'], ['salad', 'zucchini'], ['tahini', 'oliveOil']] },
  { id: 'beefPasta', name: 'בקר טחון ברוטב, פסטה וסלט', slots: ['lunch', 'dinner'], parts: [['beef'], ['pasta', 'ptitim', 'rice'], ['salad', 'mushrooms', 'zucchini']] },
  { id: 'lentilRice', name: 'מג׳דרה ביתית: עדשים, אורז וסלט', slots: ['lunch', 'dinner'], parts: [['lentils'], ['rice', 'bulgur', 'brownRice'], ['salad'], ['oliveOil', 'tahini']] },
  { id: 'tofuStir', name: 'טופו מוקפץ עם אורז וירקות', slots: ['lunch', 'dinner'], parts: [['tofu'], ['rice', 'brownRice', 'quinoa'], ['broccoli', 'mushrooms', 'pepper'], ['oliveOil']] },
  { id: 'turkeySandwich', name: 'כריך הודו וירקות', slots: ['lunch', 'breakfast', 'dinner'], parts: [['turkey'], ['bread', 'lightBread', 'pita', 'tortilla'], ['cucumber', 'tomato', 'pepper', 'salad'], { opt: ['hummusSpread', 'avocado'] }] },
  { id: 'chickpeaBowl', name: 'קערת חומוס, פיתה וירקות', slots: ['lunch', 'dinner'], parts: [['chickpeas'], ['pita', 'wwPita'], ['salad'], ['tahini'], { opt: ['hardEgg'] }] },
  { id: 'eggPitaCottage', name: 'פיתה עם ביצים וקוטג׳', slots: ['breakfast', 'lunch', 'dinner'], parts: [['egg', 'hardEgg'], ['pita', 'wwPita'], ['cottage'], { opt: ['cucumber', 'tomato', 'salad'] }] },
  // ארוחות ביניים
  { id: 'cottageFruit', name: 'קוטג׳ ופרי', slots: ['snack', 'snack1', 'night'], parts: [['cottage', 'whiteCheese'], ['apple', 'clementine', 'strawberry']] },
  { id: 'yogurtFruit', name: 'יוגורט ופרי', slots: ['snack', 'snack1', 'night'], parts: [['yogurt'], ['banana', 'apple', 'strawberry'], { opt: ['almonds'] }] },
  { id: 'eggsVeg', name: 'ביצים קשות וירקות', slots: ['snack', 'snack1', 'night'], parts: [['hardEgg'], ['cucumber', 'carrot', 'pepper']] },
  { id: 'cakesCheese', name: 'פריכיות עם גבינה לבנה', slots: ['snack', 'snack1', 'night'], parts: [['whiteCheese', 'cottage'], ['riceCakes'], { opt: ['cucumber', 'tomato'] }] },
  { id: 'milkBanana', name: 'כוס חלב ובננה', slots: ['snack', 'snack1', 'night'], parts: [['milk'], ['banana', 'dates']] },
  { id: 'turkeyRoll', name: 'רולדות הודו וירקות', slots: ['snack', 'snack1', 'night'], parts: [['turkey'], ['cucumber', 'pepper', 'carrot']] },
];

export const COMMON_IDS = new Set(Object.values(COMPONENTS).map(c => c.id));

export const ALLERGENS = { egg: 'ביצים', milk: 'חלב', gluten: 'גלוטן', fish: 'דגים', soy: 'סויה', sesame: 'שומשום', nuts: 'אגוזים', peanuts: 'בוטנים' };

/** זיהוי רכיבים בטקסט חופשי ("יש לי ביצים, קוטג׳ ופיתה") */
export function componentsInText(text) {
  const t = ' ' + String(text || '').replace(/[׳'"״]/g, '').replace(/[,.\n;:!?]/g, ' ').replace(/\sו(?=\S)/g, ' ') + ' ';
  const found = [];
  const entries = Object.entries(COMPONENTS).flatMap(([k, c]) => c.words.map(w => [k, w.replace(/[׳'"״]/g, '')])).sort((a, b) => b[1].length - a[1].length);
  let rest = t;
  for (const [k, w] of entries) {
    const re = new RegExp(`(^|\\s)[הוב]?${w}(?=\\s)`);
    if (re.test(rest)) { if (!found.includes(k)) found.push(k); rest = rest.replace(re, ' '); }
  }
  return found;
}
