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
