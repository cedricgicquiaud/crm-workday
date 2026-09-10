/**
 * Normalisation des noms rapprochés (D19, contrat 28). Deux fiches sont des doublons probables
 * quand leurs noms se réduisent ici à la même forme. Mécanisme commun : ce fichier ne connaît aucun
 * objet, ce sont les objets qui l'appellent depuis leur `duplicateKey` (règle de branchement, D4).
 * Règle métier de la liste des formes juridiques : elle vit ici et nulle part ailleurs.
 */

/** Formes juridiques retirées d'une raison sociale, liste fermée (D19). */
export const LEGAL_FORMS: readonly string[] = ["sa", "sas", "sasu", "sarl", "eurl", "snc", "sci", "sel", "scop", "gmbh", "ltd", "inc", "bv"];

/** Mots trop communs pour distinguer deux raisons sociales (D19). */
export const GENERIC_WORDS: readonly string[] = ["societe", "groupe"];

/**
 * Forme comparable d'un nom : minuscules, sans accents, sans ponctuation, espaces réduits.
 * Apostrophes et points collent les lettres qu'ils séparaient (« L'Oréal » et « LOreal » sont le
 * même nom, « S.A.S. » est la forme juridique) ; toute autre ponctuation sépare deux mots.
 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Forme comparable d'une raison sociale : celle d'un nom, moins les formes juridiques et les mots
 * trop communs. Un nom qui n'est fait que de ces mots-là les garde : sinon « Groupe » et « SAS »
 * se réduiraient tous deux au vide et se signaleraient comme doublons l'un de l'autre.
 */
export function normalizeCompanyName(value: string): string {
  const words = normalizeName(value).split(" ").filter(Boolean);
  const kept = words.filter((word) => !LEGAL_FORMS.includes(word) && !GENERIC_WORDS.includes(word));
  return (kept.length > 0 ? kept : words).join(" ");
}
