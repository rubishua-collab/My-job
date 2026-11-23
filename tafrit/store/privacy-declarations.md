# הצהרות פרטיות לחנויות — לפי אופן הפעולה בפועל

הקוד שמממש כל סעיף: `server/auth.js`, `server/db.js`, `server/ai.js`, `public/privacy.html`.

## App Store — App Privacy ("תוויות תזונה")
**Data Used to Track You:** אין. (אין SDK פרסום, אין אנליטיקה של צד שלישי, אין IDFA.)

**Data Linked to You** — כולם למטרה App Functionality בלבד:
| סוג | פירוט | למה |
|---|---|---|
| Contact Info → Email Address | כתובת הדוא״ל | הרשמה, אימות, שחזור סיסמה |
| Health & Fitness → Health | משקל, גובה, הנחיות רפואיות שהמשתמש בחר להזין | חישוב יעדים |
| Health & Fitness → Fitness | אימונים, צעדים, רמת פעילות | חישוב הוצאה אנרגטית |
| User Content → Other User Content | יומן אכילה, תפריטים, מתכונים, שיחות עם המלווה | הפעלת האפליקציה |
| Identifiers → User ID | מזהה חשבון פנימי | שיוך הנתונים לחשבון |

לא נאסף: מיקום, אנשי קשר, תמונות, נתוני שימוש לאנליטיקה, נתוני אבחון של צד שלישי.
**Third-party sharing:** אם המשתמש אישר את המלווה החכם — השאלה ונתונים מינימליים נשלחים ל-Anthropic לצורך התשובה בלבד (Service provider; לא למטרות פרסום).
קובץ ההצהרה בפרויקט: `ios/App/App/PrivacyInfo.xcprivacy`. ‏ITSAppUsesNonExemptEncryption=false (רק HTTPS והצפנה סטנדרטית של מערכת ההפעלה/Node).

## Google Play — Data safety
- **האם האפליקציה אוספת או משתפת נתוני משתמש?** כן (אוספת).
- **הנתונים מוצפנים בתעבורה?** כן.
- **אפשר לבקש מחיקה?** כן — בתוך האפליקציה ובכתובת https://tafrit-robi.onrender.com/delete-account
| קטגוריה | נאסף | משותף | חובה/אופציונלי | מטרה |
|---|---|---|---|---|
| Personal info → Email address | כן | לא | חובה | Account management |
| Personal info → User IDs | כן | לא | חובה | Account management |
| Health and fitness → Health info | כן | לא* | אופציונלי (חלק מהשדות) | App functionality |
| Health and fitness → Fitness info | כן | לא* | אופציונלי | App functionality |
| App activity → Other user-generated content | כן | לא* | אופציונלי | App functionality |
\* העברה ל-Anthropic מתבצעת רק לאחר הסכמה מפורשת, כספק שירות לטובת המשתמש; לפי הגדרות Google, העברה לספק שירות שמעבד מטעמך אינה "שיתוף". אם תעדיף זהירות — סמן "משותף" עבור Health info ו-User content עם מטרה App functionality.
- **אין** פרסומות, אין Advertising ID, אין מכירת מידע.
- **קהל יעד:** 18+.
