/**
 * Tri d'une liste (D6). Par défaut la dernière modification décroissante : une fiche créée ou
 * modifiée remonte en tête, comme le rend le service générique. Un champ ne se trie que s'il se
 * déclare `sortable` : l'en-tête cliquable et l'URL lisent la même règle.
 */
import { fieldsOf } from "@/features/objects/fields";
import { displayValue, type UserOption } from "@/features/objects/labels";
import { BASE_COLUMN_KEYS, type FieldType } from "@/features/objects/registry";
import type { ObjectRecord } from "@/features/objects/service";

export type SortDirection = "asc" | "desc";
export type Sort = { field: string; direction: SortDirection };

/** Colonnes de base toujours triables : elles ne viennent pas des descripteurs de champs (`BASE_COLUMN_KEYS` du registre). */
export const UPDATED_AT = "updatedAt";
export const CREATED_AT = "createdAt";

export const isBaseColumn = (key: string): boolean => BASE_COLUMN_KEYS.includes(key);

export const DEFAULT_SORT: Sort = { field: UPDATED_AT, direction: "desc" };

/** Vrai si la liste sait trier sur ce champ : une colonne de base (création, modification), ou un champ déclaré `sortable`. */
export function isSortable(type: string, key: string): boolean {
  if (isBaseColumn(key)) return true;
  return fieldsOf(type).some((field) => field.key === key && field.sortable === true);
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Types triés sur ce que la liste affiche, pas sur ce qu'elle enregistre : « Client », « Ana Bello », « HCM, Integration ». */
const SHOWN_TYPES: readonly FieldType[] = ["list", "user", "multilist"];

/** Rien à trier : une valeur absente, ou un ensemble sans valeur (D11). */
const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

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

/**
 * Fiches triées, sans modifier le tableau reçu ; à valeurs égales, la dernière modifiée est en tête.
 * Une liste et un responsable se trient sur la valeur affichée (« Client », « Ana Bello ») : trier
 * sur la clé enregistrée (« zzz », un identifiant) donnerait un ordre que personne ne lit à l'écran.
 */
export function sortRecords(type: string, records: readonly ObjectRecord[], sort: Sort, users: readonly UserOption[] = []): ObjectRecord[] {
  const field = fieldsOf(type).find((candidate) => candidate.key === sort.field);
  const shown = (record: ObjectRecord) => {
    /* Un champ dérivé déclare son rang : le tri le suit, jamais l'alphabet de ses libellés (D19). */
    if (field?.sortKey) return field.sortKey(record);
    const value = record[sort.field];
    if (!field || isEmpty(value) || !SHOWN_TYPES.includes(field.type)) return value;
    return displayValue(field, value, users);
  };
  return [...records].sort((a, b) => compareIn(sort.direction, shown(a), shown(b)) || compareIn("desc", a[UPDATED_AT], b[UPDATED_AT]));
}
