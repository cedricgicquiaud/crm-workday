/**
 * Service générique des objets (D4) : création et modification de toute fiche déclarée dans le
 * registre. Validation par les descripteurs de champs, colonnes de base, une entrée d'historique
 * par champ modifié (D12), refus d'une fiche archivée (D21). Il ne connaît que la clé d'objet.
 * Un champ personnalisé (2.4) traverse tout cela comme un champ déclaré : seules l'écriture et la
 * lecture de sa valeur passent par une autre table.
 */
import "@/features/objects/manifest.server";
import { and, asc, desc, eq, getTableColumns, inArray, isNull, ne, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { allCustomFieldsOf, isCustomFieldKey } from "@/features/custom-fields/fields-source";
import { attachCustomValues, splitCustomValues, writeCustomValues } from "@/features/custom-fields/values";
import { recordHistory } from "@/features/history/history";
import { fieldsOf, isLocked, serializeValue, validateValues, writableFieldsOf, type FieldValues } from "@/features/objects/fields";
import { linkedLabelKey, userName, type SerializedRecord, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor, type ObjectDefinition, type ObjectLabels, type Relation } from "@/features/objects/registry";
import { getServerObject, type RelationScope } from "@/features/objects/registry.server";
import { objectRedirect, user } from "@/db/schema";
import { HttpError } from "@/lib/auth/session";
import { db, type Executor } from "@/lib/db";

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
  for (const field of writableFieldsOf(type)) {
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
  for (const field of writableFieldsOf(type)) {
    const value = values[field.key];
    if (field.type !== "user" || typeof value !== "string") continue;
    const [found] = await db.select({ id: user.id }).from(user).where(eq(user.id, value)).limit(1);
    if (!found) errors[field.key] = `« ${field.label} » ne désigne aucun utilisateur.`;
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);
}

/**
 * Un champ personnalisé archivé ne se saisit plus (contrat 19) : une clé `cf_` qui en désigne un est
 * refusée (409), champ par champ, pour que la fiche l'affiche sous le champ. `validateValues` ignore
 * les clés qu'aucun descripteur ne porte — sans ce refus, l'écriture répondrait 200 sans rien écrire.
 */
function assertNotArchived(type: string, input: unknown): void {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const writable = new Set(fieldsOf(type).map((field) => field.key));
  const archived = allCustomFieldsOf(type).filter((field) => !writable.has(field.key) && field.key in raw);
  if (archived.length === 0) return;
  const errors = Object.fromEntries(archived.map((field) => [field.key, `« ${field.label} » est un champ archivé : il ne se saisit plus.`]));
  throw new HttpError(409, "champ_archive", Object.values(errors)[0], { fields: errors });
}

/**
 * Un champ qui appartient à un profil de la fiche ne se règle pas par l'API de l'objet (D19) : le
 * refus le dit champ par champ et nomme le profil où il se règle. Sans lui, la clé serait validée
 * comme une colonne de la table — qu'elle n'est pas — ou ignorée en silence.
 */
function assertNotProfileField(type: string, input: unknown): void {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const claimed = fieldsOf(type).filter((field) => field.profile !== undefined && field.key in raw);
  if (claimed.length === 0) return;
  const errors = Object.fromEntries(claimed.map((field) => [field.key, `« ${field.label} » se règle sur le ${field.profile!.label}.`]));
  throw new HttpError(400, "champ_de_profil", Object.values(errors)[0], { fields: errors });
}

/**
 * `customRequired: false` : un champ personnalisé obligatoire n'est pas exigé. Une écriture qui ne
 * vient pas d'une saisie de la fiche (une fiche créée par le geste d'un autre objet) ne peut pas le
 * connaître ; il reste vide jusqu'à ce qu'on le renseigne sur la fiche.
 */
type ValidationOptions = { partial: boolean; customRequired?: boolean; current?: ObjectRecord | null };

async function validateOrThrow(type: string, input: unknown, { partial, customRequired = true, current = null }: ValidationOptions): Promise<FieldValues> {
  assertNotArchived(type, input);
  assertNotProfileField(type, input);
  const fields = writableFieldsOf(type).map((field) => (!customRequired && isCustomFieldKey(field.key) ? { ...field, required: false } : field));
  const { values, errors } = validateValues(fields, input, { partial });
  if (Object.keys(errors).length > 0) throw invalid(errors);
  await assertUsersExist(type, values);
  return resolveRelations(type, values, current);
}

/** « « Entreprise » ne désigne aucune entreprise. » : le déterminant suit l'article déclaré de l'objet lié. */
const unknownRecordRule = (field: FieldDescriptor, labels: ObjectLabels) => `« ${field.label} » ne désigne ${labels.article === "une" ? "aucune" : "aucun"} ${labels.singular.toLowerCase()}.`;

/** « Entreprise archivée : « Banque X » ne se choisit plus. » : l'accord suit l'article déclaré de l'objet lié. */
const archivedRecordRule = (target: ObjectDefinition, title: string) => `${target.labels.singular} ${target.labels.article === "une" ? "archivée" : "archivé"} : « ${title} » ne se choisit plus.`;

/** La relation qu'un objet déclare sur un champ `relation` : c'est elle qui dit de quel objet est la fiche liée. */
const relationOf = (type: string, key: string): Relation => getObject(type).relations.find((relation) => relation.fkColumn === key)!;

/**
 * Un champ `relation` désigne une fiche qui existe (D60) : un identifiant inconnu ou mal formé répond
 * 400 sous le champ, avant que la clé étrangère ne le refuse en base. Une fiche absorbée par une fusion
 * est remplacée par la fiche conservée : c'est elle qu'on enregistre, l'absorbée n'existe plus. Une
 * fiche archivée ne se choisit plus (409, D36) ; le lien que la fiche `current` porte déjà reste, lui.
 */
async function resolveRelations(type: string, values: FieldValues, current: ObjectRecord | null): Promise<FieldValues> {
  const resolved = { ...values };
  const errors: Record<string, string> = {};
  const archived: Record<string, string> = {};
  for (const field of writableFieldsOf(type)) {
    const value = values[field.key];
    if (field.type !== "relation" || typeof value !== "string") continue;
    const { to } = relationOf(type, field.key);
    const { table } = getServerObject(to);
    const row = UUID.test(value) ? ((await rowById(table, value)) ?? (await keptRow(to, table, value).catch(() => null))) : null;
    const target = getObject(to);
    if (!row) {
      errors[field.key] = unknownRecordRule(field, target.labels);
      continue;
    }
    resolved[field.key] = String(row.id);
    if (row.archivedAt != null && current?.[field.key] !== row.id) archived[field.key] = archivedRecordRule(target, String(row[target.titleField] ?? ""));
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);
  if (Object.keys(archived).length > 0) throw new HttpError(409, "fiche_liee_archivee", Object.values(archived)[0], { fields: archived });
  await assertInScope(type, resolved, current);
  return resolved;
}

/**
 * Une fiche liée choisie remplit la condition que l'objet déclare sur son champ (D35), évaluée avec la
 * valeur enregistrée après l'écriture : une écriture qui change aussi le champ dont elle dépend est
 * jugée sur la nouvelle valeur. Un lien que l'écriture ne change pas n'est pas rejugé.
 */
async function assertInScope(type: string, values: FieldValues, current: ObjectRecord | null): Promise<void> {
  const errors: Record<string, string> = {};
  for (const scope of getServerObject(type).relationScopes ?? []) {
    const chosen = values[scope.field];
    const basis = scope.dependsOn in values ? values[scope.dependsOn] : current?.[scope.dependsOn];
    if (typeof chosen !== "string" || (chosen === current?.[scope.field] && !(scope.dependsOn in values))) continue;
    const { table } = getServerObject(relationOf(type, scope.field).to);
    const columns = getTableColumns(table);
    const [found] = typeof basis === "string" ? await db.select({ id: columns.id }).from(table).where(and(eq(columns.id, chosen), eq(columns[scope.matches], basis), scope.where)).limit(1) : [];
    if (!found) errors[scope.field] = scope.refusal;
  }
  if (Object.keys(errors).length > 0) throw invalid(errors);
}

/**
 * Une valeur déclarée `unique` déjà portée par une autre fiche, archivée comprise, est refusée (409, D19) ;
 * le message nomme la fiche existante et dit si elle est archivée.
 */
async function assertUnique(type: string, values: FieldValues, currentId: string | null): Promise<void> {
  const definition = getObject(type);
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  for (const field of writableFieldsOf(type)) {
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

/**
 * Crée une fiche. `exec` reçoit la transaction en cours quand cette création n'a de sens qu'avec une
 * autre écriture (une fiche et son profil, D12) : les deux aboutissent, ou aucune. `customRequired`
 * à faux dispense des champs personnalisés obligatoires une fiche créée par un geste (D16).
 */
export async function createObject(type: string, input: unknown, actor: Actor, exec: Executor = db, { customRequired = true }: { customRequired?: boolean } = {}): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  await loadCustomFields();
  const values = withDefaults(type, await validateOrThrow(type, input, { partial: false, customRequired }), actor);
  await assertUnique(type, values, null);
  const { base, custom } = splitCustomValues(values);
  const { columns, sets } = splitSets(type, base);
  const [row] = await exec
    .insert(table)
    .values({ ...columns, createdBy: actor.id })
    .returning();
  const record = row as ObjectRecord;
  await writeSets(type, record.id, sets, exec);
  await writeCustomValues(type, record.id, serializeAll(type, custom), exec);
  await recordHistory([{ objectType: type, objectId: record.id, action: "creee", authorId: actor.id }], exec);
  /* Dans une transaction, la fiche n'est pas encore visible des lectures complémentaires : l'appelant la relira une fois l'ensemble écrit. */
  return exec === db ? withCustomValues(type, record) : record;
}

/** Sépare les valeurs qui vont dans la table de la fiche de celles des ensembles rangés dans une table fille (`sets`). */
function splitSets(type: string, values: FieldValues): { columns: FieldValues; sets: FieldValues } {
  const keys = new Set((getServerObject(type).sets ?? []).map((set) => set.field));
  const entries = Object.entries(values);
  return { columns: Object.fromEntries(entries.filter(([key]) => !keys.has(key))), sets: Object.fromEntries(entries.filter(([key]) => keys.has(key))) };
}

/** Remplace, pour chaque ensemble reçu, les lignes de sa table fille par ses valeurs : une ligne par valeur. */
async function writeSets(type: string, id: string, values: FieldValues, exec: Executor): Promise<void> {
  for (const set of getServerObject(type).sets ?? []) {
    const entries = values[set.field];
    if (!Array.isArray(entries)) continue;
    const columns = getTableColumns(set.table);
    await exec.delete(set.table).where(eq(columns[set.fkColumn], id));
    if (entries.length > 0) await exec.insert(set.table).values(entries.map((entry) => ({ [set.fkColumn]: id, [set.valueColumn]: entry })));
  }
}

/**
 * Les valeurs d'un ensemble rangé dans une table fille, dans l'ordre de la liste du champ ; une valeur
 * qu'elle ne porte plus (retirée) vient après, pour rester lisible. La lecture et l'écriture rangent
 * pareil : un même ensemble reçu dans un autre ordre n'est pas un changement.
 */
function inListOrder(type: string, key: string, entries: readonly string[]): string[] {
  const listed = (fieldsOf(type).find((field) => field.key === key)?.values ?? []).map((entry) => entry.value);
  const rank = (value: string) => (listed.includes(value) ? listed.indexOf(value) : listed.length);
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

/** Les ensembles reçus rangés dans l'ordre de leur liste ; les autres valeurs telles quelles. */
function withSetsInListOrder(type: string, values: FieldValues): FieldValues {
  const keys = new Set((getServerObject(type).sets ?? []).map((set) => set.field));
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, keys.has(key) && Array.isArray(value) ? inListOrder(type, key, value) : value]));
}

