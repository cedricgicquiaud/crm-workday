/**
 * Valeurs du thème (D17). Seule source : l'API, le formulaire de Mon profil, la palette et
 * le layout racine lisent cette liste.
 */
export const THEMES = ["clair", "sombre", "systeme"] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}
