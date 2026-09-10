/** Les sections de Paramètres ; toutes sauf le journal sont réservées aux administrateurs (D11). */
export const PARAMETRES_ENTRIES = [
  { href: "/parametres/comptes", label: "Comptes", adminOnly: true },
  { href: "/parametres/cabinet", label: "Cabinet", adminOnly: true },
  { href: "/parametres/champs", label: "Champs", adminOnly: true },
  { href: "/parametres/modeles", label: "Modèles d'emails", adminOnly: true },
  { href: "/parametres/journal", label: "Journal des envois", adminOnly: false },
  { href: "/parametres/envoi-test", label: "Envoi de test", adminOnly: true },
] as const;

export type ParametresEntry = (typeof PARAMETRES_ENTRIES)[number];

/** Sections visibles par ce rôle ; les pages masquées restent protégées par leur `requireAdmin()` (contrat 16). */
export function allowedEntries(role: string | null | undefined): readonly ParametresEntry[] {
  return PARAMETRES_ENTRIES.filter((entry) => !entry.adminOnly || role === "administrateur");
}