/** Les ensembles rangés dans une table fille, joints aux fiches : une requête par ensemble pour toutes les fiches. */
async function attachSets(type: string, records: ObjectRecord[]): Promise<ObjectRecord[]> {
  const sets = getServerObject(type).sets ?? [];
  if (sets.length === 0 || records.length === 0) return records;
  const ids = records.map((record) => record.id);
  const held = new Map<string, Record<string, string[]>>(ids.map((id) => [id, Object.fromEntries(sets.map((set) => [set.field, []]))]));
  for (const set of sets) {
    const columns = getTableColumns(set.table);
    const rows = await db
      .select({ owner: columns[set.fkColumn], value: columns[set.valueColumn] })
      .from(set.table)
      .where(inArray(columns[set.fkColumn], ids));
    for (const row of rows) held.get(String(row.owner))![set.field].push(String(row.value));
    for (const entry of held.values()) entry[set.field] = inListOrder(type, set.field, entry[set.field]);
  }
  return records.map((record) => ({ ...record, ...held.get(record.id) }));
}

/** Valeurs personnalisées sous leur forme enregistrée (jour ISO, décimal canonique), comme l'historique les lit. */
function serializeAll(type: string, values: FieldValues): Record<string, string | null> {
  const fields = fieldsOf(type);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, serializeValue(fields.find((field) => field.key === key)!, value)]));
}

