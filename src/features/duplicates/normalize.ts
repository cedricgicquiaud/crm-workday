/**
 * Normalisation des noms rapprochés (D19, contrat 28). Deux fiches sont des doublons probables
 * quand leurs noms se réduisent ici à la même forme. Mécanisme commun : ce fichier ne connaît aucun
 * objet, ce sont les objets qui l'appellent depuis leur `duplicateKey` (règle de branchement, D4).
 * Règle métier de la liste des formes juridiques : elle vit ici et nulle part ailleurs.
 *
 * Il porte aussi la phrase du signal et le paramètre d'adresse qui ouvre la fusion : c'est le seul
 * module des doublons que le navigateur peut charger (`duplicates.ts` ouvre la base), et la bannière
 * comme le dialogue de création s'en servent des deux côtés.
 */

/**
 * Paramètre d'adresse qui ouvre la fusion sur la fiche, la jumelle déjà choisie : la bannière (côté
 * serveur) l'écrit dans son lien, le menu d'actions (côté navigateur) le lit. Une seule constante,
 * sinon les deux moitiés du geste se perdraient sur une faute de frappe.
 */
export const MERGE_PARAM = "fusion";

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

/**
 * Phrase du signal, la même en bannière de fiche et dans le dialogue de création (contrat 28) : elle
 * nomme la fiche jumelle quand il n'y en a qu'une, et les compte au-delà — les nommer toutes ferait
 * un pavé à la place d'un signalement.
 */
export function duplicateMessage(titles: readonly string[]): string {
  const named = titles.length === 1 ? `« ${titles[0]} » porte un nom très proche` : `${titles.length} fiches portent un nom très proche`;
  return `Doublon probable : ${named}.`;
}
