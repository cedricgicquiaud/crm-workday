/**
 * Thème côté navigateur : enregistrement par l'API puis application sur `<html>` (classe `dark`,
 * `data-theme` que le serveur a posés, contrat 26), abonnement des composants.
 */
import type { Theme } from "@/features/theme/theme";

const listeners = new Set<() => void>();

const root = () => document.documentElement;

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Pose la classe `dark` selon le thème ; « système » suit le navigateur. */
export function applyTheme(theme: Theme) {
  root().dataset.theme = theme;
  root().classList.toggle("dark", theme === "sombre" || (theme === "systeme" && prefersDark()));
  for (const listener of listeners) listener();
}

/**
 * Enregistre sur l'utilisateur (D17), puis applique : l'écran suit la valeur enregistrée. Appliquer avant
 * la réponse laissait un rechargement immédiat annuler la requête en vol et revenir à l'ancien thème.
 * Rend faux si l'enregistrement a échoué ; l'écran n'a alors pas changé.
 */
export async function saveTheme(theme: Theme): Promise<boolean> {
  const res = await fetch("/api/theme", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme }) }).catch(() => null);
  if (!res?.ok) return false;
  applyTheme(theme);
  return true;
}

/** Bascule entre clair et sombre depuis l'apparence actuelle (palette et pied de la barre latérale). Rend faux si l'enregistrement a échoué. */
export function toggleTheme(): Promise<boolean> {
  return saveTheme(root().classList.contains("dark") ? "clair" : "sombre");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
