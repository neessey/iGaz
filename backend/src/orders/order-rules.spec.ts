import {
  canTransition, isExchangeCompatible, isStoreOpenNow, normalizeIvorianPhone, TRANSITIONS,
} from './order-rules';

describe('order-rules', () => {
  describe('transitions de commande', () => {
    it('autorise le parcours nominal', () => {
      expect(canTransition('SUBMITTED', 'ACCEPTED')).toBe(true);
      expect(canTransition('ACCEPTED', 'OUT_FOR_DELIVERY')).toBe(true);
      expect(canTransition('OUT_FOR_DELIVERY', 'COMPLETED')).toBe(true);
      expect(canTransition('PENDING_PAYMENT', 'SUBMITTED')).toBe(true);
    });

    it('interdit de clôturer sans passer par la prise en charge', () => {
      expect(canTransition('SUBMITTED', 'COMPLETED')).toBe(false);
      expect(canTransition('ACCEPTED', 'COMPLETED')).toBe(false);
      expect(canTransition('PENDING_PAYMENT', 'ACCEPTED')).toBe(false);
    });

    it('les états finaux ne permettent plus aucune transition', () => {
      for (const s of ['COMPLETED', 'REJECTED', 'CANCELLED'] as const) {
        expect(TRANSITIONS[s]).toEqual([]);
      }
    });
  });

  describe('compatibilité d’échange', () => {
    const product = { brandId: 'total', cylinderTypeId: 'b6' };

    it('accepte même marque et même capacité', () => {
      expect(isExchangeCompatible(product, { brandId: 'total', cylinderTypeId: 'b6' })).toBe(true);
    });

    it('refuse une autre marque même si la capacité est identique', () => {
      expect(isExchangeCompatible(product, { brandId: 'petro', cylinderTypeId: 'b6' })).toBe(false);
    });

    it('refuse une autre capacité', () => {
      expect(isExchangeCompatible(product, { brandId: 'total', cylinderTypeId: 'b12' })).toBe(false);
    });

    it('refuse si la bouteille vide n’est pas renseignée', () => {
      expect(isExchangeCompatible(product, {})).toBe(false);
      expect(isExchangeCompatible(product, { brandId: 'total' })).toBe(false);
    });
  });

  describe('horaires de boutique', () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 13, h, m));

    it('ouvert dans la plage, fermé en dehors', () => {
      expect(isStoreOpenNow('07:00', '20:00', at(12))).toBe(true);
      expect(isStoreOpenNow('07:00', '20:00', at(6, 59))).toBe(false);
      expect(isStoreOpenNow('07:00', '20:00', at(20))).toBe(false);
    });

    it('gère les horaires qui passent minuit', () => {
      expect(isStoreOpenNow('18:00', '02:00', at(23))).toBe(true);
      expect(isStoreOpenNow('18:00', '02:00', at(1))).toBe(true);
      expect(isStoreOpenNow('18:00', '02:00', at(12))).toBe(false);
    });

    it('même heure d’ouverture et de fermeture = ouvert 24h/24', () => {
      expect(isStoreOpenNow('00:00', '00:00', at(3))).toBe(true);
    });
  });

  describe('numéros ivoiriens', () => {
    it('normalise les formats courants', () => {
      expect(normalizeIvorianPhone('0701020304')).toBe('+2250701020304');
      expect(normalizeIvorianPhone('07 01 02 03 04')).toBe('+2250701020304');
      expect(normalizeIvorianPhone('+225 07 01 02 03 04')).toBe('+2250701020304');
      expect(normalizeIvorianPhone('002250701020304')).toBe('+2250701020304');
      expect(normalizeIvorianPhone('2250701020304')).toBe('+2250701020304');
    });

    it('rejette les numéros invalides', () => {
      expect(normalizeIvorianPhone('')).toBeNull();
      expect(normalizeIvorianPhone('070102030')).toBeNull();
      expect(normalizeIvorianPhone('+33612345678')).toBeNull();
      expect(normalizeIvorianPhone('abcdefghij')).toBeNull();
    });
  });
});
