// על מה מבוססות ההמלצות. שני סוגים:
//  kind: 'research' / 'guideline' / 'data' — מקור חיצוני שניתן לפתוח
//  kind: 'decision' — החלטת תוכנה (כלל עבודה של האפליקציה), לא ממצא מחקרי
export const SOURCES = {
  mifflin: {
    kind: 'research', year: 1990,
    title: 'A new predictive equation for resting energy expenditure in healthy individuals',
    authors: 'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO', journal: 'Am J Clin Nutr 51(2):241–247',
    url: 'https://doi.org/10.1093/ajcn/51.2.241',
    supports: 'הנוסחה שבה מחושבת ההוצאה האנרגטית במנוחה (BMR) לפי משקל, גובה, גיל ומין, אצל מבוגרים בריאים.',
  },
  frankenfield: {
    kind: 'research', year: 2005,
    title: 'Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review',
    authors: 'Frankenfield D, Roth-Yousey L, Compher C', journal: 'J Am Diet Assoc 105(5):775–789',
    url: 'https://doi.org/10.1016/j.jada.2005.02.005',
    supports: 'סקירה שיטתית: נוסחת Mifflin–St Jeor הייתה המדויקת ביותר, אך אצל חלק מהאנשים הסטייה עולה על 10%. לכן ההוצאה היומית מוצגת כטווח.',
  },
  compendium: {
    kind: 'research', year: 2011,
    title: '2011 Compendium of Physical Activities: a second update of codes and MET values',
    authors: 'Ainsworth BE, Haskell WL, Herrmann SD ואחרים', journal: 'Med Sci Sports Exerc 43(8):1575–1581',
    url: 'https://doi.org/10.1249/MSS.0b013e31821ece12',
    supports: 'ערכי MET לאימוני כוח ולאירובי, שמהם מחושבות קלוריות האימון (נטו, מעבר למנוחה).',
  },
  hall2011: {
    kind: 'research', year: 2011,
    title: 'Quantification of the effect of energy imbalance on bodyweight',
    authors: 'Hall KD, Sacks G, Chandramohan D ואחרים', journal: 'Lancet 378(9793):826–837',
    url: 'https://doi.org/10.1016/S0140-6736(11)60812-X',
    supports: 'הכלל "7,700 קק״ל לק״ג" הוא קירוב שמאבד דיוק לאורך זמן, כי הגוף מסתגל. לכן היעד נבדק מול מגמת המשקל בפועל ולא רק לפי חישוב.',
  },
  issn2017: {
    kind: 'guideline', year: 2017,
    title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
    authors: 'Jäger R, Kerksick CM, Campbell BI ואחרים', journal: 'J Int Soc Sports Nutr 14:20',
    url: 'https://doi.org/10.1186/s12970-017-0177-8',
    supports: 'לאנשים שמתאמנים מומלצים 1.4–2.0 גרם חלבון לק״ג ליום, ובגירעון קלורי עם אימוני כוח ייתכן צורך בערכים גבוהים יותר לשמירה על מסת שריר.',
  },
  morton2018: {
    kind: 'research', year: 2018,
    title: 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength',
    authors: 'Morton RW, Murphy KT, McKellar SR ואחרים', journal: 'Br J Sports Med 52(6):376–384',
    url: 'https://doi.org/10.1136/bjsports-2017-097608',
    supports: 'עם אימוני כוח, התועלת של חלבון למסת שריר מתמתנת סביב 1.6 גרם לק״ג ליום (רווח סמך עליון כ-2.2). מכאן הטווח 1.6–2.2.',
  },
  helms2014: {
    kind: 'research', year: 2014,
    title: 'A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes',
    authors: 'Helms ER, Zinn C, Rowlands DS, Brown SR', journal: 'Int J Sport Nutr Exerc Metab 24(2):127–138',
    url: 'https://doi.org/10.1123/ijsnem.2013-0054',
    supports: 'בגירעון קלורי עם אימוני כוח, צריכת חלבון גבוהה יותר עוזרת לשמור על מסת שריר. משמש לבחירת יעד בחלק העליון של הטווח בירידה בשומן.',
  },
  schoenfeld2018: {
    kind: 'research', year: 2018,
    title: 'How much protein can the body use in a single meal for muscle-building? Implications for daily protein distribution',
    authors: 'Schoenfeld BJ, Aragon AA', journal: 'J Int Soc Sports Nutr 15:10',
    url: 'https://doi.org/10.1186/s12970-018-0215-1',
    supports: 'מומלץ לחלק את החלבון לכמה ארוחות, כ-0.4 גרם לק״ג בארוחה לאורך היום. מכאן החלוקה בין הארוחות שבחרת.',
  },
  protage: {
    kind: 'guideline', year: 2013,
    title: 'Evidence-based recommendations for optimal dietary protein intake in older people: a position paper from the PROT-AGE Study Group',
    authors: 'Bauer J, Biolo G, Cederholm T ואחרים', journal: 'J Am Med Dir Assoc 14(8):542–559',
    url: 'https://doi.org/10.1016/j.jamda.2013.05.021',
    supports: 'מעל גיל 65 מומלצים לפחות 1.0–1.2 גרם חלבון לק״ג ליום, כשאין מחלת כליה.',
  },
  kdigo2024: {
    kind: 'guideline', year: 2024,
    title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease',
    authors: 'Kidney Disease: Improving Global Outcomes (KDIGO) CKD Work Group', journal: 'Kidney Int 105(4S):S117–S314',
    url: 'https://doi.org/10.1016/j.kint.2023.10.018',
    supports: 'במחלת כליה כרונית כמות החלבון נקבעת באופן אישי ובליווי מקצועי. לכן במצב כזה האפליקציה לא מחשבת יעד חלבון בעצמה.',
  },
  iraki2019: {
    kind: 'research', year: 2019,
    title: 'Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review',
    authors: 'Iraki J, Fitschen P, Espinar S, Helms E', journal: 'Sports 7(7):154',
    url: 'https://doi.org/10.3390/sports7070154',
    supports: 'לעלייה במסת שריר מומלץ קצב עלייה איטי של כ-0.25%–0.5% ממשקל הגוף בשבוע (עודף קלורי מתון), כדי לצמצם הצטברות שומן.',
  },
  reynolds2019: {
    kind: 'research', year: 2019,
    title: 'Carbohydrate quality and human health: a series of systematic reviews and meta-analyses',
    authors: 'Reynolds A, Mann J, Cummings J ואחרים', journal: 'Lancet 393(10170):434–445',
    url: 'https://doi.org/10.1016/S0140-6736(18)31809-9',
    supports: 'צריכת סיבים של 25–29 גרם ביום ומעלה קשורה לתוצאות בריאות טובות יותר. משמש כיעד סיבים יומי.',
  },
  who_diet: {
    kind: 'guideline', year: 2020,
    title: 'Healthy diet — Fact sheet',
    authors: 'World Health Organization', journal: 'WHO',
    url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
    supports: 'לפחות 400 גרם ירקות ופירות ביום. משמש כיעד הירקות והפירות בהמלצות הארוחות.',
  },
  iom_macros: {
    kind: 'guideline', year: 2005,
    title: 'Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids',
    authors: 'Institute of Medicine (National Academies)', journal: 'National Academies Press',
    url: 'https://doi.org/10.17226/10490',
    supports: 'טווחים מקובלים למבוגרים: שומן 20–35% מהקלוריות ופחמימות 45–65%. יעד השומן נקבע בתוך הטווח הזה, והפחמימות משלימות את היתרה.',
  },
  barakat2020: {
    kind: 'research', year: 2020,
    title: 'Body Recomposition: Can Trained Individuals Build Muscle and Lose Fat at the Same Time?',
    authors: 'Barakat C, Pearson J, Escalante G, Campbell B, De Souza EO', journal: 'Strength Cond J 42(5):7–21',
    url: 'https://doi.org/10.1519/SSC.0000000000000584',
    supports: 'שיפור הרכב הגוף (פחות שומן ויותר שריר בו-זמנית) אפשרי עם אימוני כוח, חלבון גבוה וגירעון קלורי קטן. מכאן הגירעון המתון במטרה הזו.',
  },
  moh_db: {
    kind: 'data', year: 2023,
    title: 'מאגר התזונה הלאומי הישראלי (צמרת)',
    authors: 'משרד הבריאות', journal: 'data.gov.il',
    url: 'https://data.gov.il/dataset/nutrition-database',
    supports: 'ערכים תזונתיים ל-100 גרם ומשקלי יחידות מידה (כף, פרוסה, גביע, ביצה בגדלים שונים) לכל מזון במאגר.',
  },
  usda_fdc: {
    kind: 'data', year: 2024,
    title: 'FoodData Central',
    authors: 'U.S. Department of Agriculture, Agricultural Research Service', journal: 'fdc.nal.usda.gov',
    url: 'https://fdc.nal.usda.gov/',
    supports: 'מקור משלים למזונות שאינם במאגר הישראלי.',
  },
  // ---- החלטות תוכנה ----
  dec_activity: {
    kind: 'decision',
    title: 'רמת פעילות בלי כפילות',
    supports: 'גורם הפעילות היומיומית לפי סוג העבודה לא כולל אימונים. קלוריות האימונים מתווספות בנפרד, כממוצע שבועי. כשבוחרים "רמת פעילות כללית שכוללת אימונים", קלוריות האימון לא מתווספות שוב. כשמספר הצעדים ידוע, הליכה מעבר ל-3,000 צעדים מחושבת לפי הצעדים, וגורם העבודה מופחת בהתאם.',
  },
  dec_floor: {
    kind: 'decision',
    title: 'גבולות בטיחות ליעד',
    supports: 'הגירעון מוגבל ל-25% מההוצאה היומית, והיעד לא יורד מתחת להוצאה במנוחה או מתחת ל-1,500 קק״ל (גבר) / 1,200 קק״ל (אישה). היעד מעוגל ל-50 קק״ל.',
  },
  dec_refweight: {
    kind: 'decision',
    title: 'משקל ייחוס לחישוב חלבון',
    supports: 'כש-BMI הוא 30 ומעלה, החלבון מחושב לפי משקל ייחוס (משקל שמתאים ל-BMI 25, או משקל היעד אם הוא גבוה ממנו). זה נוהג מקובל בתזונה קלינית ולא ממצא של מחקר מסוים. אפשר לבחור במשקל הנוכחי במקום.',
  },
  dec_weekavg: {
    kind: 'decision',
    title: 'ממוצע שבועי',
    supports: 'הממוצע מחושב מיום ראשון עד שבת: סכום השקילות חלקי מספר הימים שבהם נשקלת בפועל. יום בלי שקילה לא נכנס לחישוב.',
  },
  dec_macros: {
    kind: 'decision',
    title: 'חלוקת פחמימות ושומן',
    supports: 'שומן: 28% מהקלוריות בחיטוב ובשיפור הרכב הגוף, 30% בשמירת משקל ו-25% בעלייה במסה, ולא פחות מ-0.6 ג׳ לק״ג. הפחמימות משלימות את היתרה (לפחות 50 ג׳). המספרים מעוגלים ל-5 ג׳.',
  },
  dec_plans: {
    kind: 'decision',
    title: 'תקופות ותוכניות',
    supports: 'כל תוכנית חלה מתאריך ההתחלה שלה עד היום שלפני התוכנית הבאה. דוחות של ימים קודמים מוצגים לפי התוכנית שהייתה בתוקף באותו יום, ולכן החלפת תוכנית לא משנה את ההיסטוריה.',
  },
  dec_review: {
    kind: 'decision',
    title: 'מתי מוצעת התאמת יעד',
    supports: 'התאמת קלוריות מוצעת רק אם בשבועיים מלאים ברציפות יש פער מהקצב שבחרת, וגם בכל שבוע לפחות 3 שקילות. השינוי מתון: חצי מהפער המשוער, בין 100 ל-200 קק״ל. ימים שלא סומנו כמתועדים במלואם לא נכנסים לממוצע האכילה.',
  },
  dec_weighing: {
    kind: 'decision',
    title: 'תנאי שקילה',
    supports: 'מומלץ להישקל בתנאים דומים: בבוקר, אחרי השירותים ולפני אוכל ושתייה. כך התנודות היומיות קטנות יותר.',
  },
  dec_portions: {
    kind: 'decision',
    title: 'כמויות מעשיות',
    supports: 'כמויות ההצעה מעוגלות ליחידות שאפשר להגיש בפועל: ביצה שלמה, חצי פיתה, פרוסה, כף, או 10 גרם. לכן הסכום יכול לסטות במעט מהיעד המדויק.',
  },
};

export function source(id) { return SOURCES[id] ? { id, ...SOURCES[id] } : null; }
export function sourcesFor(ids) { return [...new Set(ids)].map(source).filter(Boolean); }
