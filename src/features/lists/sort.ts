/**
 * Tri d'une liste (D6). Par défaut la dernière modification décroissante : une fiche créée ou
 * modifiée remonte en tête, comme le rend le service générique. Un champ ne se trie que s'il se
 * déclare `sortable` : l'en-tête cliquable et l'URL lisent la même règle.
 */
import { fieldsOf } from "@/features/objects/fields";
import type { ObjectRecord } from "@/features/objects/service";

export type SortDirection = "asc" | "desc";
export type Sort = { field: string; direction: SortDirection };

/** Colonne de base toujours triable : elle ne vient pas des descripteurs de champs. */
export const UPDATED_AT = "updatedAt";

export const DEFAULT_SORT: Sort = { field: UPDATED_AT, direction: "desc" };

/** Vrai si la liste sait trier sur ce champ : la dernière modification, ou un champ déclaré `sortable`. */
export function isSortable(type: string, key: string): boolean {
  if (key === UPDATED_AT) return true;
  return fieldsOf(type).some((field) => field.key === key && field.sortable === true);
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/** Compare deux valeurs d'un même champ, toutes deux renseignées : dates, nombres, puis texte en français. */
function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Compare selon le sens demandé ; une fiche sans valeur passe en dernier dans les deux sens. */
function compareIn(direction: SortDirection, a: unknown, b: unknown): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
  return (direction === "desc" ? -1 : 1) * compare(a, b);
}

/** Fiches triées, sans modifier le tableau reçu ; à valeurs égales, la dernière modifiée est en tête. */
export function sortRecords(type: string, records: readonly ObjectRecord[], sort: Sort): ObjectRecord[] {
  return [...records].sort((a, b) => compareIn(sort.direction, a[sort.field], b[sort.field]) || compareIn("desc", a[UPDATED_AT], b[UPDATED_AT]));
}
