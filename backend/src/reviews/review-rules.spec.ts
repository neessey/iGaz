import { authorName, reviewWindowOpen, storeRating, tidyText } from './review-rules';

describe('avis et notes', () => {
  it('moyenne à une décimale, affichée seulement à partir de 3 avis', () => {
    expect(storeRating(0, 0)).toEqual({ count: 0, average: null });
    expect(storeRating(2, 10)).toEqual({ count: 2, average: null }); // « Nouveau »
    expect(storeRating(3, 14)).toEqual({ count: 3, average: 4.7 });
    expect(storeRating(23, 106)).toEqual({ count: 23, average: 4.6 });
  });

  it('30 jours après la remise pour noter', () => {
    const done = new Date('2026-11-01T10:00:00Z');
    expect(reviewWindowOpen(done, new Date('2026-12-01T09:00:00Z'))).toBe(true);
    expect(reviewWindowOpen(done, new Date('2026-12-01T11:00:00Z'))).toBe(false);
  });

  it('auteur : prénom et initiale, jamais plus ; « Client » sans nom (compte supprimé)', () => {
    expect(authorName('Awa Traoré')).toBe('Awa T.');
    expect(authorName('Jean-Marc Kouassi Yao')).toBe('Jean-Marc Y.');
    expect(authorName('Fatou')).toBe('Fatou');
    expect(authorName(null)).toBe('Client');
    expect(authorName('   ')).toBe('Client');
  });

  it('texte : espaces superflus retirés, vide = pas de texte', () => {
    expect(tidyText('  Très   bon  service ')).toBe('Très bon service');
    expect(tidyText('   ')).toBeNull();
    expect(tidyText(undefined)).toBeNull();
  });
});
