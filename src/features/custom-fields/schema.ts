/**
 * Règles d'une définition de champ personnalisé (CRM-54), seule source appliquée par l'API comme
 * par l'écran des Paramètres : libellé, type, valeurs d'une liste, obligation.
 */
import { z } from "zod";
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from "@/features/custom-fields/fields-source";

/** Un libellé de champ tient sur une ligne de fiche et de menu de colonnes. */
export const CUSTOM_FIELD_LABEL_MAX = 120;

export type DefinitionInput = { objectType: string; label: string; type: CustomFieldType; values: string[]; required: boolean };

const inputSchema = z.object({
  objectType: z.string().trim().min(1),
  label: z.string().trim().min(1).max(CUSTOM_FIELD_LABEL_MAX),
  type: z.enum(CUSTOM_FIELD_TYPES),
  values: z.array(z.string().trim().min(1)).default([]),
  required: z.boolean().default(false),
});

/** Lit une définition reçue ; les refus détaillés arrivent avec leurs propres règles. */
export function parseDefinitionInput(input: unknown): DefinitionInput {
  return inputSchema.parse(input);
}
