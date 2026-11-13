import { Offer, StoreLite } from './types';

/** Un dépôt vu depuis la recherche : ses offres commandables et ce qu'il faut pour sa carte. */
export interface StoreSummary {
  store: StoreLite;
  offers: Offer[];
  /** Prix le plus bas (achat ou échange selon le choix du client). */
  minPrice: number;
  sizes: string[];
  brands: { id: string; name: string }[];
}

/** Regroupe les offres de la recherche par dépôt, du dépôt le moins cher au plus cher. */
export function groupByStore(offers: Offer[], exchange = false): StoreSummary[] {
  const map = new Map<string, StoreSummary>();
  for (const o of offers) {
    const price = exchange ? o.exchangePrice : o.purchasePrice;
    const s = map.get(o.store.id) ?? { store: o.store, offers: [], minPrice: price, sizes: [], brands: [] };
    s.offers.push(o);
    s.minPrice = Math.min(s.minPrice, price);
    if (!s.sizes.includes(o.cylinderType.label)) s.sizes.push(o.cylinderType.label);
    if (!s.brands.some((b) => b.id === o.brand.id)) s.brands.push({ id: o.brand.id, name: o.brand.name });
    map.set(o.store.id, s);
  }
  const sizeOrder = (l: string) => Number(l.replace(/\D/g, '')) || 0;
  for (const s of map.values()) s.sizes.sort((a, b) => sizeOrder(a) - sizeOrder(b));
  return [...map.values()].sort((a, b) => a.minPrice - b.minPrice);
}

/**
 * Fermeture dans l'heure (heure d'Abidjan = UTC, sans changement d'heure). Sert à prévenir le client
 * avant qu'il ne remplisse un panier qu'il ne pourra plus valider.
 */
export function closesSoon(opensAt: string, closesAt: string, now = new Date()): boolean {
  if (opensAt === closesAt) return false; // 24h/24
  const [h, m] = closesAt.split(':').map(Number);
  const close = h * 60 + m;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const left = (close - cur + 1440) % 1440;
  return left > 0 && left <= 60;
}