/** Titres des fiches liées d'un champ `relation`, par identifiant : une requête pour toutes les fiches. */
async function linkedTitles(type: string, key: string, records: readonly ObjectRecord[]): Promise<Map<string, string>> {
  const ids = [...new Set(records.map((record) => record[key]).filter((id): id is string => typeof id === "string"))];
  if (ids.length === 0) return new Map();
  const target = getObject(relationOf(type, key).to);
  const { table } = getServerObject(target.key);
  const columns = getTableColumns(table);
  const rows = await db.select({ id: columns.id, title: columns[target.titleField] }).from(table).where(inArray(columns.id, ids));
  return new Map(rows.map((row) => [String(row.id), String(row.title ?? "")]));
}

/**
 * Fiches dont le lien sous condition la remplit encore (D35), par identifiant de fiche : le contact parti
 * de l'entreprise de l'opportunité n'y est plus. Une requête par condition, pour toutes les fiches.
 */
async function linksInScope(type: string, scope: RelationScope, records: readonly ObjectRecord[]): Promise<Set<string>> {
  const ids = [...new Set(records.map((record) => record[scope.field]).filter((id): id is string => typeof id === "string"))];
  if (ids.length === 0) return new Set();
  const { table } = getServerObject(relationOf(type, scope.field).to);
  const columns = getTableColumns(table);
  const rows = await db.select({ id: columns.id, basis: columns[scope.matches] }).from(table).where(and(inArray(columns.id, ids), scope.where));
  const valid = new Set(rows.map((row) => `${String(row.id)}:${String(row.basis)}`));
  return new Set(records.filter((record) => valid.has(`${String(record[scope.field])}:${String(record[scope.dependsOn])}`)).map((record) => record.id));
}

