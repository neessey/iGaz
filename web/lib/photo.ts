/**
 * Prépare une photo de produit avant l'envoi : réduite à 800 px au plus (côté le plus long), en WebP (JPEG si le
 * navigateur ne sait pas produire du WebP), pour rester bien sous la limite de l'API (500 Ko) même sur un réseau lent.
 */
const MAX_SIDE = 800;
const MAX_BYTES = 450 * 1024;

async function load(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* format non décodable ici : on essaie avec <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function shrinkPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une photo (JPEG, PNG, WebP ou une photo du téléphone).');
  let source;
  try { source = await load(file); } catch { throw new Error('Cette photo ne peut pas être lue. Essayez une autre photo.'); }
  const ratio = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * ratio));
  canvas.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.85, 0.72, 0.6]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') {
      // Pas de WebP (anciens iPhone) : JPEG, sur fond blanc (le JPEG n'a pas de transparence).
      const flat = document.createElement('canvas');
      flat.width = canvas.width; flat.height = canvas.height;
      const f = flat.getContext('2d')!;
      f.fillStyle = '#ffffff';
      f.fillRect(0, 0, flat.width, flat.height);
      f.drawImage(canvas, 0, 0);
      blob = await toBlob(flat, 'image/jpeg', quality);
    }
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('Photo trop lourde, même réduite. Essayez une autre photo.');
}
