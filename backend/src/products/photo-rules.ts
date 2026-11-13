/**
 * Photos de produits envoyées par les dépôts. L'application les réduit avant l'envoi (quelques dizaines de Ko) ;
 * l'API refuse le reste. Le type est vérifié sur le contenu (signature du fichier), pas seulement sur l'en-tête
 * annoncé : on ne sert jamais autre chose qu'une image.
 */
export const PHOTO_MAX_BYTES = 500 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

/** Type réel du fichier d'après ses premiers octets, ou null si ce n'est ni JPEG, ni PNG, ni WebP. */
export function sniffPhotoType(data: Uint8Array): PhotoType | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => data[i + k] === b);
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'; // RIFF....WEBP
  return null;
}

/** Message d'erreur pour l'utilisateur, ou null si la photo est acceptable. */
export function photoError(data: Uint8Array | undefined, declaredType: string | undefined): string | null {
  if (!data || data.length === 0) return 'Aucune photo reçue';
  if (data.length > PHOTO_MAX_BYTES) return 'Photo trop lourde (500 Ko au plus)';
  const real = sniffPhotoType(data);
  if (!real) return 'Format non pris en charge : envoyez une photo JPEG, PNG ou WebP';
  if (declaredType && declaredType.split(';')[0].trim().toLowerCase() !== real) return 'Le type annoncé ne correspond pas à la photo';
  return null;
}
