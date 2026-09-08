/**
 * État d'une liste porté par son URL (D18) : filtres, tri, colonnes visibles et bascule
 * « archivées ». On partage l'adresse, on l'ouvre au même état dans un autre onglet. Rien n'y est
 * obligatoire : une URL nue rend la liste par défaut, et un paramètre que la liste ne sait pas lire
 * est écarté — jamais une erreur d'écran.
 *
 * Paramètres : `f=champ:opérateur:valeur` (répétable), `tri=champ:asc|desc`,
 * `colonnes=champ,champ` (les colonnes après la première, qui ne se masque pas), `archivees=1`,
 * `vue=<identifiant>` (2.5b : la vue sauvegardée ouverte ; `default` est la liste nue).
 */
import { columnsOf, defaultColumnKeys } from "@/features/lists/columns";
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
  /** vue sauvegardée ouverte, nulle pour la vue par défaut de l'objet (2.5b) */
  view: string | null;
};

const FILTER = "f";
const SORT = "tri";
const COLUMNS = "colonnes";
const ARCHIVED = "archivees";
const VIEW = "vue";

/** Identifiant synthétique de la vue par défaut d'un objet : la liste nue, sans ligne en base (2.5b). */
export const DEFAULT_VIEW = "default";

/** Vue demandée par l'adresse, ou rien : la vue par défaut ne s'écrit jamais dans l'URL. */
export function readViewId(params: URLSearchParams): string | null {
  const raw = (params.get(VIEW) ?? "").trim();
  return raw === "" || raw === DEFAULT_VIEW ? null : raw;
}

/**
 * Paramètres effectifs d'une liste ouverte sur une vue : ceux de la vue, chaque famille présente
 * dans l'adresse remplaçant la sienne — on affine une vue sans la modifier. Une vue introuvable
 * (`null`, supprimée par un collègue) est simplement ignorée, comme un filtre inconnu.
 */
export function applyViewParams(viewQuery: string | null, params: URLSearchParams): URLSearchParams {
  const merged = new URLSearchParams(viewQuery ?? "");
  merged.delete(VIEW);
  for (const key of new Set(params.keys())) {
    if (key === VIEW && viewQuery === null) continue;
    merged.delete(key);
    for (const value of params.getAll(key)) merged.append(key, value);
  }
  return merged;
}

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
  const declared = new Set(columnsOf(type).map((column) => column.key));
  const keys = raw === null ? defaultColumnKeys(type) : raw.split(",");
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
    view: readViewId(params),
  };
}

/** Réécrit l'état en paramètres d'URL ; ce qui vaut le défaut ne s'écrit pas, l'adresse reste lisible. */
export function listStateToParams(type: string, state: ListState): URLSearchParams {
  const params = new URLSearchParams();
  /* La vue en tête : l'adresse dit d'abord d'où l'on part, puis ce qu'on y a changé. */
  if (state.view) params.set(VIEW, state.view);
  for (const filter of state.filters) params.append(FILTER, serializeFilter(filter));
  if (!isDefaultSort(state.sort)) params.set(SORT, `${state.sort.field}:${state.sort.direction}`);
  if (state.columns.join(",") !== defaultColumns(type).join(",")) params.set(COLUMNS, state.columns.join(","));
  if (state.includeArchived) params.set(ARCHIVED, "1");
  return params;
}

/** Adresse de la liste dans cet état : ce que partage un membre, et ce que poussent les puces et le menu des colonnes. */
export function listUrl(type: string, state: ListState): string {
  const query = listStateToParams(type, state).toString();
  return query === "" ? getObject(type).listHref : `${getObject(type).listHref}?${query}`;
}

/** Paramètres tels que Next.js les passe à une page, ramenés à des paramètres d'URL. */
export function searchParamsOf(query: Record<string, string | string[] | undefined> = {}): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, entry);
  }
  return params;
}
