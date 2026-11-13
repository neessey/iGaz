// Détoure le pictogramme iGaz (docs/logo/igaz-logo-pictogramme.webp) : retire la tache noire floue qui l'entoure
// et produit public/images/logo-mark.png (fond transparent), utilisé par components/Logo.tsx et par npm run icons.
// Usage : npm run logo
//
// Méthode : on part des bords de l'image et on « remplit » toutes les zones sombres reliées à l'extérieur (le fond).
// Dans ces zones et sur 3 px autour, la transparence est déduite de la luminosité (le fond d'origine est noir) et la
// couleur est éclaircie d'autant, pour éviter un liseré sombre. Les ombrages foncés à l'intérieur du dessin, entourés
// d'orange, ne sont pas touchés.
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../../docs/logo/igaz-logo-pictogramme.webp', import.meta.url));
const OUT = fileURLToPath(new URL('../public/images/logo-mark.png', import.meta.url));

const DARK = 0.3;    // en dessous de cette luminosité (canal le plus fort), un pixel relié au bord est du fond
                     // (plus haut, l'ombrage rouge foncé du bas de la bouteille serait pris pour du fond)
const EDGE = 3;      // marge de lissage autour du fond, en pixels

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const n = w * h;
const lum = new Float32Array(n);
for (let p = 0; p < n; p++) {
  const i = p * 4;
  lum[p] = data[i + 3] < 128 ? 0 : Math.max(data[i], data[i + 1], data[i + 2]) / 255;
}

// 1. Fond : pixels sombres ou transparents reliés au bord de l'image.
const bg = new Uint8Array(n);
const queue = new Int32Array(n);
let head = 0, tail = 0;
const push = (p) => { if (!bg[p] && lum[p] < DARK) { bg[p] = 1; queue[tail++] = p; } };
for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
while (head < tail) {
  const p = queue[head++];
  const x = p % w;
  if (x > 0) push(p - 1);
  if (x < w - 1) push(p + 1);
  if (p >= w) push(p - w);
  if (p < n - w) push(p + w);
}

// 2. Bordure : de part et d'autre de la limite fond / dessin, sur EDGE pixels (anticrénelage mélangé au noir).
const dilate = (mask) => {
  let m = mask;
  for (let k = 0; k < EDGE; k++) {
    const next = m.slice();
    for (let p = 0; p < n; p++) {
      if (m[p]) continue;
      const x = p % w;
      if ((x > 0 && m[p - 1]) || (x < w - 1 && m[p + 1]) || (p >= w && m[p - w]) || (p < n - w && m[p + w])) next[p] = 1;
    }
    m = next;
  }
  return m;
};
const nearBg = dilate(bg);
const nearMark = dilate(bg.map((v) => 1 - v));
const edge = new Uint8Array(n);
for (let p = 0; p < n; p++) edge[p] = nearBg[p] && nearMark[p] ? 1 : 0;

// 3. Transparence et couleur.
const out = Buffer.alloc(n * 4);
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let p = 0; p < n; p++) {
  const i = p * 4;
  let r = data[i], g = data[i + 1], b = data[i + 2];
  let a = bg[p] ? 0 : 1; // le fond loin du dessin (tache noire, lueur) devient entièrement transparent
  if (edge[p]) {
    a = smooth(0.12, 0.7, lum[p]);
    const cover = Math.max(lum[p] / 0.97, 0.01);
    if (a > 0) { r = Math.min(255, r / cover); g = Math.min(255, g / cover); b = Math.min(255, b / cover); }
  }
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = Math.round(a * 255);
}

const trimmed = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
await sharp(trimmed).resize({ width: 640, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(OUT);
// Version WebP, bien plus légère, pour l'écran de connexion.
await sharp(trimmed).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100 }).toFile(OUT.replace('.png', '.webp'));
// Version légère pour l'en-tête et les boutons (affichée à 48 px de haut au plus, nette sur écran 2×).
await sharp(trimmed).resize({ height: 96 }).png({ compressionLevel: 9 }).toFile(OUT.replace('logo-mark.png', 'logo-mark-96.png'));
const meta = await sharp(OUT).metadata();
console.log(`Pictogramme détouré : public/images/logo-mark.png (${meta.width} × ${meta.height}) et logo-mark-96.png`);
