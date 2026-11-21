// הנחיות (prompts) ל-Claude — הועתקו מילה במילה מהתוכנה המקורית (app.html). מספרי השורות ליד כל קטע.
// אין לשנות נוסח בלי אישור: התוצאות (שורות, סכומים, פרטי ת״ז) נשענות עליו.

// 1890
export const TOTAL_RE=/^(סה["״]?כ|סך הכל|סיכום|total)/i;
// 2330-2343 צילומי מסך של חשבון גובים
export const PROMPT=[
 'אתה מחלץ נתונים מצילום מסך של רשימת גבייה בעברית. בתמונה יש רשימת חייבים, ולפעמים גם רשימת הוצאות.',
 'כל שורה בנויה בדרך כלל כך: שם, סכום (₪), ושם הגובה בסוף השורה. הסדר והפורמט יכולים להשתנות קצת.',
 'החזר JSON בלבד, בלי הסבר, בדיוק בצורה הזו:',
 '{"debts":[{"name":"שם","amount":1234,"collector":"שם הגובה","uncertain":false}],"expenses":[{"name":"שם","amount":300,"collector":"שם הגובה","uncertain":false}],"note":""}',
 'כללים:',
 '- העתק כל שורה שמופיעה בתמונה, אחת לאחת ובסדר שבו היא מופיעה. אל תדלג על שורות, אל תאחד שורות ואל תוסיף שורות.',
 '- שורות מתחת לכותרת "הוצאות" נכנסות ל-expenses. כל השאר נכנס ל-debts.',
 '- amount הוא מספר בלבד, בלי ₪ ובלי פסיקים.',
 '- collector הוא שם הגובה כפי שהוא כתוב בשורה. אם אין שם גובה בשורה, החזר מחרוזת ריקה.',
 '- אל תכלול שורות סיכום כמו "סה״כ".',
 '- אם שם או ספרה לא ברורים, כתוב את הניחוש הטוב ביותר וסמן uncertain:true. אל תמציא נתונים שלא נראים בתמונה.',
 '- אם אין בתמונה רשימת גבייה, החזר רשימות ריקות והסבר ב-note.'
].join('\n');
// 2769-2784 צילומי מסך של רשימת איסוף יומי (וגם רשימות פיצול/עבודה)
export const PROMPT_W=[
 'אתה מחלץ נתונים מצילום מסך של רשימת חייבים לאיסוף יומי בעברית. כל שורה כוללת בדרך כלל שם חייב, סכום (₪) ושעת איסוף, ולפעמים גם טלפון והערות.',
 'החזר JSON בלבד, בלי הסבר, בדיוק בצורה הזו:',
 '{"items":[{"name":"שם","amount":1234,"time":"09:30","status":"","phone":"","collector":"","uncertain":false}],"note":""}',
 'כללים:',
 '- העתק כל שורה שמופיעה בתמונה, אחת לאחת ובסדר שבו היא מופיעה. אל תדלג על שורות, אל תאחד שורות ואל תוסיף שורות.',
 '- name הוא שם החייב בלבד, בלי טלפון ובלי הערות או הוראות.',
 '- amount הוא מספר בלבד, בלי ₪ ובלי פסיקים.',
 '- time הוא שעת האיסוף בפורמט 24 שעות HH:MM, למשל 09:30 או 14:00. אם כתוב רק מספר שעה כתוב אותו עם :00. אם כתוב טווח שעות החזר את שעת ההתחלה. אם כתוב בבוקר, בצהריים, אחר הצהריים או בערב המר ל-24 שעות. אם אין שעה בשורה החזר מחרוזת ריקה.',
 '- status הוא סטטוס השורה. אם במקום שעה (או לצד השעה) כתוב "לעבור" החזר בדיוק "לעבור". אם כתוב "נאסף" (או "נאספה") החזר בדיוק "נאסף". אם כתוב "לא נאסף" החזר בדיוק "לא נאסף". בכל מקרה אחר החזר מחרוזת ריקה. אל תכתוב את המילה הזו בתוך name, ואם במקום השעה כתוב מילה כזו החזר time ריק.',
 '- phone הוא מספר הטלפון של החייב אם הוא מופיע בשורה, בספרות בלבד (למשל 0501234567). אם אין טלפון בשורה החזר מחרוזת ריקה. אל תמציא ואל תנחש ספרות.',
 '- collector הוא שם הגובה שאוסף את הכסף מהחייב, אם הוא כתוב ליד החייב באותה שורה (למשל עידן או טאייה). אם אין שם גובה בשורה החזר מחרוזת ריקה. אל תכתוב את שם הגובה בתוך name.',
 '- אל תכלול שורות סיכום כמו "סה״כ".',
 '- אם שם, ספרה או שעה לא ברורים, כתוב את הניחוש הטוב ביותר וסמן uncertain:true. אל תמציא נתונים שלא נראים בתמונה.',
 '- אם אין בתמונה רשימת חייבים, החזר items ריק והסבר ב-note.'
].join('\n');
// 6166-6176 צילומי מסך של הלוואות שניתנו (חשבון בוקר)
export const PROMPT_L=[
     'אתה מחלץ נתונים מצילום מסך של רשימת הלוואות שניתנו ללקוחות, בעברית. כל שורה כוללת בדרך כלל שם לקוח וסכום הלוואה (₪), ולפעמים עוד פרטים.',
     'החזר JSON בלבד, בלי הסבר, בדיוק בצורה הזו:',
     '{"items":[{"name":"שם","amount":1234,"uncertain":false}],"note":""}',
     'כללים:',
     '- העתק כל הלוואה שמופיעה בתמונה, אחת לאחת ובסדר שבו היא מופיעה. אל תדלג, אל תאחד ואל תוסיף שורות.',
     '- name הוא שם הלקוח בלבד, בלי הערות. amount הוא הסכום שניתן בהלוואה, מספר בלבד בלי ₪ ובלי פסיקים.',
     '- אל תכלול שורות סיכום כמו "סה״כ".',
     '- אם שם או ספרה לא ברורים, כתוב את הניחוש הטוב ביותר וסמן uncertain:true. אל תמציא נתונים שלא נראים בתמונה.',
     '- אם אין בתמונה רשימת הלוואות, החזר items ריק והסבר ב-note.'
    ].join('\n');
// 7752 כללי בדיקת נוסח היתר עסקה
export const SG_ISSUE_RULES='סימונים בצורה {{...}} הם שדות שמתמלאים אוטומטית מהקוביות, ואין לסמן אותם כחסרים. בדוק את הנוסח וסמן מה צריך לערוך: (1) מקומות ריקים או חסרים, כמו קווים ____ או שם, סכום או תאריך חסרים. (2) סתירות בין הנוסח לבין הפרטים שבטופס. (3) מילים שלא נקראו בבירור וסומנו [?]. (4) סעיפים חסרים בהיתר עסקה: סכום ההשקעה, חלוקת הרווח, מועד פירעון, ומי נאמן לטעון הפסד. (5) ניסוח שנראה כהלוואה בריבית רגילה ולא כעסקה, שכדאי להעביר לרב. (6) אם החוזה לא קובע במפורש בכמה תשלומים משלמים, באיזו תדירות (חודשי או שבועי) ומה סכום כל תשלום, סמן זאת כסעיף חסר. לכל נקודה החזר: quote, קטע מדויק מהנוסח שהועתק מילה במילה (עד שורה אחת), או מחרוזת ריקה אם הבעיה היא סעיף שחסר. problem, משפט קצר בעברית שמסביר מה לא בסדר. fix, הטקסט שיחליף את הקטע, או מחרוזת ריקה אם צריך החלטה של בעל החוזה. עד 12 נקודות, החשובות קודם. אל תמציא פרטים שלא מופיעים. אם הכל תקין, החזר issues ריק.';
// 7756-7762 ייבוא חוזה מצילום מסך
export const CONTRACT_IMPORT_PROMPT='התמונה היא צילום מסך של חוזה, שטר או היתר עסקה בעברית. המטרה: להפוך אותו לתבנית שבה כל פרט שמשתנה מלקוח ללקוח מוחלף בשדה. '+
    '1) העתק את הטקסט המלא במדויק, כפסקאות מופרדות בשורה ריקה. הפסקה הראשונה היא הפתיח, בלי כותרת ובלי מספור פסקאות. '+
    '2) בכל מקום שיש פרט ספציפי לחוזה הזה, כמו שם, ת.ז., סכום, תאריך, מקום, כתובת, טלפון, אחוז או בטוחה, החלף אותו בשדה בצורה {{שם השדה}}. '+
    'השתמש בשמות האלה כשהם מתאימים: {{משקיע}} (המלווה או נותן הכסף), {{לקוח}} (המפעיל או הלווה), {{ת.ז. לקוח}}, {{סכום}} (סכום ההשקעה עם המטבע, למשל 10,000 ש"ח, מוחלף כולו בשדה), {{רווח}} (הרווח או התוספת המוסכמת, עם המטבע), {{סה"כ}} (הסכום הכולל להחזר, עם המטבע), {{תאריך}} (תאריך החתימה), {{פירעון}} (מועד הפירעון), {{מספר תשלומים}}, {{החזר חודשי}} (סכום ההחזר החודשי עם המטבע), {{החזר שבועי}} (סכום ההחזר השבועי עם המטבע), {{סכום תשלום}} (סכום תשלום אחד שאינו חודשי), {{מקום}}. '+
    'פרט אחר מקבל שם קצר בעברית שאתה בוחר, כמו {{כתובת לקוח}} או {{סכום במילים}}, ואותו פרט שחוזר כמה פעמים מקבל את אותו שדה. טקסט קבוע של החוזה נשאר כמו שהוא. '+
    '3) מילה שלא נקראה בבירור סמן בנוסח כ-[?]. '+
    'החזר רק JSON בצורה: {"template": string, "builtin": {"investor": string, "operator": string, "operatorId": string, "amount": number|null, "profit": number|null, "currency": "₪"|"$"|"€"|null, "date": "YYYY-MM-DD"|null, "repay": "YYYY-MM-DD"|null, "payments": number|null, "frequency": "monthly"|"weekly"|null, "installment": number|null, "place": string}, "custom": {"שם השדה": "הערך כפי שנקרא"}, "issues": [{"quote": string, "problem": string, "fix": string}]}. '+SG_ISSUE_RULES;
// 7807 בדיקת נוסח היתר עסקה
export const contractReviewPrompt=(d,text)=>'להלן נוסח של היתר עסקה בעברית והפרטים שהוזנו בטופס.\n\nפרטי הטופס:\n'+JSON.stringify(d)+'\n\nהנוסח:\n'+text+'\n\n'+SG_ISSUE_RULES+' החזר רק JSON בצורה {"issues": [{"quote": string, "problem": string, "fix": string}]}.';
// 7850-7876 סריקת עמוד חוזה (טקסט מלא, לא JSON)
export function sgOsPrompt(idx,total,parts){
  const where=parts>1
    ?'The '+parts+' attached images are horizontal strips of ONE page, in order from the top of the page to the bottom. Neighbouring strips overlap by a few lines: transcribe every line exactly once, in page order, and do not repeat lines that appear in two strips.'
    :'The attached image is one page.';
  return ['Task: exact transcription (OCR) of a scanned document page. '+where+' It is page '+idx+' of '+total+' that the user uploaded for this document.',
    '',
    'Transcribe ALL the text on the page exactly as it is written, in its original language or languages. Hebrew is read right to left.',
    '',
    'Rules:',
    '- Output only the text of the page: no introduction, no comments, no explanations, no Markdown (no #, no **, no code fences).',
    '- Copy the wording exactly. Do not translate, summarise, shorten, correct spelling or grammar, reword, complete or add anything.',
    '- Do not assume what kind of document or contract this is. Do not add any clause, term, heading or standard wording that is not visibly written on this page.',
    '- Copy numbers, amounts, dates, ID numbers and phone numbers digit by digit.',
    '- Keep the layout: each heading on its own line, a blank line between paragraphs, clause and sub-clause numbering exactly as printed (1., 1.1, א., (ב) and so on), list items line by line.',
    '- Handwritten text and filled-in details: transcribe them where they appear. An empty fill-in line stays as ______.',
    '- Tables: one row per line, with cells separated by " | ".',
    '- Checkboxes: ☐ for empty, ☒ for marked.',
    '- Text you cannot read with certainty: write [לא קריא] in its place. Never guess.',
    '- A handwritten signature: write [חתימה]. A stamp or seal: write [חותמת], followed by its readable text if there is any.',
    '- Include printed headers, footers and page numbers as they appear.',
    '- If the page has no text at all, output exactly: [עמוד ריק]'].join('\n');
}
export function sgOsClean(t){
  t=String(t||'').replace(/\r\n?/g,'\n');
  t=t.replace(/^\s*```[^\n]*\n/,'').replace(/\n?```\s*$/,'');
  return t.replace(/^\s*\n/,'').replace(/\s+$/,'');
}
// 7991-8004 ת״ז: ספרות, ספרת ביקורת, תאריך
export const fxDigits=v=>String(v||'').replace(/\D/g,'');
export function fxIdValid(v){
  v=fxDigits(v); if(!v||v.length>9) return false;
  v=v.padStart(9,'0'); let s=0;
  for(let i=0;i<9;i++){ let d=Number(v[i])*((i%2)+1); if(d>9) d-=9; s+=d; }
  return s%10===0;
}
export function fxNormDate(s){
  const t=String(s||'').trim(), m=t.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if(!m) return t;
  let y=m[3]; if(y.length===2) y=(Number(y)>30?'19':'20')+y;
  return m[1].padStart(2,'0')+'.'+m[2].padStart(2,'0')+'.'+y;
}
// 8121-8135 עוזר המילוי: זיהוי המקומות למילוי בחוזה
export function fxDetectPrompt(marked){
  return ['You help fill in a contract. Below is the full text of the contract, exactly as written. Every place the program found that might need to be filled in is marked ⟦S1⟧, ⟦S2⟧ and so on: blank lines (____), dotted lines, empty table cells, or a label that ends with a colon and has nothing after it.',
    '',
    '1. Identify the parties of the contract (for example צד א׳ / צד ב׳, המלווה / הלווה, המשכיר / השוכר, המוכר / הקונה). For each party give a short key ("A", "B", "C"…), the name the contract uses for it (in Hebrew, as written) and its role if the contract states one. If the contract does not name parties, return an empty list.',
    '2. For EVERY marker decide what should be written there:',
    '   - field: one of fullName, firstName, lastName, idNumber, birthDate, address, phone, email, date, amount, signature, other, none. Use fullName for a place that asks for a person\'s name (שם, שם מלא); firstName and lastName only when the contract asks for them separately. "none" means it is not a place to fill in, for example a heading that ends with a colon.',
    '   - party: the key of the party this place belongs to, or "" if it does not belong to one party (contract date, amount, place of signing…). In a table of the parties\' details, use the row and the column header.',
    '   - label: a short Hebrew description of what goes there, for example "שם המשכיר", "ת.ז. השוכר", "תאריך החוזה", "סכום ההלוואה".',
    '3. Optionally list up to 20 more places to fill in that have NO marker, for example "ת.ז. מס׳" followed directly by other text. For each give "after": the exact text from the contract, copied character for character, 4 to 40 characters long and appearing only once in the contract, that comes right before the empty place; plus field, party and label.',
    '',
    'Rules: do not assume what kind of contract this is, do not add clauses, and do not suggest changing any wording.',
    'Reply with only JSON in this shape:',
    '{"parties":[{"key":"A","name":"","role":""}],"slots":[{"id":"S1","field":"","party":"","label":""}],"extra":[{"after":"","field":"","party":"","label":""}]}',
    '','CONTRACT:','<<<',marked,'>>>'].join('\n');
}
// 8367-8376 סריקת תעודת זהות
export function fxIdPrompt(n){
  return ['The attached image'+(n>1?'s are photos':' is a photo')+' of an Israeli identity card (תעודת זהות)'+(n>1?': image 1 is the front of the card, image 2 is the appendix (ספח) or the back of the card.':', front side.'),
    'Read the details exactly as printed. Never guess: if a detail is not visible or not readable with certainty, leave it empty.',
    'Reply with only JSON: {"firstName":"","lastName":"","idNumber":"","birthDate":"","address":"","notes":""}',
    '- firstName, lastName: in Hebrew, as printed (שם פרטי, שם משפחה).',
    '- idNumber: מספר זהות, digits only, including the check digit and any leading zeros.',
    '- birthDate: תאריך לידה in the Gregorian calendar, as DD.MM.YYYY.',
    '- address: the address (כתובת) from the appendix as printed: street, house number, city. Empty if no address is visible.',
    '- notes: one short Hebrew sentence if something could not be read, otherwise empty.'].join('\n');
}
