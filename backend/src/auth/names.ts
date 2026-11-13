/** Prénom ou nom : lettres (accents compris), espaces, tirets et apostrophes ; 1 à 40 caractères, commence par une lettre. */
export const NAME_PATTERN = /^\p{L}[\p{L}' -]{0,39}$/u;

/** « awa  KONÉ-traoré » → « Awa Koné-Traoré » : espaces resserrés, majuscule en début de chaque partie. */
export function tidyName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr'));
}

/** Nom complet enregistré sur le compte : « Prénom Nom ». */
export function fullName(firstName: string, lastName: string): string {
  return `${tidyName(firstName)} ${tidyName(lastName)}`;
}
