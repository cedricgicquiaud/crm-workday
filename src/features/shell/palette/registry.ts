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
  /** Rang dans sa section : les entrées ordonnées d'abord (croissant), puis les autres par libellé. */
  order?: number;
  run: (context: PaletteContext) => void | Promise<void>;
};

const entries = new Map<string, PaletteEntry>();
const listeners = new Set<() => void>();
/** Instantané stable entre deux changements : `useSyncExternalStore` compare les références. */
let snapshot: readonly PaletteEntry[] = [];

/** Rang croissant, les éléments sans rang en dernier ; 0 quand le rang ne départage pas. */
function compareOrder(a: number | undefined, b: number | undefined): number {
  if (a !== undefined && b !== undefined) return a - b;
  if (a !== undefined) return -1;
  if (b !== undefined) return 1;
  return 0;
}

/** Ordre déterministe, indépendant de l'ordre de chargement des modules : `order` croissant, puis libellé. */
function compareEntries(a: PaletteEntry, b: PaletteEntry): number {
  return compareOrder(a.order, b.order) || a.label.localeCompare(b.label, "fr");
}

function notify() {
  snapshot = Array.from(entries.values()).sort(compareEntries);
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
  return snapshot;
}

/* --------------------------------------------------------------------------------------------
 * Sources de résultats (D8) : un objet enregistre sa recherche asynchrone ; la palette affiche
 * ce qu'elle rend dans le groupe « Résultats », sans jamais nommer l'objet.
 * ------------------------------------------------------------------------------------------ */

/** Une fiche trouvée : son libellé, son icône d'objet et l'adresse que la touche Entrée ouvre. */
export type PaletteResult = {
  /** Unique entre toutes les sources (préfixer par la clé de l'objet). */
  id: string;
  label: string;
  subtitle?: string;
  icon?: LucideIcon;
  href: string;
};

export type PaletteSource = {
  /** Identifiant stable : ré-enregistrer le même identifiant remplace la source. */
  id: string;
  /** Rang des résultats de cette source parmi les autres (croissant). */
  order?: number;
  search: (query: string) => Promise<PaletteResult[]>;
};

const sources = new Map<string, PaletteSource>();
let sourcesSnapshot: readonly PaletteSource[] = [];

/** `order` croissant, les sources sans rang en dernier, puis identifiant : l'ordre ne dépend jamais de l'ordre des imports. */
function compareSources(a: PaletteSource, b: PaletteSource): number {
  return compareOrder(a.order, b.order) || a.id.localeCompare(b.id, "fr");
}

function notifySources() {
  sourcesSnapshot = Array.from(sources.values()).sort(compareSources);
}

/** Enregistre une source ; rend la fonction qui la retire. */
export function registerPaletteSource(source: PaletteSource): () => void {
  sources.set(source.id, source);
  notifySources();
  return () => {
    sources.delete(source.id);
    notifySources();
  };
}

export function getPaletteSources(): readonly PaletteSource[] {
  return sourcesSnapshot;
}

/** Sous ce nombre de caractères saisis (espaces retirés), aucune source n'est interrogée (D8). */
export const PALETTE_SEARCH_MIN_LENGTH = 3;

/** Vrai quand la saisie atteint le seuil : la palette montre le groupe « Résultats » et les sources sont interrogées. */
export const isSearchableQuery = (query: string) => query.trim().length >= PALETTE_SEARCH_MIN_LENGTH;

/** Interroge les sources avec la saisie ; rien sous le seuil. */
export async function searchPaletteSources(query: string): Promise<PaletteResult[]> {
  if (!isSearchableQuery(query)) return [];
  const results = await Promise.all(sourcesSnapshot.map((source) => source.search(query.trim())));
  return results.flat();
}
