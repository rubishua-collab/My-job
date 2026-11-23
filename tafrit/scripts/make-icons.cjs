// יוצר אייקונים לכל הגדלים (אתר, Android, iOS, חנויות) מאותו ציור וקטורי. דורש Playwright.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const art = (s, { bg = true, pad = 0 } = {}) => `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="${-pad} ${-pad} ${512 + 2 * pad} ${512 + 2 * pad}">${bg ? `<rect x="${-pad}" y="${-pad}" width="${512 + 2 * pad}" height="${512 + 2 * pad}" fill="#1f7a52"/>` : ''}<circle cx="256" cy="276" r="150" fill="#f6f4ef"/><circle cx="256" cy="276" r="112" fill="none" stroke="#1f7a52" stroke-width="14"/><path d="M256 108c40-40 92-36 110-30-6 40-40 78-96 74" fill="#9fd3b6"/><rect x="246" y="96" width="20" height="70" rx="10" fill="#7a4a1f"/><text x="256" y="320" font-family="Arial" font-weight="700" font-size="120" text-anchor="middle" fill="#1f7a52">ר</text></svg></body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const out = async (file, s, opts, omitBackground = false) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await p.setViewportSize({ width: s, height: s }); await p.setContent(art(s, opts)); await p.screenshot({ path: file, clip: { x: 0, y: 0, width: s, height: s }, omitBackground }); };
  // אתר
  for (const [s, n] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) await out(path.join(ROOT, 'public/icons', n), s);
  // חנויות
  await out(path.join(ROOT, 'store/icon-1024.png'), 1024);
  await out(path.join(ROOT, 'store/android/icon-512.png'), 512);
  // Android
  const A = path.join(ROOT, 'android/app/src/main/res');
  if (fs.existsSync(A)) for (const [d, s, f] of [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]) {
    await out(`${A}/mipmap-${d}/ic_launcher.png`, s); await out(`${A}/mipmap-${d}/ic_launcher_round.png`, s);
    await out(`${A}/mipmap-${d}/ic_launcher_foreground.png`, f, { bg: false, pad: 130 }, true);
  }
  if (fs.existsSync(A)) fs.writeFileSync(`${A}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#1F7A52</color></resources>\n');
  // iOS: אייקון יחיד 1024 (Xcode 14+), בלי שקיפות
  const I = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  if (fs.existsSync(I)) { for (const f of fs.readdirSync(I)) if (f.endsWith('.png')) fs.rmSync(path.join(I, f)); await out(`${I}/AppIcon-512@2x.png`, 1024);
    fs.writeFileSync(`${I}/Contents.json`, JSON.stringify({ images: [{ filename: 'AppIcon-512@2x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)); }
  await b.close(); console.log('icons ok');
})();
