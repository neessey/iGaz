// Détoure les photos de bouteilles fournies par iGaz (docs/photos/bouteilles/<marque>-<kg>.<ext>) et les écrit dans
// public/images/bouteilles/<marque>-<kg>.webp (fond transparent, recadrées, 640 px de haut), à déclarer ensuite dans
// BOTTLE_PHOTOS (lib/media.ts). Usage : npm run bottles
//
// Méthode : le fond (clair et à peu près uni sur ces photos de studio) est « rempli » depuis les bords de l'image :
// un pixel en fait partie s'il est proche de la couleur du fond et de son voisin déjà retenu. Les photos déjà
// transparentes sont seulement recadrées.
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../../docs/photos/bouteilles/', import.meta.url));
const OUT = fileURLToPath(new URL('../public/images/bouteilles/', import.meta.url));
const HEIGHT = 640;
const NEAR_BG = 26;   // écart de couleur maximal avec le fond moyen
const NEAR_NEXT = 7;  // écart maximal avec le pixel voisin (suit les dégradés et ombres douces du fond)
// Bouteilles blanches sur fond crème : réglages plus stricts, sinon le fond « déborde » sur la bouteille.
const TIGHT = { nearBg: 12, nearNext: 3 };
const settings = (file) => (file.startsWith('petroci') ? TIGHT : { nearBg: NEAR_BG, nearNext: NEAR_NEXT });

const dist = (d, i, r, g, b) => Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b));

async function cutout(file) {
  const { nearBg, nearNext } = settings(file);
  const { data, info } = await sharp(SRC + file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const opaque = data.some((v, i) => i % 4 === 3 && v < 250);
  if (!opaque) {
    // Couleur moyenne du fond : bord de l'image.
    let r = 0, g = 0, b = 0, k = 0;
    for (let p = 0; p < n; p++) {
      const x = p % w, y = (p / w) | 0;
      if (x > 2 && y > 2 && x < w - 3 && y < h - 3) continue;
      r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; k++;
    }
    [r, g, b] = [r / k, g / k, b / k];
    const bg = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (let x = 0; x < w; x++) for (const p of [x, (h - 1) * w + x]) if (dist(data, p * 4, r, g, b) < nearBg) { bg[p] = 1; queue[tail++] = p; }
    for (let y = 0; y < h; y++) for (const p of [y * w, y * w + w - 1]) if (!bg[p] && dist(data, p * 4, r, g, b) < nearBg) { bg[p] = 1; queue[tail++] = p; }
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= n || bg[q]) continue;
        const i = q * 4, j = p * 4;
        if (dist(data, i, r, g, b) < nearBg && dist(data, i, data[j], data[j + 1], data[j + 2]) < nearNext) { bg[q] = 1; queue[tail++] = q; }
      }
    }
    // Transparence, avec un bord adouci d'un pixel.
    for (let p = 0; p < n; p++) {
      if (bg[p]) { data[p * 4 + 3] = 0; continue; }
      const x = p % w;
      const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p < n - w && bg[p + w]);
      if (edge) data[p * 4 + 3] = 150;
    }
  }
  const trimmed = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
  const name = file.replace(/\.[a-z]+$/, '.webp');
  await sharp(trimmed).resize({ height: HEIGHT, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90 }).toFile(OUT + name);
  return name;
}

await mkdir(OUT, { recursive: true });
for (const file of (await readdir(SRC)).filter((f) => /\.(png|webp|jpe?g)$/i.test(f))) {
  console.log('écrit :', await cutout(file));
}
