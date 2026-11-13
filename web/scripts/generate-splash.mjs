// Génère les écrans de lancement iPhone et iPad (public/splash), déclarés dans app/layout.tsx. iOS n'utilise pas le
// manifeste pour l'écran de lancement d'une application installée : il lui faut une image par taille d'écran.
// Même dessin que l'écran de l'application (components/Splash.tsx) : fond violet nuit, pictogramme de 120 px CSS au
// centre, pour qu'on passe de l'un à l'autre sans saut. Usage : npm run splash (fichiers produits versionnés).
import { mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const MARK = fileURLToPath(new URL('../public/images/logo-mark.png', import.meta.url));
const DIR = fileURLToPath(new URL('../public/splash/', import.meta.url));
const SCREENS = JSON.parse(await readFile(new URL('../lib/apple-splash.json', import.meta.url), 'utf8'));
const MARK_CSS_HEIGHT = 120; // = SPLASH_MARK

// Même dégradé que la classe .night : radial-gradient(120% 140% at 100% 0%, #4b2fa8 0%, #2a1d6b 38%, #140f33 100%).
const background = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"
      gradientTransform="translate(${w} 0) scale(${1.2 * w} ${1.4 * h})">
      <stop offset="0" stop-color="#4b2fa8"/>
      <stop offset="0.38" stop-color="#2a1d6b"/>
      <stop offset="1" stop-color="#140f33"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
</svg>`);

await rm(DIR, { recursive: true, force: true });
await mkdir(DIR, { recursive: true });
for (const { w, h, dpr } of SCREENS) {
  const [pw, ph] = [w * dpr, h * dpr];
  const mark = await sharp(MARK).resize({ height: MARK_CSS_HEIGHT * dpr }).toBuffer();
  const meta = await sharp(mark).metadata();
  await sharp(background(pw, ph))
    .composite([{ input: mark, left: Math.round((pw - meta.width) / 2), top: Math.round((ph - meta.height) / 2) }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(`${DIR}apple-splash-${pw}x${ph}.png`);
}
console.log(`${SCREENS.length} écrans de lancement écrits dans public/splash`);
