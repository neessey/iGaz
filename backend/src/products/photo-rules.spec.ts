import { PHOTO_MAX_BYTES, photoError, sniffPhotoType } from './photo-rules';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);

describe('photos de produits', () => {
  it('reconnaît JPEG, PNG et WebP à leur contenu', () => {
    expect(sniffPhotoType(JPEG)).toBe('image/jpeg');
    expect(sniffPhotoType(PNG)).toBe('image/png');
    expect(sniffPhotoType(WEBP)).toBe('image/webp');
    expect(sniffPhotoType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });

  it('accepte une photo dont le type annoncé correspond', () => {
    expect(photoError(JPEG, 'image/jpeg')).toBeNull();
    expect(photoError(WEBP, 'image/webp')).toBeNull();
  });

  it('refuse une photo vide, trop lourde, d’un autre format ou mal étiquetée', () => {
    expect(photoError(undefined, 'image/jpeg')).toMatch(/Aucune photo/);
    expect(photoError(new Uint8Array(0), 'image/jpeg')).toMatch(/Aucune photo/);
    const big = new Uint8Array(PHOTO_MAX_BYTES + 1);
    big.set(JPEG);
    expect(photoError(big, 'image/jpeg')).toMatch(/trop lourde/);
    expect(photoError(new TextEncoder().encode('GIF89a...'), 'image/gif')).toMatch(/Format/);
    expect(photoError(PNG, 'image/jpeg')).toMatch(/ne correspond pas/);
  });
});
