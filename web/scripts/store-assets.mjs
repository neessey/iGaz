// Génère les visuels de la fiche Play Store dans docs/play-store/ :
// - feature-graphic.png (1024 × 500, bannière obligatoire) : pictogramme + « iGaz CI » + slogan sur fond violet nuit ;
// - icon-512.png (icône haute définition de la fiche, 512 × 512).
// Usage : npm run store-assets (après npm run logo et npm run icons).
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = (name) => fileURLToPath(new URL(`../../docs/play-store/${name}`, import.meta.url));
const MARK = fileURLToPath(new URL('../public/images/logo-mark.png', import.meta.url));
const FONT = "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";

await mkdir(fileURLToPath(new URL('../../docs/play-store/', import.meta.url)), { recursive: true });

const W = 1024, H = 500;
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="bg" cx="1" cy="0" r="1.3">
      <stop offset="0" stop-color="#4b2fa8"/><stop offset="0.4" stop-color="#2a1d6b"/><stop offset="1" stop-color="#140f33"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="430" y="238" font-family="${FONT}" font-size="104" font-weight="800" fill="#ffffff">iGaz <tspan fill="#f7931e">CI</tspan></text>
  <text x="434" y="300" font-family="${FONT}" font-size="38" font-weight="500" fill="#ffffff" opacity="0.9">Le gaz, simplement.</text>
  <text x="434" y="360" font-family="${FONT}" font-size="26" font-weight="600" fill="#ffffff" opacity="0.7">Livraison et retrait de gaz à Abidjan</text>
</svg>`);

const mark = await sharp(MARK).resize({ height: 300 }).toBuffer();
const meta = await sharp(mark).metadata();
await sharp(background)
  .composite([{ input: mark, left: Math.round(230 - meta.width / 2), top: Math.round((H - meta.height) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(out('feature-graphic.png'));
await copyFile(fileURLToPath(new URL('../public/icons/icon-512.png', import.meta.url)), out('icon-512.png'));
console.log('Visuels de la fiche Play Store écrits dans docs/play-store/');
