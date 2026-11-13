import { useId } from 'react';
import { bottlePhoto } from '@/lib/media';

/**
 * Bouteille de gaz dessinée, à la couleur de la marque. La hauteur suit la capacité (B3 < B6 < B12) :
 * on reconnaît la taille d'un coup d'œil. Si une photo est déclarée (lib/media.ts, BOTTLE_PHOTOS), elle remplace
 * le dessin, à la même hauteur.
 */
const HEIGHT: Record<number, number> = { 3: 58, 6: 74, 12: 98 };

export function Cylinder({ kg, color = '#5b3fd0', scale = 1, className, brand }: {
  kg: number; color?: string; scale?: number; className?: string; brand?: string;
}) {
  const id = useId().replace(/:/g, '');
  const h = HEIGHT[kg] ?? Math.round(40 + kg * 5);
  const w = 44;
  const photo = bottlePhoto(kg, brand);
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className={className} style={{ height: h * scale, width: 'auto', objectFit: 'contain' }} />;
  }
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
      </defs>
      {/* robinet et anneau de protection */}
      <rect x="18" y="0" width="8" height="8" rx="2" fill="#9ca3af" />
      <path d="M10 15 Q10 5 22 5 Q34 5 34 15" fill="none" stroke={color} strokeWidth="3.5" />
      {/* corps */}
      <path d={`M5 25 Q5 13 22 12 Q39 13 39 25 L39 ${h - 7} Q39 ${h - 3} 35 ${h - 3} L9 ${h - 3} Q5 ${h - 3} 5 ${h - 7} Z`} fill={color} />
      <path d={`M5 25 Q5 13 22 12 Q39 13 39 25 L39 ${h - 7} Q39 ${h - 3} 35 ${h - 3} L9 ${h - 3} Q5 ${h - 3} 5 ${h - 7} Z`} fill={`url(#${id}s)`} />
      {/* étiquette */}
      <rect x="11" y={Math.round(h * 0.45)} width="22" height={Math.max(8, Math.round(h * 0.16))} rx="3" fill="#fff" opacity="0.88" />
      {/* pied */}
      <rect x="9" y={h - 5} width="26" height="5" rx="1.5" fill="#374151" />
    </svg>
  );
}
