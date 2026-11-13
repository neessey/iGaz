import { orderMessages, OrderSnapshot } from './messages';

const order: OrderSnapshot = {
  id: 'o1', code: 'GZ-1A2B3C4D', storeName: 'Dépôt Angré Gaz', fulfillment: 'DELIVERY', total: 8000,
  items: '1 × Soleil Gaz B6', zone: 'Cocody', cash: true, paidOnline: false, confirmationCode: '123456',
} as OrderSnapshot & { confirmationCode: string };

describe('messages de notification des commandes', () => {
  it('nouvelle commande : le dépôt est prévenu, avec bouteilles, lieu et montant', () => {
    const [m, ...rest] = orderMessages('SUBMITTED', order);
    expect(rest).toHaveLength(0);
    expect(m).toMatchObject({ to: 'STORE', kind: 'ORDER_NEW', url: '/fournisseur#commandes' });
    expect(m.title).toBe('Nouvelle commande #GZ-1A2B3C4D');
    expect(m.body).toBe('1 × Soleil Gaz B6, livraison à Cocody. 8 000 F à encaisser. Acceptez-la vite.');
    expect(orderMessages('SUBMITTED', { ...order, cash: false, fulfillment: 'PICKUP' })[0].body).toContain('retrait au dépôt. 8 000 F déjà payé');
  });

  it('chaque étape prévient le client, avec un lien vers sa commande', () => {
    for (const e of ['ACCEPTED', 'REJECTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED'] as const) {
      const msgs = orderMessages(e, order);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ to: 'CLIENT', url: '/commandes/o1' });
    }
  });

  it('ne divulgue jamais le code de remise', () => {
    const all = (['SUBMITTED', 'ACCEPTED', 'REJECTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_ADMIN'] as const)
      .flatMap((e) => orderMessages(e, { ...order, wasVisibleToStore: true }));
    for (const m of all) expect(`${m.title} ${m.body}`).not.toContain('123456');
  });

  it('refus : motif donné, remboursement annoncé si payé en ligne', () => {
    const [m] = orderMessages('REJECTED', { ...order, reason: 'plus de stock', paidOnline: true });
    expect(m.body).toBe('Dépôt Angré Gaz ne peut pas servir la commande #GZ-1A2B3C4D : plus de stock. Votre paiement vous sera remboursé. Essayez un autre dépôt.');
  });

  it('annulation par le client : le dépôt n’est prévenu que s’il voyait la commande', () => {
    expect(orderMessages('CANCELLED_BY_CLIENT', { ...order, wasVisibleToStore: false })).toEqual([]);
    expect(orderMessages('CANCELLED_BY_CLIENT', { ...order, wasVisibleToStore: true })[0]).toMatchObject({ to: 'STORE', kind: 'ORDER_CANCELLED' });
  });

  it('annulation par l’admin : client toujours prévenu, dépôt s’il voyait la commande', () => {
    expect(orderMessages('CANCELLED_BY_ADMIN', { ...order, wasVisibleToStore: true }).map((m) => m.to)).toEqual(['CLIENT', 'STORE']);
    expect(orderMessages('CANCELLED_BY_ADMIN', { ...order, wasVisibleToStore: false }).map((m) => m.to)).toEqual(['CLIENT']);
  });
});
