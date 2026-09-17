/**
 * Lecture des descripteurs de champs d'un objet : ceux qu'il déclare au registre, et ceux qu'un
 * administrateur a définis (2.4). Les lecteurs ne distinguent pas les uns des autres.
 */
import { allCustomFieldsOf, customFieldsOf } from "@/features/custom-fields/fields-source";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";

/** Champs d'un objet, dans l'ordre d'affichage (`order` croissant) ; les champs personnalisés viennent après. */
export function fieldsOf(type: string): readonly FieldDescriptor[] {
  return [...getObject(type).fields, ...customFieldsOf(type)].sort((a, b) => a.order - b.order);
}

/**
 * Champs dont l'historique d'une fiche peut nommer le libellé : ceux de la fiche, ceux que l'objet
 * déclare comme édités ailleurs (`historyFields`), et les champs personnalisés — archivés compris,
 * car un changement d'hier se relit après l'archivage du champ. Un champ absent d'ici s'afficherait
 * dans l'historique par sa clé brute (« decisionRole ») au lieu de son libellé.
 */
export function historyFieldsOf(type: string): readonly FieldDescriptor[] {
  const definition = getObject(type);
  return [...definition.fields, ...(definition.historyFields ?? []), ...allCustomFieldsOf(type)].sort((a, b) => a.order - b.order);
}

/**
 * Champs que l'objet écrit lui-même : les siens, moins ceux qui appartiennent à un profil (D19). Un
 * champ de profil reste un champ de l'objet — colonne, filtre, tri, historique — mais il se règle par
 * l'API de son profil, où son caractère obligatoire s'entend ; l'API de l'objet le refuse.
 */
export function writableFieldsOf(type: string): readonly FieldDescriptor[] {
  return fieldsOf(type).filter((field) => field.profile === undefined);
}

/**
 * Champs qu'une fiche affiche : ceux qui se saisissent, plus les champs personnalisés archivés dont
 * cette fiche porte une valeur (contrat 19). Le champ archivé arrive en lecture seule : sa valeur se
 * lit comme un texte, elle ne se modifie plus, et une fiche sans valeur ne le montre pas du tout.
 */
export function sheetFieldsOf(type: string, record: Record<string, unknown>): readonly FieldDescriptor[] {
  /* Les champs d'un profil se rendent dans la section de leur profil, jamais sous « Champs » (D9). */
  const shown = writableFieldsOf(type);
  const kept = new Set(shown.map((field) => field.key));
  const archived = allCustomFieldsOf(type).filter((field) => !kept.has(field.key) && !blank(record[field.key]));
  return [...shown, ...archived].sort((a, b) => a.order - b.order);
}

/** Vrai quand la fiche fige ce champ (D21) : il se lit en texte et ne s'écrit plus tant qu'elle est dans cet état. */
export const isLocked = (field: FieldDescriptor, record: Record<string, unknown>): boolean => field.lockedWhen?.test(record) === true;

/** Valeur validée d'un champ : texte pour `text`, `list`, `user` et `date` (jour ISO), nombre pour `number`, tableau de clés pour `multilist`, `null` pour un champ vidé. */
export type FieldValue = string | number | string[] | null;
export type FieldValues = Record<string, FieldValue>;
export type FieldErrors = Record<string, string>;

/** Messages des règles communes ; le descripteur d'un champ peut porter les siens (`pattern.message`). */
const MESSAGES = {
  required: (label: string) => `« ${label} » est obligatoire.`,
  invalid: (label: string) => `Valeur invalide pour « ${label} ».`,
  notADate: (label: string) => `« ${label} » doit être une date au format AAAA-MM-JJ.`,
  notANumber: (label: string) => `« ${label} » doit être un nombre.`,
  outOfList: (label: string) => `Valeur hors liste pour « ${label} ».`,
  reserved: (value: string, label: string) => `« ${value} » ne se pose pas à la main dans « ${label} ».`,
  tooLong: (label: string, max: number) => `« ${label} » dépasse ${max} caractères.`,
  notASet: (label: string) => `« ${label} » attend une liste de valeurs.`,
  notAnInteger: (label: string) => `« ${label} » doit être un nombre entier.`,
  tooManyDecimals: (label: string, decimals: number) => `« ${label} » ne prend pas plus de ${decimals} décimale${decimals > 1 ? "s" : ""}.`,
  outOfRange: (label: string, min: number, max: number) => `« ${label} » doit être compris entre ${grouped(min)} et ${grouped(max)}.`,
  outOfRangeAbove: (label: string, min: number, max: number) => `« ${label} » doit être supérieur à ${grouped(min)} et au plus ${grouped(max)}.`,
};

