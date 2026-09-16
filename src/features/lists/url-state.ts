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
import { getList, getObject } from "@/features/objects/registry";

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

/**
 * Marqueur « aucun filtre » (D10) : une vue par défaut qui porte des puces se rouvre avec elles à
 * l'adresse nue ; retirer toutes ses puces écrit `filtres=aucun`, sans quoi l'adresse redeviendrait
 * nue et les puces reviendraient au rechargement.
 */
const NO_FILTER = "filtres";
const NO_FILTER_VALUE = "aucun";

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

/**
 * Paramètres effectifs d'une liste ouverte sans vue enregistrée : ceux de sa vue par défaut déclarée
 * (D10), chaque famille présente dans l'adresse remplaçant la sienne. `filtres=aucun` retire les puces
 * de la vue par défaut. Une liste qui ne déclare rien rend l'adresse telle quelle.
 */
export function applyDefaultView(list: string, params: URLSearchParams): URLSearchParams {
  const merged = new URLSearchParams(getList(list).defaultViewQuery ?? "");
  for (const key of new Set(params.keys())) {
    merged.delete(key);
    for (const value of params.getAll(key)) merged.append(key, value);
  }
  if (merged.get(NO_FILTER) === NO_FILTER_VALUE) merged.delete(FILTER);
  merged.delete(NO_FILTER);
  return merged;
}

/** `champ:opérateur:valeur` ; la valeur garde ses deux-points (« avant 12:00 »). */
function parseFilter(raw: string): RawFilter {
  const [field = "", operator = "", ...rest] = raw.split(":");
  return { field, operator, value: rest.join(":") };
}

const serializeFilter = (filter: Filter) => `${filter.field}:${filter.operator}:${filter.value}`;

function parseSort(objectKey: string, raw: string | null): Sort {
  const [field = "", direction = ""] = (raw ?? "").split(":");
  if (!isSortable(objectKey, field) || (direction !== "asc" && direction !== "desc")) return DEFAULT_SORT;
  return { field, direction: direction as SortDirection };
}

const sameSort = (a: Sort, b: Sort) => a.field === b.field && a.direction === b.direction;

/** Colonnes visibles après la colonne titre ; celle-ci ne se masque pas, elle n'est donc jamais dans l'URL. */
function parseColumns(list: string, raw: string | null): string[] {
  const titleField = getObject(getList(list).objectKey).titleField;
  const declared = new Set(columnsOf(list).map((column) => column.key));
  const keys = raw === null ? defaultColumnKeys(list) : raw.split(",");
  return keys.map((key) => key.trim()).filter((key, index, all) => key !== titleField && declared.has(key) && all.indexOf(key) === index);
}

const defaultColumns = (list: string) => parseColumns(list, null);

/** Lit l'état d'une liste depuis les paramètres de son URL ; les champs sont ceux de l'objet qu'elle liste. */
export function parseListState(list: string, params: URLSearchParams): ListState {
  const { objectKey } = getList(list);
  const { filters, inactive } = readFilters(objectKey, params.getAll(FILTER).map(parseFilter));
  return {
    filters,
    inactive,
    sort: parseSort(objectKey, params.get(SORT)),
    columns: parseColumns(list, params.get(COLUMNS)),
    includeArchived: params.get(ARCHIVED) === "1",
    view: readViewId(params),
  };
}

/** Ce qu'une adresse sans paramètre donnerait : les puces et le tri contre lesquels l'état s'écrit. */
type Baseline = { filters: readonly Filter[]; sort: Sort };

const BARE: Baseline = { filters: [], sort: DEFAULT_SORT };

/**
 * Réécrit l'état en paramètres d'URL ; ce qui vaut le défaut ne s'écrit pas, l'adresse reste lisible.
 * Sans vue enregistrée, le défaut est la vue par défaut de la liste (D10) : ses puces et son tri ne
 * s'écrivent pas, et des puces toutes retirées s'écrivent `filtres=aucun`. `absolute` écrit l'état
 * contre la liste nue — c'est ce qu'une vue enregistrée range, qui ne dépend pas de la vue par défaut.
 */
export function listStateToParams(list: string, state: ListState, { absolute = false }: { absolute?: boolean } = {}): URLSearchParams {
  const baseline = absolute || state.view ? BARE : parseListState(list, applyDefaultView(list, new URLSearchParams()));
  const params = new URLSearchParams();
  /* La vue en tête : l'adresse dit d'abord d'où l'on part, puis ce qu'on y a changé. */
  if (state.view) params.set(VIEW, state.view);
  const filters = state.filters.map(serializeFilter);
  if (filters.join("\n") !== baseline.filters.map(serializeFilter).join("\n")) {
    if (filters.length === 0) params.set(NO_FILTER, NO_FILTER_VALUE);
    for (const filter of filters) params.append(FILTER, filter);
  }
  if (!sameSort(state.sort, baseline.sort)) params.set(SORT, `${state.sort.field}:${state.sort.direction}`);
  if (state.columns.join(",") !== defaultColumns(list).join(",")) params.set(COLUMNS, state.columns.join(","));
  if (state.includeArchived) params.set(ARCHIVED, "1");
  return params;
}

/** Adresse de la liste dans cet état : ce que partage un membre, et ce que poussent les puces et le menu des colonnes. */
export function listUrl(list: string, state: ListState): string {
  const query = listStateToParams(list, state).toString();
  const { href } = getList(list);
  return query === "" ? href : `${href}?${query}`;
}

/** Paramètres tels que Next.js les passe à une page, ramenés à des paramètres d'URL. */
export function searchParamsOf(query: Record<string, string | string[] | undefined> = {}): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, entry);
  }
  return params;
}
