import Link from 'next/link';

/**
 * Logo iGaz CI : le pictogramme officiel (le « i » et la bouteille à flamme, docs/logo/) suivi de « Gaz CI » en texte,
 * pour rester net à toutes les tailles et lisible sur fond clair comme sur fond sombre.
 * Le pictogramme détouré est produit par npm run logo (public/images/logo-mark*.png).
 */
const RATIO = 640 / 488; // largeur / hauteur du pictogramme détouré

export function LogoMark({ size = 32, large = false }: { size?: number; large?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={large ? '/images/logo-mark.webp' : '/images/logo-mark-96.png'} alt="" width={Math.round(size * RATIO)} height={size}
      style={{ display: 'block', height: size, width: 'auto' }} />
  );
}

export function Logo({ light = false, size = 30, tagline = false, href = '/' }: { light?: boolean; size?: number; tagline?: boolean; href?: string | null }) {
  const content = (
    <>
      <LogoMark size={size} large={size > 48} />
      <span className="logo-word" style={{ fontSize: size * 0.7 }}>
        Gaz <span>CI</span>
        {tagline && <span className="logo-tagline">Le gaz, simplement.</span>}
      </span>
    </>
  );
  const cls = `logo${light ? ' logo-light' : ''}`;
  return href
    ? <Link href={href} className={cls} aria-label="iGaz CI, accueil">{content}</Link>
    : <span className={cls} role="img" aria-label="iGaz CI">{content}</span>;
}
