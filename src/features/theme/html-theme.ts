import type { Theme } from "@/features/theme/theme";

/** Classe posée sur `<html>` par le serveur : `dark` pour le thème sombre, rien sinon (contrat 26). */
export function htmlThemeClass(theme: Theme): string | undefined {
  return theme === "sombre" ? "dark" : undefined;
}
