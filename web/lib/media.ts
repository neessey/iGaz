/**
 * Photos et logos d'iGaz. Tant qu'un fichier n'est pas fourni, l'interface affiche une illustration dessinée.
 *
 * Pour ajouter un fichier : le déposer dans web/public/images/ puis renseigner son chemin ci-dessous
 * (ex. '/images/accueil.jpg'). N'utiliser que des photos et logos dont iGaz a les droits.
 */
export const IMAGES: Record<'welcome' | 'promo' | 'productHero', string | null> = {
  welcome: null,      // écran de connexion (photo verticale, ~800 × 1000)
  promo: null,        // bannière « Votre gaz à portée de main » (paysage, ~1200 × 500)
  productHero: null,  // fond de la fiche produit (paysage, ~1200 × 600)
};

/** Logos des marques de gaz, par nom de marque en minuscules (ex. 'butagaz': '/images/marques/butagaz.png'). */
export const BRAND_LOGOS: Record<string, string> = {};

/** Photos des dépôts, par identifiant de boutique (en attendant un champ photo dans l'API). */
export const STORE_PHOTOS: Record<string, string> = {};

/** Couleurs des bouteilles par marque connue ; sinon une couleur stable tirée du nom. */
const KNOWN: Record<string, string> = {
  butagaz: '#1d4ed8', totalenergies: '#dc2626', total: '#dc2626', shell: '#eab308', primagaz: '#b91c1c',
  oryx: '#ea580c', petroci: '#16a34a', vivo: '#7c3aed', 'soleil gaz': '#ea580c', 'lagune gaz': '#0e7490',
};
const PALETTE = ['#1d4ed8', '#dc2626', '#16a34a', '#ea580c', '#7c3aed', '#0e7490'];

export function brandColor(name: string) {
  const key = name.trim().toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const brandLogo = (name: string) => BRAND_LOGOS[name.trim().toLowerCase()] ?? null;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
