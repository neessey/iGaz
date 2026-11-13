import { OrderStatus } from './types';

/** « 7 500 F » : espace insécable entre les milliers, FCFA sous-entendu dans l'interface. */
export const fcfa = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} F`;

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'En attente du paiement',
  SUBMITTED: 'Envoyée au dépôt',
  ACCEPTED: 'Acceptée par le dépôt',
  READY_FOR_PICKUP: 'Prête à retirer',
  OUT_FOR_DELIVERY: 'En route vers vous',
  COMPLETED: 'Terminée',
  REJECTED: 'Refusée par le dépôt',
  CANCELLED: 'Annulée',
};

export type Tone = 'wait' | 'go' | 'done' | 'stop';
export const STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: 'wait', SUBMITTED: 'wait', ACCEPTED: 'go', READY_FOR_PICKUP: 'go',
  OUT_FOR_DELIVERY: 'go', COMPLETED: 'done', REJECTED: 'stop', CANCELLED: 'stop',
};

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export const kindLabel = (kind: 'PURCHASE' | 'EXCHANGE') => (kind === 'EXCHANGE' ? 'échange' : 'achat');

/** +2250701020304 → 07 01 02 03 04 (format d'usage en Côte d'Ivoire). */
export const phoneFmt = (p: string) => {
  const d = p.replace(/^\+225/, '');
  return /^\d{10}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, '$1 ') : p;
};
