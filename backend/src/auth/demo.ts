import { timingSafeEqual } from 'crypto';

/**
 * Démo en ligne protégée (avant le branchement d'un prestataire SMS) : si DEMO_ACCESS_KEY est définie, l'API révèle
 * le code de connexion aux seules requêtes qui portent cette clé dans l'en-tête `x-igaz-demo`. La clé n'est intégrée
 * qu'au site de démo, lui-même protégé par la connexion Vercel. Sans clé ou avec une clé trop courte : jamais.
 */
export const DEMO_HEADER = 'x-igaz-demo';
export const MIN_DEMO_KEY_LENGTH = 24;

export function demoKeyMatches(configured: string | undefined, given: string | undefined): boolean {
  if (!configured || configured.length < MIN_DEMO_KEY_LENGTH || !given) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mode démo actif sur ce serveur (clé suffisamment longue définie). */
export const demoModeEnabled = (configured = process.env.DEMO_ACCESS_KEY) =>
  !!configured && configured.length >= MIN_DEMO_KEY_LENGTH;
