/**
 * Normalisation d'une saisie de recherche (D8) : minuscules, accents retirés, espaces réduits.
 * Appliquée à la requête côté API ; les objets comparent ensuite avec leurs propres colonnes.
 */
export function normalizeQuery(query: string): string {
  return query
    .normalize("NFD")
    /* Les signes diacritiques détachés par NFD (accents, cédille, tréma). */
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
