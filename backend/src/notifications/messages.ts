/**
 * Textes des notifications de commande (français simple, verbes d'action). Fonction pure : qui prévenir, quoi dire,
 * quelle page ouvrir. Ne contient jamais le code de remise du client.
 */
export type OrderNotifyEvent =
  | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'COMPLETED'
  | 'CANCELLED_BY_CLIENT' | 'CANCELLED_BY_ADMIN';

export interface OrderSnapshot {
  id: string;
  code: string;
  storeName: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  total: number;
  /** « 1 × Soleil Gaz B6, 2 × Lagune Gaz B12 » */
  items: string;
  /** Commune de livraison, le cas échéant. */
  zone?: string | null;
  cash: boolean;
  paidOnline: boolean;
  /** La commande était-elle déjà visible par le dépôt (transmise) au moment de l'annulation ? */
  wasVisibleToStore?: boolean;
  reason?: string | null;
}

export interface OrderMessage {
  to: 'CLIENT' | 'STORE';
  kind: string;
  title: string;
  body: string;
  url: string;
}

const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/ |\s/g, ' ')} F`;

export function orderMessages(event: OrderNotifyEvent, o: OrderSnapshot): OrderMessage[] {
  const client = (kind: string, title: string, body: string): OrderMessage => ({ to: 'CLIENT', kind, title, body, url: `/commandes/${o.id}` });
  const store = (kind: string, title: string, body: string): OrderMessage => ({ to: 'STORE', kind, title, body, url: '/fournisseur#commandes' });
  const where = o.fulfillment === 'DELIVERY' ? `livraison${o.zone ? ` à ${o.zone}` : ''}` : 'retrait au dépôt';
  const refund = o.paidOnline ? ' Votre paiement vous sera remboursé.' : '';

  switch (event) {
    case 'SUBMITTED':
      return [store('ORDER_NEW', `Nouvelle commande #${o.code}`,
        `${o.items}, ${where}. ${money(o.total)}${o.cash ? ' à encaisser' : ' déjà payé'}. Acceptez-la vite.`)];
    case 'ACCEPTED':
      return [client('ORDER_ACCEPTED', 'Commande acceptée', `${o.storeName} prépare votre commande #${o.code}.`)];
    case 'REJECTED':
      return [client('ORDER_REJECTED', 'Commande refusée',
        `${o.storeName} ne peut pas servir la commande #${o.code}${o.reason ? ` : ${o.reason}` : ''}.${refund} Essayez un autre dépôt.`)];
    case 'READY_FOR_PICKUP':
      return [client('ORDER_READY', 'Votre commande est prête',
        `Passez la retirer chez ${o.storeName}. Donnez votre code de remise quand vous avez la bouteille en main.`)];
    case 'OUT_FOR_DELIVERY':
      return [client('ORDER_OUT', 'Votre gaz est en route',
        `${o.storeName} vous livre la commande #${o.code}. Donnez votre code de remise au livreur à la réception.`)];
    case 'COMPLETED':
      return [client('ORDER_COMPLETED', 'Commande terminée', `Merci ! La commande #${o.code} est remise. Notez ${o.storeName} en un geste.`)];
    case 'CANCELLED_BY_CLIENT':
      // Le dépôt n'est prévenu que s'il voyait déjà la commande (une commande non payée ne lui a jamais été transmise).
      return o.wasVisibleToStore
        ? [store('ORDER_CANCELLED', `Commande #${o.code} annulée`, 'Le client a annulé sa commande. Rien à préparer.')]
        : [];
    case 'CANCELLED_BY_ADMIN':
      return [
        client('ORDER_CANCELLED', 'Commande annulée', `L’équipe iGaz a annulé la commande #${o.code}.${refund}`),
        ...(o.wasVisibleToStore
          ? [store('ORDER_CANCELLED', `Commande #${o.code} annulée`, `L’équipe iGaz a annulé cette commande${o.reason ? ` : ${o.reason}` : ''}.`)]
          : []),
      ];
  }
}