/** « 10 000 » : les milliers séparés par une espace, comme les montants des fondations, sans dépendre de la locale d'exécution. */
const grouped = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Une valeur absente et une chaîne vide (ou blanche) sont la même chose : rien. Un ensemble, lui, est une valeur même vide : il se distingue d'un champ jamais renseigné. */
const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** Vrai pour un ensemble sans valeur : ce qu'un `multilist` porte quand il ne porte rien. */
export const isEmptySet = (value: unknown): boolean => Array.isArray(value) && value.length === 0;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Jour ISO (`AAAA-MM-JJ`) d'une date, en UTC. */
const isoDay = (value: Date): string => value.toISOString().slice(0, 10);

/** Vrai pour une chaîne `AAAA-MM-JJ` qui désigne un jour qui existe (« 2026-13-45 » n'en est pas un). */
function isIsoDay(text: string): boolean {
  if (!ISO_DAY.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && isoDay(parsed) === text;
}

/**
 * Lit la valeur brute d'un champ selon son type. Une valeur qui n'est pas du bon type (objet, tableau,
 * nombre dans un champ texte…) est refusée : `String(value)` enregistrerait « [object Object] ».
 * `date` : une chaîne `AAAA-MM-JJ` valide ; `number` : un nombre fini (JSON) ; les autres : une chaîne.
 */
function parseValue(field: FieldDescriptor, raw: unknown): { value: FieldValue } | { error: string } {
  if (field.type === "multilist") {
    if (raw === null || raw === undefined) return { value: [] };
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) return { error: MESSAGES.notASet(field.label) };
    return { value: (raw as string[]).map((entry) => entry.trim()) };
  }
  if (blank(raw)) return { value: null };
  if (field.type === "number") return typeof raw === "number" && Number.isFinite(raw) ? { value: raw } : { error: MESSAGES.notANumber(field.label) };
  if (field.type === "date") return typeof raw === "string" && isIsoDay(raw.trim()) ? { value: raw.trim() } : { error: MESSAGES.notADate(field.label) };
  if (typeof raw !== "string") return { error: MESSAGES.invalid(field.label) };
  return { value: raw.trim() };
}

/**
 * Sérialisation stable d'une valeur, lue en base ou reçue, pour la comparer et l'historiser (D12) :
 * jour ISO pour une `date` (qu'elle arrive en `Date` ou en chaîne), décimal canonique pour un `number`
 * (« 12.50 » et 12.5 s'écrivent « 12.5 »), texte tel quel sinon ; une valeur vide est `null`.
 */
export function serializeValue(field: FieldDescriptor, value: unknown): string | null {
  /* Un ensemble se compare et s'historise par ses clés jointes ; l'historique les rend lisibles à la lecture, comme il le fait d'une liste fermée. Vide, il n'a pas de valeur : l'historique l'écrit « vide » (D24). */
  if (field.type === "multilist") return Array.isArray(value) && value.length > 0 ? value.join(",") : null;
  if (blank(value)) return null;
  if (field.type === "date") return value instanceof Date ? isoDay(value) : String(value);
  if (field.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : String(value);
  }
  return String(value);
}

/** Libellés des valeurs d'un ensemble, dans l'ordre reçu ; une valeur retirée de la liste reste lisible, marquée (2.4, D3). */
export function setLabels(field: FieldDescriptor, values: readonly unknown[]): string[] {
  return values.map((entry) => {
    const text = String(entry);
    const retired = field.retiredValues?.find((v) => v.value === text);
    if (retired) return `${retired.label} (retirée)`;
    return field.values?.find((v) => v.value === text)?.label ?? text;
  });
}

