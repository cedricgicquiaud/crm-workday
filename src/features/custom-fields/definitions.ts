/**
 * Définitions des champs personnalisés côté serveur (CRM-54) : un administrateur les pose par
 * objet, les modifie, les réordonne et les archive. Ce module ne connaît que la clé d'objet du
 * registre (D4) ; les descripteurs qu'en tirent les écrans vivent dans `fields-source.ts`.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { customFieldDefinition } from "@/db/schema";
import type { CustomFieldDefinition, CustomFieldType } from "@/features/custom-fields/fields-source";
import { parseDefinitionInput } from "@/features/custom-fields/schema";
import type { Actor } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
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

/**
 * Deux champs de même libellé sur le même objet seraient indiscernables sur la fiche et dans le
 * menu des colonnes (contrat 22) ; un champ archivé garde son libellé, il reste donc pris.
 */
async function assertLabelFree(objectType: string, label: string, currentId: string | null): Promise<void> {
  const conditions = [eq(customFieldDefinition.objectType, objectType), eq(customFieldDefinition.label, label)];
  if (currentId) conditions.push(ne(customFieldDefinition.id, currentId));
  const [existing] = await db.select({ id: customFieldDefinition.id }).from(customFieldDefinition).where(and(...conditions)).limit(1);
  if (existing) throw new HttpError(409, "libelle_deja_pris", `« ${label} » est déjà le libellé d'un champ de cet objet.`, { fields: { label: `« ${label} » est déjà le libellé d'un champ de cet objet.` } });
}

/** Définit un champ sur un objet ; le rang suit les champs déjà posés. 400 hors règle, 409 libellé déjà pris. */
export async function createDefinition(input: unknown, actor: Actor): Promise<CustomFieldDefinition> {
  const parsed = parseDefinitionInput(input);
  await assertLabelFree(parsed.objectType, parsed.label, null);
  const [row] = await db
    .insert(customFieldDefinition)
    .values({ ...parsed, position: await nextPosition(parsed.objectType), createdBy: actor.id })
    .returning();
  return toDefinition(row);
}
