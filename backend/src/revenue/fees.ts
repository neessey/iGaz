/**
 * Rémunération d'iGaz. Deux sources, réglées par l'admin (PlatformSettings) et figées sur chaque commande :
 * - frais de service, payés par le client, ajoutés au total de chaque commande (une commande = un dépôt) ;
 * - part sur la livraison, payée par le dépôt : prise sur ses frais de livraison, jamais au-delà, et seulement
 *   pour une commande livrée.
 * Seules les commandes TERMINÉES (code client vérifié) entrent dans les relevés : une commande refusée ou annulée
 * ne coûte rien, ni au client, ni au dépôt. Montants en FCFA entiers.
 */

export const MAX_SERVICE_FEE = 2000;
export const MAX_DELIVERY_SHARE = 5000;

export interface FeeSettings { serviceFee: number; deliveryShare: number }

/** Montants à figer sur une nouvelle commande. */
export function orderFees(settings: FeeSettings, fulfillment: 'DELIVERY' | 'PICKUP', deliveryFee: number) {
  return {
    serviceFee: Math.max(0, settings.serviceFee),
    platformShare: fulfillment === 'DELIVERY' ? Math.max(0, Math.min(settings.deliveryShare, deliveryFee)) : 0,
  };
}

export interface SettledOrder {
  paymentMethod: 'MOBILE_MONEY' | 'CASH_ON_DELIVERY';
  total: number;
  serviceFee: number;
  platformShare: number;
}

/**
 * Ce que chaque partie doit à l'autre pour une commande terminée.
 * - Espèces : le dépôt a encaissé tout le total ; il doit à iGaz les frais de service et la part sur la livraison.
 * - Mobile money : iGaz a tout reçu ; il doit au dépôt le total moins ces deux montants.
 */
export function orderSettlement(o: SettledOrder) {
  const platform = o.serviceFee + o.platformShare;
  return o.paymentMethod === 'CASH_ON_DELIVERY'
    ? { depotOwes: platform, platformOwes: 0 }
    : { depotOwes: 0, platformOwes: o.total - platform };
}

/** Relevé d'un dépôt : totaux du mois et solde. balance > 0 : le dépôt doit cette somme à iGaz ; < 0 : iGaz la doit. */
export function statement(orders: SettledOrder[]) {
  const sum = (f: (o: SettledOrder) => number) => orders.reduce((s, o) => s + f(o), 0);
  const depotOwes = sum((o) => orderSettlement(o).depotOwes);
  const platformOwes = sum((o) => orderSettlement(o).platformOwes);
  return {
    orders: orders.length,
    sales: sum((o) => o.total),
    serviceFees: sum((o) => o.serviceFee),
    deliveryShares: sum((o) => o.platformShare),
    revenue: sum((o) => o.serviceFee + o.platformShare),
    depotOwes,
    platformOwes,
    balance: depotOwes - platformOwes,
  };
}

/** Bornes d'un mois « AAAA-MM » (heure d'Abidjan = UTC), ou null si le mois est invalide. */
export function monthRange(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1;
  return { start: new Date(Date.UTC(y, mo, 1)), end: new Date(Date.UTC(y, mo + 1, 1)) };
}

export const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/** Un relevé ne se règle qu'une fois le mois terminé : il ne peut plus changer ensuite. */
export const monthIsClosed = (month: string, now: Date = new Date()) => month < monthOf(now);
