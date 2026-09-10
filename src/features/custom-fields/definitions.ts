/**
 * Définitions des champs personnalisés côté serveur (CRM-54) : un administrateur les pose par
 * objet, les modifie, les réordonne et les archive. Ce module ne connaît que la clé d'objet du
 * registre (D4) ; les descripteurs qu'en tirent les écrans vivent dans `fields-source.ts`.
 */
import { asc, eq } from "drizzle-orm";
import { customFieldDefinition } from "@/db/schema";
import type { CustomFieldDefinition, CustomFieldType } from "@/features/custom-fields/fields-source";
import { parseDefinitionInput } from "@/features/custom-fields/schema";
import type { Actor } from "@/features/objects/service";
import { db } from "@/lib/db";

type DefinitionRow = typeof customFieldDefinition.$inferSelect;

/** Écart entre deux rangs à la création : il laisse la place d'en glisser un entre deux. */
const POSITION_STEP = 10;

/** Une définition telle que l'écran la lit : la date d'archivage devient un booléen. */
export function toDefinition(row: DefinitionRow): CustomFieldDefinition {
  return {
    id: row.id,
    objectType: row.objectType,
    label: row.label,
    type: row.type as CustomFieldType,
    values: row.values,
    retiredValues: row.retiredValues,
    required: row.required,
    position: row.position,
    archived: row.archivedAt != null,
  };
}

/** Toutes les définitions, ou celles d'un objet, par rang croissant puis par libellé. */
export async function listDefinitions(objectType?: string): Promise<CustomFieldDefinition[]> {
  const query = db.select().from(customFieldDefinition).$dynamic();
  const rows = await (objectType ? query.where(eq(customFieldDefinition.objectType, objectType)) : query).orderBy(asc(customFieldDefinition.position), asc(customFieldDefinition.label));
  return rows.map(toDefinition);
}

/** Rang du prochain champ d'un objet : après le dernier, place laissée pour en glisser un avant. */
async function nextPosition(objectType: string): Promise<number> {
  const existing = await listDefinitions(objectType);
  return existing.reduce((last, definition) => Math.max(last, definition.position), 0) + POSITION_STEP;
}

/** Définit un champ sur un objet ; le rang suit les champs déjà posés. */
export async function createDefinition(input: unknown, actor: Actor): Promise<CustomFieldDefinition> {
  const parsed = parseDefinitionInput(input);
  const [row] = await db
    .insert(customFieldDefinition)
    .values({ ...parsed, position: await nextPosition(parsed.objectType), createdBy: actor.id })
    .returning();
  return toDefinition(row);
}
