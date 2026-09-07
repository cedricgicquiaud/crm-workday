/**
 * Service générique des objets (D4) : création et modification de toute fiche déclarée dans le
 * registre. Validation par les descripteurs de champs, colonnes de base, une entrée d'historique
 * par champ modifié (D12), refus d'une fiche archivée (D21). Il ne connaît que la clé d'objet.
 */
import "@/features/objects/manifest.server";
import { and, asc, desc, eq, getTableColumns, isNull, ne, type SQL } from "drizzle-orm";
import { recordHistory } from "@/features/history/history";
import { serializeValue, validateValues, type FieldValues } from "@/features/objects/fields";
import { userName, type SerializedRecord, type UserOption } from "@/features/objects/labels";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { user } from "@/db/schema";
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

/** 400 dont le message est la première erreur, et toutes les erreurs par champ pour l'écran. */
const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

/** Un champ `user` doit désigner un utilisateur existant : la clé étrangère ne suffit pas, il faut un 400 rattaché au champ. */
async function assertUsersExist(type: string, values: FieldValues): Promise<void> {
  const errors: Record<string, string> = {};
  for (const field of getObject(type).fields) {
    const value = values[field.key];
    if (field.type !== "user" || typeof value !== "string") continue;
    const [found] = await db.select({ id: user.id }).from(user).where(eq(user.id, value)).limit(1);
    if (!found) errors[field.key] = `« ${field.label} » ne désigne aucun utilisateur.`;
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);
}

async function validateOrThrow(type: string, input: unknown, options: { partial: boolean }): Promise<FieldValues> {
  const { values, errors } = validateValues(getObject(type).fields, input, options);
  if (Object.keys(errors).length > 0) throw invalid(errors);
  await assertUsersExist(type, values);
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
    if (!field.unique || typeof value !== "string") continue;
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
  const values = withDefaults(type, await validateOrThrow(type, input, { partial: false }), actor);
  await assertUnique(type, values, null);
  const [row] = await db
    .insert(table)
    .values({ ...values, createdBy: actor.id })
    .returning();
  const record = row as ObjectRecord;
  await recordHistory([{ objectType: type, objectId: record.id, action: "creee", authorId: actor.id }]);
  return record;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (type: string) => new HttpError(404, "fiche_introuvable", `${getObject(type).labels.singular} introuvable.`);

/** Lit une fiche ; une fiche inconnue est une ressource inexistante (404), et un identifiant qui n'est pas un UUID aussi : Postgres n'est jamais interrogé avec. */
export async function getObjectRecord(type: string, id: string): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  if (!UUID.test(id)) throw notFound(type);
  const columns = getTableColumns(table);
  const [row] = await db.select().from(table).where(eq(columns.id, id)).limit(1);
  if (!row) throw notFound(type);
  return row as ObjectRecord;
}

/** Une fiche archivée est en lecture seule : toute écriture répond 409 (D21). */
export function assertWritable(type: string, record: ObjectRecord): void {
  if (record.archivedAt) throw new HttpError(409, "fiche_archivee", `${getObject(type).labels.singular} archivée : elle ne se modifie plus.`, { id: record.id });
}

/** Fiches non archivées, la dernière modifiée en tête (D6) ; `includeArchived` les rend toutes (filtre « archivées », 2.5a). */
export async function listObjectRecords(type: string, { includeArchived = false } = {}): Promise<ObjectRecord[]> {
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const rows = await db
    .select()
    .from(table)
    .where(includeArchived ? undefined : isNull(columns.archivedAt))
    .orderBy(desc(columns.updatedAt), desc(columns.id));
  return rows as ObjectRecord[];
}

/** Fiches proposées par un sélecteur, au plus : un sélecteur ne charge jamais toute la table (2.5a ajoutera la recherche). */
export const RECORD_OPTIONS_LIMIT = 200;

/**
 * Options d'un sélecteur de fiches (D7) : l'identifiant et le titre des fiches actives seulement, la
 * dernière modifiée en tête, bornées. Passer par `listObjectRecords` chargerait toutes les fiches avec
 * toutes leurs colonnes à chaque ouverture d'une fiche qui porte un sélecteur.
 */
export async function listRecordOptions(type: string, { limit = RECORD_OPTIONS_LIMIT } = {}): Promise<{ id: string; name: string }[]> {
  /* Le registre serveur d'abord : une clé inconnue est une ressource inexistante (404), pas une panne. */
  const { table } = getServerObject(type);
  const definition = getObject(type);
  const columns = getTableColumns(table);
  const rows = await db
    .select({ id: columns.id, title: columns[definition.titleField] })
    .from(table)
    .where(isNull(columns.archivedAt))
    .orderBy(desc(columns.updatedAt), desc(columns.id))
    .limit(limit);
  return rows.map((row) => ({ id: String(row.id), name: String(row.title ?? "") }));
}

/**
 * Un champ ne change que si sa sérialisation stable change (`serializeValue`) : une valeur absente et
 * une chaîne vide sont la même chose, « 99.00 » relu en base et 99 reçu aussi ; l'historique reçoit
 * ces mêmes sérialisations, lisibles quel que soit le type (D12).
 */
export async function updateObject(type: string, id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const current = await getObjectRecord(type, id);
  assertWritable(type, current);
  const values = await validateOrThrow(type, patch, { partial: true });
  await assertUnique(type, values, id);
  const changed = getObject(type)
    .fields.filter((field) => field.key in values)
    .map((field) => ({ field, oldValue: serializeValue(field, current[field.key]), newValue: serializeValue(field, values[field.key]) }))
    .filter((change) => change.oldValue !== change.newValue);
  if (changed.length === 0) return current;
  const [row] = await db
    .update(table)
    .set({ ...Object.fromEntries(changed.map(({ field }) => [field.key, values[field.key]])), updatedAt: new Date() })
    .where(eq(columns.id, id))
    .returning();
  await recordHistory(changed.map(({ field, oldValue, newValue }) => ({ objectType: type, objectId: id, action: "modifiee" as const, field: field.key, oldValue, newValue, authorId: actor.id })));
  return row as ObjectRecord;
}

/** Utilisateurs actifs ou invités, pour les champs « responsable » (les désactivés ne sont plus proposés). */
export async function listUserOptions(): Promise<UserOption[]> {
  const rows = await db.select({ id: user.id, firstName: user.firstName, lastName: user.lastName }).from(user).where(ne(user.status, "desactive")).orderBy(asc(user.lastName), asc(user.firstName));
  return rows.map((row) => ({ id: row.id, name: userName(row) }));
}

/** Fiche prête pour un composant client : les dates deviennent des chaînes ISO. */
export function serializeRecord(record: ObjectRecord): SerializedRecord {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as SerializedRecord;
}