/** Normalisation propre au champ texte (espaces d'un SIREN…), avant toute règle ; une valeur vidée par elle reste vide. */
function normalize(field: FieldDescriptor, value: FieldValue): FieldValue {
  if (typeof value !== "string" || !field.normalize) return value;
  const text = field.normalize(value).trim();
  return text === "" ? null : text;
}

/**
 * Vrai si le nombre s'écrit avec `decimals` décimales au plus. Le produit par la puissance de dix
 * n'est pas exact en virgule flottante (19,99 × 100 donne 1 998,999…) : il se compare à son arrondi
 * avec une tolérance bien plus fine que la décimale suivante.
 */
function hasDecimalsAtMost(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Ce que les précisions d'un nombre reprochent à une valeur, ou rien : entier, décimales, bornes (D5, D7). */
function numberProblem(field: FieldDescriptor, value: number): string | undefined {
  if (field.integer === true && !Number.isInteger(value)) return MESSAGES.notAnInteger(field.label);
  if (field.decimals !== undefined && !hasDecimalsAtMost(value, field.decimals)) return MESSAGES.tooManyDecimals(field.label, field.decimals);
  if (field.min !== undefined && field.max !== undefined) {
    const below = field.minExclusive === true ? value <= field.min : value < field.min;
    if (below || value > field.max) return (field.minExclusive === true ? MESSAGES.outOfRangeAbove : MESSAGES.outOfRange)(field.label, field.min, field.max);
  }
  return undefined;
}

/**
 * Valide et normalise des valeurs saisies par les descripteurs, côté formulaire comme côté API.
 * `partial` : seuls les champs présents sont validés (modification) ; sinon les champs obligatoires
 * sans valeur par défaut manquent (création). Les clés inconnues sont ignorées.
 */
export function validateValues(fields: readonly FieldDescriptor[], input: unknown, { partial }: { partial: boolean }): { values: FieldValues; errors: FieldErrors } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const values: FieldValues = {};
  const errors: FieldErrors = {};
  for (const field of fields) {
    const present = field.key in raw;
    if (!present && partial) continue;
    const parsed = parseValue(field, raw[field.key]);
    if ("error" in parsed) {
      errors[field.key] = parsed.error;
      continue;
    }
    const value = normalize(field, parsed.value);
    if (Array.isArray(value)) {
      const unknown = value.find((entry) => !field.values?.some((v) => v.value === entry));
      if (unknown !== undefined) errors[field.key] = MESSAGES.outOfList(field.label);
      /* Un ensemble obligatoire porte au moins une valeur : vide, il manque comme un champ vide. */
      else if (field.required && value.length === 0) errors[field.key] = MESSAGES.required(field.label);
      else values[field.key] = value;
      continue;
    }
    if (value === null) {
      if (field.required && (present || field.default === undefined)) errors[field.key] = MESSAGES.required(field.label);
      else if (present) values[field.key] = null;
      continue;
    }
    if (typeof value === "number") {
      const problem = numberProblem(field, value);
      if (problem) {
        errors[field.key] = problem;
        continue;
      }
    }
    if (typeof value === "string") {
      const listed = field.type === "list" ? field.values?.find((v) => v.value === value) : undefined;
      if (field.type === "list" && !listed) {
        errors[field.key] = MESSAGES.outOfList(field.label);
        continue;
      }
      /* Une valeur réservée n'est posée que par le geste de l'objet, qui écrit sans passer par ici (D21). */
      if (listed?.reserved) {
        errors[field.key] = MESSAGES.reserved(listed.label, field.label);
        continue;
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors[field.key] = MESSAGES.tooLong(field.label, field.maxLength);
        continue;
      }
      if (field.pattern && !field.pattern.regex.test(value)) {
        errors[field.key] = field.pattern.message;
        continue;
      }
    }
    values[field.key] = value;
  }
  return { values, errors };
}
