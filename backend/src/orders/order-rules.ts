import { OrderStatus } from '@prisma/client';

/** Transitions autorisées du cycle de vie d'une commande (MVP). */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuts pour lesquels le stock a déjà été décompté (à restituer en cas d'annulation). */
export const STOCK_HELD: OrderStatus[] = ['ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

/**
 * Règle d'échange du MVP : la bouteille vide remise doit avoir exactement la même marque
 * et la même capacité que la bouteille commandée. Les compatibilités inter-marques viendront plus tard.
 */
export function isExchangeCompatible(
  product: { brandId: string; cylinderTypeId: string },
  returned: { brandId?: string | null; cylinderTypeId?: string | null },
): boolean {
  return !!returned.brandId && !!returned.cylinderTypeId &&
    returned.brandId === product.brandId && returned.cylinderTypeId === product.cylinderTypeId;
}

/** Panier multi-dépôts : au plus 3 dépôts, pour un suivi lisible et peu de remboursements partiels. */
export const MAX_STORES_PER_CHECKOUT = 3;
export const MAX_ITEMS_PER_ORDER = 10;

/**
 * Vérifie la forme d'un panier avant toute lecture en base. Retourne le message d'erreur (en français) ou null.
 * Chaque dépôt n'apparaît qu'une fois : ses articles forment une seule commande.
 */
export function checkoutShapeError(stores: { storeId: string; items: unknown[] }[]): string | null {
  if (stores.length === 0) return 'Le panier est vide';
  if (stores.length > MAX_STORES_PER_CHECKOUT) return `Un panier peut contenir au plus ${MAX_STORES_PER_CHECKOUT} dépôts`;
  if (new Set(stores.map((s) => s.storeId)).size !== stores.length) return 'Un même dépôt apparaît deux fois dans le panier';
  if (stores.some((s) => s.items.length === 0)) return 'Un dépôt du panier n’a aucun article';
  if (stores.some((s) => s.items.length > MAX_ITEMS_PER_ORDER)) return `Au plus ${MAX_ITEMS_PER_ORDER} articles par dépôt`;
  return null;
}

/**
 * Totaux d'une commande (un dépôt) : prix unitaires figés × quantités, plus les frais de livraison du dépôt
 * seulement en livraison. Montants en FCFA entiers.
 */
export function orderTotals(
  items: { unitPrice: number; quantity: number }[], fulfillment: 'DELIVERY' | 'PICKUP', storeDeliveryFee: number,
) {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const deliveryFee = fulfillment === 'DELIVERY' ? storeDeliveryFee : 0;
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Abidjan est en UTC+0 toute l'année, sans changement d'heure. Gère les horaires qui passent minuit. */
export function isStoreOpenNow(opensAt: string, closesAt: string, now: Date = new Date()): boolean {
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  const open = toMinutes(opensAt);
  const close = toMinutes(closesAt);
  if (open === close) return true; // 24h/24
  return open < close ? current >= open && current < close : current >= open || current < close;
}

/** Normalise un numéro ivoirien vers +225XXXXXXXXXX (10 chiffres depuis 2021). Retourne null si invalide. */
export function normalizeIvorianPhone(raw: string): string | null {
  let s = (raw ?? '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('00225')) s = '+225' + s.slice(5);
  else if (/^\d{10}$/.test(s)) s = '+225' + s;
  else if (/^225\d{10}$/.test(s)) s = '+' + s;
  return /^\+225\d{10}$/.test(s) ? s : null;
}
