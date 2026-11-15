/**
 * Mode « vitrine » (NEXT_PUBLIC_SITE_MODE=vitrine) : site public qui ne montre que la présentation d'iGaz et les pages
 * légales (conditions, confidentialité, remboursements, aide, suppression de compte). Pas de connexion, pas d'accès à
 * l'application, pas de clé de démo : c'est l'adresse à donner à l'agrégateur de paiement ou à Google, en attendant le
 * lancement. Déployé à part (projet Vercel distinct, public) ; l'application reste dans le projet protégé.
 */
export const VITRINE = process.env.NEXT_PUBLIC_SITE_MODE === 'vitrine';

/** Pages ouvertes en mode vitrine ; toute autre adresse renvoie vers la présentation. */
export const VITRINE_PAGES = ['/presentation', '/conditions', '/confidentialite', '/remboursements', '/aide', '/compte/supprimer'];
