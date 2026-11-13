import { demoKeyMatches, demoModeEnabled } from './demo';

describe('clé de la démo en ligne', () => {
  const key = 'k'.repeat(32);

  it('révèle le code seulement avec la bonne clé', () => {
    expect(demoKeyMatches(key, key)).toBe(true);
    expect(demoKeyMatches(key, 'k'.repeat(31) + 'x')).toBe(false);
    expect(demoKeyMatches(key, 'k'.repeat(31))).toBe(false);
    expect(demoKeyMatches(key, undefined)).toBe(false);
  });

  it('jamais sans clé configurée, ni avec une clé trop courte', () => {
    expect(demoKeyMatches(undefined, key)).toBe(false);
    expect(demoKeyMatches('', '')).toBe(false);
    expect(demoKeyMatches('court', 'court')).toBe(false);
    expect(demoModeEnabled(undefined)).toBe(false);
    expect(demoModeEnabled('court')).toBe(false);
    expect(demoModeEnabled(key)).toBe(true);
  });
});
