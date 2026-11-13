import { monthIsClosed, monthRange, orderFees, orderSettlement, statement } from './fees';

describe('rémunération iGaz', () => {
  const settings = { serviceFee: 100, deliveryShare: 150 };

  it('frais de service sur chaque commande ; part sur la livraison seulement en livraison, plafonnée', () => {
    expect(orderFees(settings, 'DELIVERY', 500)).toEqual({ serviceFee: 100, platformShare: 150 });
    expect(orderFees(settings, 'PICKUP', 0)).toEqual({ serviceFee: 100, platformShare: 0 });
    // La part ne dépasse jamais les frais de livraison du dépôt (livraison offerte : rien)
    expect(orderFees(settings, 'DELIVERY', 100)).toEqual({ serviceFee: 100, platformShare: 100 });
    expect(orderFees(settings, 'DELIVERY', 0)).toEqual({ serviceFee: 100, platformShare: 0 });
    expect(orderFees({ serviceFee: 0, deliveryShare: 0 }, 'DELIVERY', 500)).toEqual({ serviceFee: 0, platformShare: 0 });
  });

  it('espèces : le dépôt doit la part d’iGaz ; mobile money : iGaz doit au dépôt le reste', () => {
    const cod = { paymentMethod: 'CASH_ON_DELIVERY' as const, total: 6100, serviceFee: 100, platformShare: 150 };
    const mm = { paymentMethod: 'MOBILE_MONEY' as const, total: 6100, serviceFee: 100, platformShare: 150 };
    expect(orderSettlement(cod)).toEqual({ depotOwes: 250, platformOwes: 0 });
    expect(orderSettlement(mm)).toEqual({ depotOwes: 0, platformOwes: 5850 });
  });

  it('relevé du mois : totaux et solde dans le bon sens', () => {
    const s = statement([
      { paymentMethod: 'CASH_ON_DELIVERY', total: 6100, serviceFee: 100, platformShare: 150 },
      { paymentMethod: 'CASH_ON_DELIVERY', total: 2300, serviceFee: 100, platformShare: 0 },
      { paymentMethod: 'MOBILE_MONEY', total: 5600, serviceFee: 100, platformShare: 0 },
    ]);
    expect(s).toEqual({
      orders: 3, sales: 14000, serviceFees: 300, deliveryShares: 150, revenue: 450,
      depotOwes: 350, platformOwes: 5500, balance: -5150, // iGaz doit 5 150 F au dépôt
    });
    expect(statement([]).balance).toBe(0);
  });

  it('mois : bornes, format, mois terminé', () => {
    expect(monthRange('2026-11')).toEqual({ start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-12-01T00:00:00Z') });
    expect(monthRange('2026-12')!.end).toEqual(new Date('2027-01-01T00:00:00Z'));
    expect(monthRange('2026-13')).toBeNull();
    expect(monthRange('nov')).toBeNull();
    const now = new Date('2026-11-13T12:00:00Z');
    expect(monthIsClosed('2026-10', now)).toBe(true);
    expect(monthIsClosed('2026-11', now)).toBe(false);
  });
});