/** Ce qu'on lit de chaque fiche liée (D60) : son titre, marqué quand le lien ne remplit plus sa condition. */
async function attachLinkedLabels(type: string, records: ObjectRecord[]): Promise<ObjectRecord[]> {
  const relationFields = fieldsOf(type).filter((field) => field.type === "relation");
  if (relationFields.length === 0 || records.length === 0) return records;
  const titles = new Map(await Promise.all(relationFields.map(async (field) => [field.key, await linkedTitles(type, field.key, records)] as const)));
  const scopes = getServerObject(type).relationScopes ?? [];
  const inScope = new Map(await Promise.all(scopes.map(async (scope) => [scope.field, await linksInScope(type, scope, records)] as const)));
  return records.map((record) => {
    const labels = relationFields.map((field) => {
      const title = titles.get(field.key)!.get(String(record[field.key]));
      if (title === undefined) return [linkedLabelKey(field.key), null];
      const scope = scopes.find((candidate) => candidate.field === field.key);
      const outside = scope && !inScope.get(field.key)!.has(record.id) ? scope.outsideMark(titles.get(scope.dependsOn)?.get(String(record[scope.dependsOn])) ?? "") : null;
      return [linkedLabelKey(field.key), outside ? `${title} (${outside})` : title];
    });
    return { ...record, ...Object.fromEntries(labels) };
  });
}

