import { OrderStatus } from './types';

/** « 7 500 F » : espace insécable entre les milliers, FCFA sous-entendu dans l'interface. */
export const fcfa = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} F`;

/** Montant court pour les tuiles de chiffres : « 2,45 M F » au-delà du million. */
export const fcfaShort = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M F` : fcfa(n);

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

/** Libellés des actions du journal d'audit (AuditLog.action). */
export const AUDIT_LABEL: Record<string, string> = {
  CREATE: 'Création', UPDATE: 'Modification', SUPPLIER_APPROVED: 'Fournisseur validé', SUPPLIER_REJECTED: 'Fournisseur refusé',
  SUPPLIER_SUSPENDED: 'Fournisseur suspendu', STOCK_CORRECTION: 'Correction de stock', ORDER_CANCEL: 'Commande annulée',
  ACCOUNT_DELETED: 'Compte supprimé par son titulaire',
  FEES_UPDATE: 'Frais iGaz modifiés',
  SETTLEMENT: 'Relevé d’un dépôt réglé',
  REVIEW_HIDDEN: 'Avis masqué',
  REVIEW_SHOWN: 'Avis réaffiché',
};

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export const kindLabel = (kind: 'PURCHASE' | 'EXCHANGE') => (kind === 'EXCHANGE' ? 'échange' : 'achat');

/** +2250701020304 → 07 01 02 03 04 (format d'usage en Côte d'Ivoire). */
export const phoneFmt = (p: string) => {
  if (p.startsWith('supprime:')) return 'compte supprimé'; // compte anonymisé à la demande de son titulaire
  const d = p.replace(/^\+225/, '');
  return /^\d{10}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, '$1 ') : p;
};
