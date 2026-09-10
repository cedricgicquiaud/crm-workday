/**
 * Règles d'une définition de champ personnalisé (CRM-54), seule source appliquée par l'API comme
 * par l'écran des Paramètres : libellé, type, valeurs d'une liste, obligation. Un refus porte le
 * champ fautif, pour que l'écran l'affiche sous lui plutôt qu'en encadré global.
 */
import { z } from "zod";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/features/custom-fields/fields-source";
import { listObjects } from "@/features/objects/registry";
import { HttpError } from "@/lib/auth/session";

/** Un libellé de champ tient sur une ligne de fiche et de menu de colonnes. */
export const CUSTOM_FIELD_LABEL_MAX = 120;

export type DefinitionInput = { objectType: string; label: string; type: CustomFieldType; values: string[]; required: boolean };

/** 400 dont le message est celui du champ fautif, rendu aussi par champ pour l'écran. */
export function invalidDefinition(field: string, message: string): never {
  throw new HttpError(400, "donnees_invalides", message, { fields: { [field]: message } });
}

const asRecord = (input: unknown): Record<string, unknown> => (typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {});

/** Un champ personnalisé se pose toujours sur un objet déclaré au registre (D4). */
function parseObjectType(value: unknown): string {
  const parsed = z.string().trim().min(1).safeParse(value);
  if (!parsed.success || !listObjects().some((object) => object.key === parsed.data)) invalidDefinition("objectType", "Un champ personnalisé se pose sur un objet de ce CRM.");
  return parsed.data as string;
}

/** Libellé : obligatoire, 120 caractères au plus, espaces de bordure retirés. */
export function parseLabel(value: unknown): string {
  const parsed = z.string().trim().min(1).max(CUSTOM_FIELD_LABEL_MAX).safeParse(value);
  if (parsed.success) return parsed.data;
  const tooLong = typeof value === "string" && value.trim().length > CUSTOM_FIELD_LABEL_MAX;
  return invalidDefinition("label", tooLong ? `Le libellé d'un champ tient en ${CUSTOM_FIELD_LABEL_MAX} caractères.` : "Le libellé du champ est obligatoire.");
}

function parseType(value: unknown): CustomFieldType {
  const parsed = z.enum(CUSTOM_FIELD_TYPES).safeParse(value);
  return parsed.success ? parsed.data : invalidDefinition("type", "Le type d'un champ est « texte », « liste », « date » ou « nombre ».");
}

/**
 * Valeurs d'une liste : au moins une, aucune vide, aucune en double — deux valeurs identiques
 * seraient indiscernables dans le sélecteur de la fiche. Un champ d'un autre type n'en a aucune.
 */
export function parseValues(type: CustomFieldType, value: unknown): string[] {
  if (type !== "list") return [];
  const parsed = z.array(z.string()).safeParse(value ?? []);
  if (!parsed.success) invalidDefinition("values", "Les valeurs d'une liste sont attendues une par ligne.");
  const values = (parsed.data as string[]).map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (values.length === 0) invalidDefinition("values", "Une liste à choix a au moins une valeur.");
  if (new Set(values).size !== values.length) invalidDefinition("values", "Deux valeurs identiques ne se distingueraient pas dans la liste.");
  return values;
}

/** Lit une définition reçue, ou refuse en nommant le champ fautif (400). */
export function parseDefinitionInput(input: unknown): DefinitionInput {
  const raw = asRecord(input);
  const type = parseType(raw.type);
  return { objectType: parseObjectType(raw.objectType), label: parseLabel(raw.label), type, values: parseValues(type, raw.values), required: raw.required === true };
}
