/**
 * Thème côté navigateur : application immédiate sur `<html>` (classe `dark`, `data-theme`
 * que le serveur a posés, contrat 26), enregistrement par l'API, abonnement des composants.
 */
import { isTheme, type Theme } from "@/features/theme/theme";

const listeners = new Set<() => void>();

const root = () => document.documentElement;

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Thème en vigueur sur `<html>` (`data-theme`, posé par le serveur puis par `applyTheme`). */
const currentTheme = (): Theme => {
  const theme = root().dataset.theme;
  return isTheme(theme) ? theme : "systeme";
};

/** Pose la classe `dark` selon le thème ; « système » suit le navigateur. */
export function applyTheme(theme: Theme) {
  root().dataset.theme = theme;
  root().classList.toggle("dark", theme === "sombre" || (theme === "systeme" && prefersDark()));
  for (const listener of listeners) listener();
}

/** Applique tout de suite, puis enregistre sur l'utilisateur (D17). Rend faux si l'enregistrement a échoué. */
export async function saveTheme(theme: Theme): Promise<boolean> {
  applyTheme(theme);
  const res = await fetch("/api/theme", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme }) }).catch(() => null);
  return res?.ok ?? false;
}

/**
 * Bascule entre clair et sombre depuis l'apparence actuelle (palette et pied de la barre latérale).
 * Si l'enregistrement échoue, l'écran revient au thème précédent et la fonction rend faux : l'appelant le dit.
 */
export async function toggleTheme(): Promise<boolean> {
  const previous = currentTheme();
  const saved = await saveTheme(root().classList.contains("dark") ? "clair" : "sombre");
  if (!saved) applyTheme(previous);
  return saved;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
