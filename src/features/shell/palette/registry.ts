/**
 * Registre des entrées de la palette Cmd+K (D16). Chaque module enregistre ses propres
 * entrées à son chargement ; la palette lit ce registre et rien d'autre. Aucune liste
 * centrale : ajouter une entrée ne modifie jamais les fichiers de la palette.
 */
import type { LucideIcon } from "lucide-react";

export type PaletteGroup = "navigation" | "actions";

export type PaletteContext = {
  /** Va vers une page de l'application. */
  navigate: (href: string) => void;
  /** Ferme la palette. */
  close: () => void;
};

export type PaletteEntry = {
  /** Identifiant stable : ré-enregistrer le même identifiant remplace l'entrée. */
  id: string;
  label: string;
  group: PaletteGroup;
  /** Mots supplémentaires qui font remonter l'entrée à la saisie. */
  keywords?: string[];
  /** Raccourci affiché à droite du libellé. */
  shortcut?: string;
  icon?: LucideIcon;
  run: (context: PaletteContext) => void | Promise<void>;
};

const entries = new Map<string, PaletteEntry>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Enregistre des entrées ; rend la fonction qui les retire. */
export function registerPaletteEntries(newEntries: readonly PaletteEntry[]): () => void {
  for (const entry of newEntries) entries.set(entry.id, entry);
  notify();
  return () => {
    for (const entry of newEntries) entries.delete(entry.id);
    notify();
  };
}

/** Prévient `listener` à chaque changement du registre ; rend la fonction de désabonnement (forme `useSyncExternalStore`). */
export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPaletteEntries(): readonly PaletteEntry[] {
  return Array.from(entries.values());
}