/**
 * Des fiches complétées : leurs valeurs personnalisées, puis les compléments que l'objet déclare
 * (`attach`). À partir d'ici, tout se lit comme une colonne de la fiche — la liste, les filtres, le
 * tri et l'historique ne distinguent pas ce qui vient de la table de ce qui vient d'ailleurs.
 */
async function completed(type: string, records: ObjectRecord[]): Promise<ObjectRecord[]> {
  const withValues = await attachLinkedLabels(type, await attachSets(type, await attachCustomValues(type, records)));
  const attach = getServerObject(type).attach;
  return attach ? attach(withValues) : withValues;
}

/** Une fiche complétée : à partir d'ici, ses valeurs personnalisées et ses compléments se lisent comme ses colonnes. */
async function withCustomValues(type: string, record: ObjectRecord): Promise<ObjectRecord> {
  const [record_] = await completed(type, [record]);
  return record_;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (type: string) => new HttpError(404, "fiche_introuvable", `${getObject(type).labels.singular} introuvable.`);

/**
 * Fiche conservée à la place d'une fiche absorbée par une fusion (2.6a), ou `null` quand la fiche
 * n'a été absorbée par personne. La table garde une ligne par fusion, et une fusion de suite
 * re-pointe les précédentes : une seule lecture suffit, la chaîne est déjà à plat.
 */
export async function redirectedId(type: string, id: string): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({ toId: objectRedirect.toId })
    .from(objectRedirect)
    .where(and(eq(objectRedirect.objectType, type), eq(objectRedirect.fromId, id)))
    .limit(1);
  return row?.toId ?? null;
}

/**
 * Lit une fiche ; une fiche inconnue est une ressource inexistante (404), et un identifiant qui
 * n'est pas un UUID aussi : Postgres n'est jamais interrogé avec. Une fiche absorbée par une fusion
 * rend la fiche conservée : une référence écrite avant la fusion ne tombe pas sur un 404.
 */
export async function getObjectRecord(type: string, id: string): Promise<ObjectRecord> {
  const { table } = getServerObject(type);
  if (!UUID.test(id)) throw notFound(type);
  const row = (await rowById(table, id)) ?? (await keptRow(type, table, id));
  await loadCustomFields();
  return withCustomValues(type, row as ObjectRecord);
}

/** Ligne d'une table par son identifiant, ou `null` : la lecture d'une fiche et le suivi d'une redirection la partagent. */
async function rowById(table: PgTable, id: string): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(table).where(eq(getTableColumns(table).id, id)).limit(1);
  return (row as Record<string, unknown> | undefined) ?? null;
}

/**
 * Fiche conservée à la place d'une fiche absorbée, en **un seul saut** : la fusion aplatit la chaîne
 * des redirections (elle re-pointe celles qui menaient à l'absorbée), donc un second saut ne pourrait
 * être qu'un cycle — le suivre ferait tourner la lecture sans fin. Sans fiche au bout, 404.
 */
async function keptRow(type: string, table: PgTable, id: string): Promise<Record<string, unknown>> {
  const kept = await redirectedId(type, id);
  const row = kept && kept !== id ? await rowById(table, kept) : null;
  if (!row) throw notFound(type);
  return row;
}

/** Une fiche archivée est en lecture seule : toute écriture répond 409 (D21). */
export function assertWritable(type: string, record: ObjectRecord): void {
  if (record.archivedAt) throw new HttpError(409, "fiche_archivee", `${getObject(type).labels.singular} archivée : elle ne se modifie plus.`, { id: record.id });
}

