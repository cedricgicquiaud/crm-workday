/**
 * État d'une liste porté par son URL (D18) : filtres, tri, colonnes visibles et bascule
 * « archivées ». On partage l'adresse, on l'ouvre au même état dans un autre onglet. Rien n'y est
 * obligatoire : une URL nue rend la liste par défaut, et un paramètre que la liste ne sait pas lire
 * est écarté — jamais une erreur d'écran.
 *
 * Paramètres : `f=champ:opérateur:valeur` (répétable), `tri=champ:asc|desc`,
 * `colonnes=champ,champ` (les colonnes après la première, qui ne se masque pas), `archivees=1`.
 */
import { readFilters, type Filter, type InactiveFilter, type RawFilter } from "@/features/lists/filters";
import { DEFAULT_SORT, isSortable, type Sort, type SortDirection } from "@/features/lists/sort";
import { getObject } from "@/features/objects/registry";

export type ListState = {
  filters: Filter[];
  /** filtres écartés, avec leur avertissement « filtre inactif » à afficher */
  inactive: InactiveFilter[];
  sort: Sort;
  /** colonnes visibles après la colonne titre, dans l'ordre choisi */
  columns: string[];
  includeArchived: boolean;
};

const FILTER = "f";
const SORT = "tri";
const COLUMNS = "colonnes";
const ARCHIVED = "archivees";

/** `champ:opérateur:valeur` ; la valeur garde ses deux-points (« avant 12:00 »). */
function parseFilter(raw: string): RawFilter {
  const [field = "", operator = "", ...rest] = raw.split(":");
  return { field, operator, value: rest.join(":") };
}

const serializeFilter = (filter: Filter) => `${filter.field}:${filter.operator}:${filter.value}`;

function parseSort(type: string, raw: string | null): Sort {
  const [field = "", direction = ""] = (raw ?? "").split(":");
  if (!isSortable(type, field) || (direction !== "asc" && direction !== "desc")) return DEFAULT_SORT;
  return { field, direction: direction as SortDirection };
}

const isDefaultSort = (sort: Sort) => sort.field === DEFAULT_SORT.field && sort.direction === DEFAULT_SORT.direction;

/** Colonnes visibles après la colonne titre ; celle-ci ne se masque pas, elle n'est donc jamais dans l'URL. */
function parseColumns(type: string, raw: string | null): string[] {
  const definition = getObject(type);
  const declared = new Set(definition.fields.map((field) => field.key));
  const keys = raw === null ? [...(definition.listColumns ?? [])] : raw.split(",");
  return keys.map((key) => key.trim()).filter((key, index, all) => key !== definition.titleField && declared.has(key) && all.indexOf(key) === index);
}

const defaultColumns = (type: string) => parseColumns(type, null);

/** Lit l'état d'une liste depuis les paramètres de son URL. */
export function parseListState(type: string, params: URLSearchParams): ListState {
  const { filters, inactive } = readFilters(type, params.getAll(FILTER).map(parseFilter));
  return {
    filters,
    inactive,
    sort: parseSort(type, params.get(SORT)),
    columns: parseColumns(type, params.get(COLUMNS)),
    includeArchived: params.get(ARCHIVED) === "1",
  };
}

/** Réécrit l'état en paramètres d'URL ; ce qui vaut le défaut ne s'écrit pas, l'adresse reste lisible. */
export function listStateToParams(type: string, state: ListState): URLSearchParams {
  const params = new URLSearchParams();
  for (const filter of state.filters) params.append(FILTER, serializeFilter(filter));
  if (!isDefaultSort(state.sort)) params.set(SORT, `${state.sort.field}:${state.sort.direction}`);
  if (state.columns.join(",") !== defaultColumns(type).join(",")) params.set(COLUMNS, state.columns.join(","));
  if (state.includeArchived) params.set(ARCHIVED, "1");
  return params;
}
