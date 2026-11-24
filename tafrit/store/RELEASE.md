# הפצה לחנויות — מה מוכן ומה צריך ממך

## מה כבר מוכן במאגר
| רכיב | מיקום |
|---|---|
| פרויקט Android (Capacitor 8, ‏compileSdk 36, RTL) | `tafrit/android` |
| פרויקט iOS (Capacitor 8, ‏iOS 15+, עברית, PrivacyInfo) | `tafrit/ios` |
| בניית קבצי האפליקציה עם כתובת השרת | `node scripts/build-app.mjs && npx cap sync` |
| בנייה אוטומטית בענן (GitHub Actions) | `.github/workflows/tafrit-mobile.yml` |
| אייקונים, מסכי פתיחה, צילומי מסך, תיאור | `tafrit/store/` |
| מדיניות פרטיות ועמוד מחיקת חשבון | `/privacy`, `/delete-account` בשרת |

## שלב 1 — שרת הייצור (Render) — לפני שפותחים הרשמה
הגדר בשירות `tafrit-robi` ← Environment:

| משתנה | ערך |
|---|---|
| `ADMIN_EMAIL` | כתובת הדוא״ל שלך. החשבון הראשון שמאמת את הכתובת הזו הופך למנהל, וברגע זה הנתונים הקיימים עוברים אליו (עם גיבוי מוצפן ובדיקה) |
| `DATA_ENCRYPTION_KEY` | לחיצה על Generate ב-Render (או 64 תווי hex). **שמור עותק במקום בטוח ואל תשנה אותו אחרי שנשמר מידע — בלעדיו אי אפשר לפענח את המידע והגיבויים** |
| `RESEND_API_KEY` | מפתח מ-resend.com (שליחת קודי אימות) |
| `MAIL_FROM` | למשל `תפריטי פרו <no-reply@הדומיין-שלך>` — דורש דומיין מאומת ב-Resend. בלי דומיין אפשר לשלוח רק לכתובת של בעל חשבון Resend |
| `SUPPORT_EMAIL` | כתובת לפניות (מוצגת במדיניות הפרטיות) |
| `PUBLIC_URL` | `https://tafrit-robi.onrender.com` |
| `ANTHROPIC_API_KEY` | לא חובה — מפעיל את המלווה החכם |
| `APP_PASSWORD` | **למחוק** — לא בשימוש יותר (הוחלף בחשבונות) |

אחר כך: היכנס לאתר ← פתיחת חשבון עם `ADMIN_EMAIL` ← אמת ← עוד ← ניהול משתמשים ← הגדר אימות דו-שלבי ← "מצב המערכת" מציג את דוח העברת הנתונים.

## שלב 2 — Apple (App Store)
1. App Store Connect ← My Apps ← + ← New App: פלטפורמה iOS, שם "תפריטי פרו", שפה ראשית Hebrew, Bundle ID ‏`com.rubishua.tafritrobi` (אם תבחר מזהה אחר — עדכן ב-`capacitor.config.json` וב-`ios/App/App.xcodeproj`).
2. Users and Access ← Integrations ← App Store Connect API ← צור מפתח בתפקיד App Manager. הורד את קובץ ה-`.p8`.
3. ב-GitHub ‏(Settings ← Secrets and variables ← Actions) הוסף:
   `APPSTORE_API_KEY_P8` (תוכן הקובץ), `APPSTORE_API_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPLE_TEAM_ID`.
4. הפעל את ה-Workflow ‏`tafrit-mobile` (Actions ← Run workflow). הבנייה החתומה עולה ל-TestFlight.
5. ב-TestFlight הוסף את עצמך כבודק פנימי — זו "הגרסה לבדיקה" לאייפון.
6. מלא App Privacy לפי `store/privacy-declarations.md`, העלה צילומי מסך מ-`store/ios/screenshots`, תיאור מ-`store/listing-he.md`, חשבון הדגמה לבודקים, ושלח לבדיקה.

## שלב 3 — Google Play
1. צור מפתח העלאה (פעם אחת, שמור אותו היטב):
   `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. ב-GitHub Secrets: `ANDROID_KEYSTORE_BASE64` (‏`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (‏upload), `ANDROID_KEY_PASSWORD`.
3. Play Console ← Create app: שם, עברית, App, Free. הפעל Play App Signing.
4. העלאה ראשונה ידנית: הורד את `tafrit-android-release-aab` מה-Workflow והעלה ל-Testing ← Internal testing. (Google דורשת העלאה ידנית ראשונה לפני העלאות אוטומטיות.)
5. לאוטומציה: Google Cloud ← Service account עם הרשאת Release ב-Play Console; הוסף את ה-JSON כ-`PLAY_SERVICE_ACCOUNT_JSON`.
6. מלא Data safety לפי `store/privacy-declarations.md`, כתובת מחיקת חשבון, צילומי מסך מ-`store/android/screenshots`, גרפיקה מוצגת, תיאור.
7. חשבון מפתח אישי חדש ב-Google Play חייב בדיקה סגורה (12 בודקים × 14 יום) לפני פרסום לציבור.

## גרסה לבדיקה בלי חנות
- **Android:** ‏`tafrit-android-debug-apk` מה-Workflow (או הקובץ שנמסר בשיחה) — התקנה ישירה במכשיר (צריך לאשר "התקנה ממקורות לא ידועים").
- **iPhone:** רק דרך TestFlight (שלב 2), כי Apple לא מאפשרת התקנה ישירה בלי חתימה.
