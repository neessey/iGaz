import { fullName, NAME_PATTERN, tidyName } from './names';

describe('noms des utilisateurs', () => {
  it('met en forme prénom et nom', () => {
    expect(tidyName('  awa  ')).toBe('Awa');
    expect(tidyName('KONÉ')).toBe('Koné');
    expect(tidyName('kouassi-traoré')).toBe('Kouassi-Traoré');
    expect(tidyName("n'guessan")).toBe("N'Guessan");
    expect(tidyName('jean   marc')).toBe('Jean Marc');
    expect(fullName(' awa ', 'KONÉ')).toBe('Awa Koné');
  });

  it('accepte les lettres accentuées, tirets, apostrophes et espaces', () => {
    for (const ok of ['Awa', 'Koné', 'Jean-Marc', "N'Guessan", 'Aya Marie', 'É']) expect(NAME_PATTERN.test(ok)).toBe(true);
  });

  it('refuse chiffres, symboles, début non alphabétique et noms trop longs', () => {
    for (const ko of ['', ' Awa', '-Awa', 'Awa2', 'Awa@', '<script>', 'A'.repeat(41)]) expect(NAME_PATTERN.test(ko)).toBe(false);
  });
});
