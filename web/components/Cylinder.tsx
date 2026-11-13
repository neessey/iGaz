/**
 * Silhouette de bouteille de gaz. La hauteur suit la capacité (B3 < B6 < B12) :
 * choisir sa bouteille revient à toucher celle qui a la bonne taille.
 */
const HEIGHT: Record<number, number> = { 3: 58, 6: 74, 12: 98 };

export function Cylinder({ kg, className }: { kg: number; className?: string }) {
  const h = HEIGHT[kg] ?? Math.round(40 + kg * 5);
  const w = 40;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" focusable="false">
      {/* robinet et anneau de protection */}
      <rect x="16" y="0" width="8" height="8" rx="2" fill="currentColor" />
      <path d="M9 14 Q9 5 20 5 Q31 5 31 14" fill="none" stroke="currentColor" strokeWidth="3" />
      {/* corps */}
      <path
        d={`M4 24 Q4 13 20 12 Q36 13 36 24 L36 ${h - 6} Q36 ${h - 3} 33 ${h - 3} L7 ${h - 3} Q4 ${h - 3} 4 ${h - 6} Z`}
        fill="currentColor"
      />
      {/* bande de peinture */}
      <rect x="4" y={Math.round(h * 0.46)} width="32" height="7" fill="#ffc21a" />
      {/* pied */}
      <rect x="8" y={h - 5} width="24" height="5" rx="1.5" fill="currentColor" />
    </svg>
  );
}
