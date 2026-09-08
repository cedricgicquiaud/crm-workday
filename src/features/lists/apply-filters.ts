/**
 * Application des filtres à des fiches déjà lues. Sous 500 lignes il n'y a pas de pagination (D6) :
 * la liste lit puis filtre en mémoire, ce qui garde le service générique intact et rend le filtrage
 * testable sans base. Les filtres se combinent en « et » seulement (D16).
 */
import type { Filter } from "@/features/lists/filters";
import { fieldsOf } from "@/features/objects/fields";
import type { ObjectRecord } from "@/features/objects/service";
import { normalizeQuery } from "@/features/search/normalize";

const isBlank = (value: unknown) => value === null || value === undefined || String(value).trim() === "";

/** Comparaison des textes comme la recherche : minuscules, accents retirés (D8). */
const text = (value: unknown) => normalizeQuery(String(value ?? ""));

/** Jour `AAAA-MM-JJ` d'une date, qu'elle arrive en `Date` (base) ou en chaîne (API). */
const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

function matches(record: ObjectRecord, filter: Filter): boolean {
  const value = record[filter.field];
  if (filter.operator === "est_vide") return isBlank(value);
  /* Un champ vide « ne contient pas » ce qu'on cherche et « n'est pas » la valeur : les fiches sans valeur restent dans un refus. */
  if (filter.operator === "ne_contient_pas") return !text(value).includes(text(filter.value));
  if (filter.operator === "n_est_pas") return text(value) !== text(filter.value);
  if (isBlank(value)) return false;
  switch (filter.operator) {
    case "contient":
      return text(value).includes(text(filter.value));
    case "est":
      return text(value) === text(filter.value);
    /* Les jours sont des chaînes `AAAA-MM-JJ` : l'ordre alphabétique est l'ordre chronologique. */
    case "avant":
      return day(value) < filter.value;
    case "apres":
      return day(value) > filter.value;
    case "egal":
      return Number(value) === Number(filter.value);
    case "plus_grand":
      return Number(value) > Number(filter.value);
    case "plus_petit":
      return Number(value) < Number(filter.value);
    default:
      return false;
  }
}

/** Fiches qui satisfont tous les filtres, dans l'ordre reçu ; un filtre sur un champ non déclaré ne passe jamais par ici (voir `readFilters`). */
export function applyFilters(type: string, records: readonly ObjectRecord[], filters: readonly Filter[]): ObjectRecord[] {
  const known = new Set(fieldsOf(type).map((field) => field.key));
  const applicable = filters.filter((filter) => known.has(filter.field));
  return records.filter((record) => applicable.every((filter) => matches(record, filter)));
}
