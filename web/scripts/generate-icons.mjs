// Génère les icônes de l'application (PWA, favicon, écran d'accueil iPhone) dans public/icons, à partir du
// pictogramme officiel détouré (public/images/logo-mark.png, produit par npm run logo), posé sur un fond violet nuit.
// Usage : npm run icons (les fichiers produits sont versionnés, ce script n'est utile que pour les refaire).
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const MARK = fileURLToPath(new URL('../public/images/logo-mark.png', import.meta.url));
const out = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));

const background = (radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="1" cy="0" r="1.4">
      <stop offset="0" stop-color="#4b2fa8"/>
      <stop offset="0.38" stop-color="#2a1d6b"/>
      <stop offset="1" stop-color="#140f33"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
</svg>`);

/**
 * markWidth : largeur du pictogramme sur 512 px. « any » : grand, coins arrondis. « maskable » : plein cadre, pictogramme
 * dans la zone sûre (cercle de 80 % du côté) : avec un rapport 640/488, une largeur de 300 px y tient.
 */
async function icon(size, name, { markWidth, radius }) {
  const mark = await sharp(MARK).resize({ width: markWidth }).toBuffer();
  const meta = await sharp(mark).metadata();
  const square = await sharp(background(radius))
    .resize(512, 512)
    .composite([{ input: mark, left: Math.round((512 - meta.width) / 2), top: Math.round((512 - meta.height) / 2) }])
    .png()
    .toBuffer();
  await sharp(square).resize(size, size).png({ compressionLevel: 9 }).toFile(out(name));
}

await mkdir(fileURLToPath(new URL('../public/icons/', import.meta.url)), { recursive: true });
const any = { markWidth: 400, radius: 112 };
const maskable = { markWidth: 300, radius: 0 };
await Promise.all([
  icon(192, 'icon-192.png', any),
  icon(512, 'icon-512.png', any),
  icon(512, 'icon-maskable-512.png', maskable),
  icon(180, 'apple-touch-icon.png', maskable), // iOS arrondit lui-même les coins : fond plein cadre
  icon(32, 'favicon-32.png', { markWidth: 460, radius: 96 }),
]);
await rm(out('icon.svg'), { force: true }); // ancienne icône vectorielle (flamme dessinée), remplacée par le logo officiel
console.log('Icônes écrites dans public/icons');
