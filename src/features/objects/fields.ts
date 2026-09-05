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
  outOfList: (label: string) => `Valeur hors liste pour « ${label} ».`,
};

const asText = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

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
    const value = asText(raw[field.key]);
    if (value === null) {
      if (field.required && (present || field.default === undefined)) errors[field.key] = MESSAGES.required(field.label);
      else if (present) values[field.key] = null;
      continue;
    }
    if (field.type === "list" && !field.values?.some((v) => v.value === value)) {
      errors[field.key] = MESSAGES.outOfList(field.label);
      continue;
    }
    values[field.key] = value;
  }
  return { values, errors };
}
