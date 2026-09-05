/**
 * Service générique des objets (D4) : création et modification de toute fiche déclarée dans le
 * registre. Validation par les descripteurs de champs, colonnes de base, une entrée d'historique
 * par champ modifié (D12), refus d'une fiche archivée (D21). Il ne connaît que la clé d'objet.
 */
import "@/features/objects/manifest.server";
import { and, eq, getTableColumns, ne, type SQL } from "drizzle-orm";
import { recordHistory } from "@/features/history/history";
import { validateValues, type FieldValues } from "@/features/objects/fields";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type Actor = { id: string };

/** Une fiche telle que lue en base : colonnes de base typées, champs de l'objet à côté. */
export type ObjectRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  ownerId: string;
  archivedAt: Date | null;
} & Record<string, unknown>;

/** Valeurs par défaut des champs absents à la création ; `"actor"` sur un champ utilisateur désigne l'acteur. */
function withDefaults(type: string, values: FieldValues, actor: Actor): FieldValues {
  const filled = { ...values };
  for (const field of getObject(type).fields) {
    if (filled[field.key] != null || field.default === undefined) continue;
    filled[field.key] = field.type === "user" && field.default === "actor" ? actor.id : field.default;
  }
  return filled;
}

function validateOrThrow(type: string, input: unknown, options: { partial: boolean }): FieldValues {
  const { values, errors } = validateValues(getObject(type).fields, input, options);
  if (Object.keys(errors).length > 0) throw new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });
  return values;
}

/**
 * Une valeur déclarée `unique` déjà portée par une autre fiche, archivée comprise, est refusée (409, D19) ;
 * le message nomme la fiche existante et dit si elle est archivée.
 */
async function assertUnique(type: string, values: FieldValues, currentId: string | null): Promise<void> {
  const definition = getObject(type);
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  for (const field of definition.fields) {
    const value = values[field.key];
    if (!field.unique || value == null) continue;
    const conditions: SQL[] = [eq(columns[field.key], value)];
    if (currentId) conditions.push(ne(columns.id, currentId));
    const [existing] = await db.select({ id: columns.id, name: columns[definition.titleField], archivedAt: columns.archivedAt }).from(table).where(and(...conditions)).limit(1);
    if (!existing) continue;
    const archived = existing.archivedAt != null;
    const start = field.uniqueMessage ? field.uniqueMessage(value) : `« ${field.label} » ${value} est déjà porté`;
    throw new HttpError(409, "valeur_deja_portee", `${start} par « ${String(existing.name)} »${archived ? " (fiche archivée)" : ""}.`, {
      field: field.key,
      existingId: existing.id,
      existingName: existing.name,
      archived,
    });
  }
}

export async function createObject(type: string, input: unknown, actor: Actor): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  const values = withDefaults(type, validateOrThrow(type, input, { partial: false }), actor);
  await assertUnique(type, values, null);
  const [row] = await db
    .insert(table)
    .values({ ...values, createdBy: actor.id })
    .returning();
  const record = row as ObjectRecord;
  await recordHistory([{ objectType: type, objectId: record.id, action: "creee", authorId: actor.id }]);
  return record;
}

/** Lit une fiche ; une fiche inconnue est une ressource inexistante (404). */
export async function getObjectRecord(type: string, id: string): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const [row] = await db.select().from(table).where(eq(columns.id, id)).limit(1);
  if (!row) throw new HttpError(404, "fiche_introuvable", `${getObject(type).labels.singular} introuvable.`);
  return row as ObjectRecord;
}

/** Une fiche archivée est en lecture seule : toute écriture répond 409 (D21). */
export function assertWritable(type: string, record: ObjectRecord): void {
  if (record.archivedAt) throw new HttpError(409, "fiche_archivee", `${getObject(type).labels.singular} archivée : elle ne se modifie plus.`, { id: record.id });
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? "");

export async function updateObject(type: string, id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const current = await getObjectRecord(type, id);
  assertWritable(type, current);
  const values = validateOrThrow(type, patch, { partial: true });
  await assertUnique(type, values, id);
  const changed = Object.entries(values).filter(([key, value]) => !same(current[key], value));
  if (changed.length === 0) return current;
  const [row] = await db
    .update(table)
    .set({ ...Object.fromEntries(changed), updatedAt: new Date() })
    .where(eq(columns.id, id))
    .returning();
  await recordHistory(
    changed.map(([field, value]) => ({ objectType: type, objectId: id, action: "modifiee" as const, field, oldValue: current[field] == null ? null : String(current[field]), newValue: value, authorId: actor.id })),
  );
  return row as ObjectRecord;
}
