/**
 * Thème côté navigateur : application immédiate sur `<html>` (classe `dark`, `data-theme`),
 * enregistrement par l'API, et lecture par les composants (`useTheme`).
 */
import { isTheme, type Theme } from "@/features/theme/theme";

const listeners = new Set<() => void>();

const root = () => document.documentElement;

/** Thème préféré, tel que le serveur l'a écrit dans `data-theme` (contrat 26) ; « système » à défaut. */
export function readTheme(): Theme {
  const value = root().dataset.theme;
  return isTheme(value) ? value : "systeme";
}

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

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

/** Bascule entre clair et sombre depuis l'apparence actuelle (palette et pied de la barre latérale). */
export function toggleTheme(): Promise<boolean> {
  return saveTheme(root().classList.contains("dark") ? "clair" : "sombre");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
