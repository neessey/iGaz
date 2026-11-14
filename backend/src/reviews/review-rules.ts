/**
 * Avis et notes des dépôts. Seul le client d'une commande TERMINÉE peut noter le dépôt de cette commande, une fois
 * par commande, dans les 30 jours qui suivent la remise. La moyenne n'est affichée qu'à partir de 3 avis visibles.
 */
export const REVIEW_WINDOW_DAYS = 30;
export const MIN_REVIEWS_FOR_AVERAGE = 3;
export const MAX_REVIEW_TEXT = 500;

/** Le client peut-il encore écrire ou modifier son avis ? */
export function reviewWindowOpen(completedAt: Date, now: Date = new Date()) {
  return now.getTime() - completedAt.getTime() <= REVIEW_WINDOW_DAYS * 24 * 3600 * 1000;
}

/** Note d'un dépôt à afficher : moyenne à une décimale, ou null (« Nouveau ») sous le seuil. */
export function storeRating(count: number, sum: number) {
  return {
    count,
    average: count >= MIN_REVIEWS_FOR_AVERAGE ? Math.round((sum / count) * 10) / 10 : null,
  };
}

/** Nom public de l'auteur : prénom et initiale du nom (« Awa T. »), jamais le numéro ; « Client » sans nom. */
export function authorName(fullName: string | null | undefined) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Client';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Texte saisi : espaces superflus retirés ; vide → null. */
export const tidyText = (text: string | null | undefined) => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
};
