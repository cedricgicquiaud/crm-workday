/**
 * Application des filtres à des fiches déjà lues. Sous 500 lignes il n'y a pas de pagination (D6) :
 * la liste lit puis filtre en mémoire, ce qui garde le service générique intact et rend le filtrage
 * testable sans base. Les filtres se combinent en « et » seulement (D16).
 */
import type { Filter } from "@/features/lists/filters";
import { sortRecords, type Sort } from "@/features/lists/sort";
import { fieldsOf } from "@/features/objects/fields";
import type { FieldDescriptor } from "@/features/objects/registry";
import type { UserOption } from "@/features/objects/labels";
import type { ObjectRecord } from "@/features/objects/service";
import { normalizeQuery } from "@/features/search/normalize";

const isBlank = (value: unknown) => (Array.isArray(value) ? value.length === 0 : value === null || value === undefined || String(value).trim() === "");

/**
 * Un ensemble « contient » une valeur quand il la porte, entière (D11) : comparé en sous-chaîne,
 * « Client » ramènerait « Client final », et le filtre rendrait des fiches qui ne portent pas ce
 * qu'on cherche.
 */
const holds = (value: unknown, wanted: string) => Array.isArray(value) && value.some((entry) => text(entry) === text(wanted));

/** Comparaison des textes comme la recherche : minuscules, accents retirés (D8). */
const text = (value: unknown) => normalizeQuery(String(value ?? ""));

/** Jour `AAAA-MM-JJ` d'une date, qu'elle arrive en `Date` (base) ou en chaîne (API). */
const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

function matches(record: ObjectRecord, filter: Filter, field?: FieldDescriptor): boolean {
  const value = record[filter.field];
  if (filter.operator === "est_vide") return isBlank(value);
  if (field?.type === "multilist") return filter.operator === "contient" ? holds(value, filter.value) : !holds(value, filter.value);
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
  const fields = fieldsOf(type);
  const applicable = filters.flatMap((filter) => {
    const field = fields.find((candidate) => candidate.key === filter.field);
    return field ? [{ filter, field }] : [];
  });
  return records.filter((record) => applicable.every(({ filter, field }) => matches(record, filter, field)));
}

/**
 * Fiches d'une liste dans l'état lu de l'URL : filtrées puis triées. La route générique et l'écran
 * passent par ici, pour qu'une adresse partagée et un appel d'API rendent exactement la même liste.
 */
export function listForState(type: string, records: readonly ObjectRecord[], state: { filters: readonly Filter[]; sort: Sort }, users: readonly UserOption[] = []): ObjectRecord[] {
  return sortRecords(type, applyFilters(type, records, state.filters), state.sort, users);
}
