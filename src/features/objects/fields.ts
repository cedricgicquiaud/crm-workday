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

/** Valeurs validées : texte pour `text`, `list`, `user` et `date` (jour ISO), nombre pour `number`, `null` pour un champ vidé. */
export type FieldValues = Record<string, string | number | null>;
export type FieldErrors = Record<string, string>;

/** Messages des règles communes ; le descripteur d'un champ peut porter les siens (`pattern.message`). */
const MESSAGES = {
  required: (label: string) => `« ${label} » est obligatoire.`,
  invalid: (label: string) => `Valeur invalide pour « ${label} ».`,
  notADate: (label: string) => `« ${label} » doit être une date au format AAAA-MM-JJ.`,
  notANumber: (label: string) => `« ${label} » doit être un nombre.`,
  outOfList: (label: string) => `Valeur hors liste pour « ${label} ».`,
  tooLong: (label: string, max: number) => `« ${label} » dépasse ${max} caractères.`,
};

/** Une valeur absente et une chaîne vide (ou blanche) sont la même chose : rien. */
const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

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
function parseValue(field: FieldDescriptor, raw: unknown): { value: string | number | null } | { error: string } {
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
  if (blank(value)) return null;
  if (field.type === "date") return value instanceof Date ? isoDay(value) : String(value);
  if (field.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : String(value);
  }
  return String(value);
}

/** Normalisation propre au champ texte (espaces d'un SIREN…), avant toute règle ; une valeur vidée par elle reste vide. */
function normalize(field: FieldDescriptor, value: string | number | null): string | number | null {
  if (typeof value !== "string" || !field.normalize) return value;
  const text = field.normalize(value).trim();
  return text === "" ? null : text;
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
    if (value === null) {
      if (field.required && (present || field.default === undefined)) errors[field.key] = MESSAGES.required(field.label);
      else if (present) values[field.key] = null;
      continue;
    }
    if (typeof value === "string") {
      if (field.type === "list" && !field.values?.some((v) => v.value === value)) {
        errors[field.key] = MESSAGES.outOfList(field.label);
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
