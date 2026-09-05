/**
 * Lecture des descripteurs de champs d'un objet. La livraison 2.4 y ajoutera les champs
 * personnalisés définis par un administrateur, sans que les lecteurs changent.
 */
import { getObject, type FieldDescriptor } from "@/features/objects/registry";

/** Champs d'un objet, dans l'ordre d'affichage (`order` croissant). */
export function fieldsOf(type: string): readonly FieldDescriptor[] {
  return [...getObject(type).fields].sort((a, b) => a.order - b.order);
}

export type FieldValues = Record<string, string | null>;
export type FieldErrors = Record<string, string>;

/** Messages des règles communes ; le descripteur d'un champ peut porter les siens (`pattern.message`). */
const MESSAGES = {
  required: (label: string) => `« ${label} » est obligatoire.`,
  invalid: (label: string) => `Valeur invalide pour « ${label} ».`,
  outOfList: (label: string) => `Valeur hors liste pour « ${label} ».`,
  tooLong: (label: string, max: number) => `« ${label} » dépasse ${max} caractères.`,
};

/** Une valeur absente et une chaîne vide (ou blanche) sont la même chose : rien. */
const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/**
 * Lit la valeur brute d'un champ selon son type. Une valeur qui n'est pas du bon type (objet, tableau,
 * nombre dans un champ texte…) est refusée : `String(value)` enregistrerait « [object Object] ».
 */
function parseValue(field: FieldDescriptor, raw: unknown): { value: string | null } | { error: string } {
  if (blank(raw)) return { value: null };
  if (typeof raw !== "string") return { error: MESSAGES.invalid(field.label) };
  return { value: raw.trim() };
}

/** Normalisation propre au champ (espaces d'un SIREN…), avant toute règle ; une valeur vidée par elle reste vide. */
function normalize(field: FieldDescriptor, value: string | null): string | null {
  if (value === null || !field.normalize) return value;
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
    values[field.key] = value;
  }
  return { values, errors };
}