/** Une fiche que son objet déclare figée (D21, `frozen`) ne s'écrit plus champ par champ : 409, avant toute validation. Son fil, lui, reste ouvert. */
export function assertNotFrozen(type: string, record: ObjectRecord): void {
  const { frozen } = getObject(type);
  if (frozen?.test(record)) throw new HttpError(409, "fiche_figee", frozen.message, { id: record.id });
}

/**
 * Un champ que la fiche fige (D21, `lockedWhen`) ne s'écrit pas : 409 champ par champ, avant toute
 * validation — l'état de la fiche est le refus, pas la valeur reçue. Les autres champs passent.
 */
function assertUnlocked(type: string, record: ObjectRecord, input: unknown): void {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const locked = fieldsOf(type).filter((field) => field.key in raw && isLocked(field, record));
  if (locked.length === 0) return;
  const errors = Object.fromEntries(locked.map((field) => [field.key, field.lockedWhen!.message]));
  throw new HttpError(409, "champ_fige", Object.values(errors)[0], { fields: errors });
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
  await loadCustomFields();
  return completed(type, rows as ObjectRecord[]);
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
 * Ce que l'historique écrit d'une valeur (D12) : sa sérialisation, et pour une fiche liée son titre —
 * « Contact : Julie Martin → vide » se relit après que la personne a changé d'entreprise ou disparu.
 */
async function historyValue(type: string, field: FieldDescriptor, value: string | null): Promise<string | null> {
  if (field.type !== "relation" || value === null) return value;
  const target = getObject(relationOf(type, field.key).to);
  const row = await rowById(getServerObject(target.key).table, value);
  return row ? String(row[target.titleField] ?? "") : value;
}

/**
 * Une fiche liée choisie sous condition ne survit pas au changement du champ dont elle dépend (D35) :
 * l'écriture qui change l'entreprise vide le contact, sauf si elle en désigne un nouveau.
 */
function withScopesCleared(type: string, values: FieldValues, current: ObjectRecord): FieldValues {
  const cleared = { ...values };
  for (const scope of getServerObject(type).relationScopes ?? []) {
    const moved = scope.dependsOn in values && values[scope.dependsOn] !== current[scope.dependsOn];
    if (moved && !(scope.field in values) && current[scope.field] != null) cleared[scope.field] = null;
  }
  return cleared;
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
  assertNotFrozen(type, current);
  assertUnlocked(type, current, patch);
  const values = withScopesCleared(type, withSetsInListOrder(type, await validateOrThrow(type, patch, { partial: true, current })), current);
  await assertUnique(type, values, id);
  const changed = writableFieldsOf(type)
    .filter((field) => field.key in values)
    .map((field) => ({ field, oldValue: serializeValue(field, current[field.key]), newValue: serializeValue(field, values[field.key]) }))
    .filter((change) => change.oldValue !== change.newValue);
  if (changed.length === 0) return current;
  /*
   * Les colonnes de la fiche partent dans sa table, ses ensembles dans leur table fille ; les champs
   * personnalisés dans la leur, déjà sérialisés, comme l'historique les lit. Tout s'écrit ensemble ou rien.
   */
  const { columns: columnValues, sets: setValues } = splitSets(type, Object.fromEntries(changed.filter(({ field }) => !isCustomFieldKey(field.key)).map(({ field }) => [field.key, values[field.key]])));
  const customChanges = changed.filter(({ field }) => isCustomFieldKey(field.key));
  const historyLines = await Promise.all(changed.map(async ({ field, oldValue, newValue }) => ({ field: field.key, oldValue: await historyValue(type, field, oldValue), newValue: await historyValue(type, field, newValue) })));
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(table)
      .set({ ...columnValues, updatedAt: new Date() })
      .where(eq(columns.id, id))
      .returning();
    await writeSets(type, id, setValues, tx);
    await writeCustomValues(type, id, Object.fromEntries(customChanges.map(({ field, newValue }) => [field.key, newValue])), tx);
    await recordHistory(historyLines.map((line) => ({ objectType: type, objectId: id, action: "modifiee" as const, ...line, authorId: actor.id })), tx);
    return updated;
  });
  return withCustomValues(type, row as ObjectRecord);
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
