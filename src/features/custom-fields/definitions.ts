/**
 * Définitions des champs personnalisés côté serveur (CRM-54) : un administrateur les pose par
 * objet, les modifie, les réordonne et les archive. Ce module ne connaît que la clé d'objet du
 * registre (D4) ; les descripteurs qu'en tirent les écrans vivent dans `fields-source.ts`.
 */
import "@/features/objects/manifest.server";
import { and, asc, eq, ne } from "drizzle-orm";
import { customFieldDefinition } from "@/db/schema";
import { setCustomFields, type CustomFieldDefinition, type CustomFieldType } from "@/features/custom-fields/fields-source";
import { parseDefinitionInput, parseLabel, parseValues } from "@/features/custom-fields/schema";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lit une définition ; un champ inconnu est une ressource inexistante (404), un identifiant mal formé aussi. */
export async function getDefinition(id: string): Promise<CustomFieldDefinition> {
  const notFound = new HttpError(404, "champ_introuvable", "Champ introuvable.");
  if (!UUID.test(id)) throw notFound;
  const [row] = await db.select().from(customFieldDefinition).where(eq(customFieldDefinition.id, id)).limit(1);
  if (!row) throw notFound;
  return toDefinition(row);
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

/**
 * Remplit la source de champs lue par `fieldsOf`, et rend les définitions pour que l'écran les
 * repose de son côté (`CustomFieldsSource`). Le serveur passe par ici à chaque rendu et à chaque
 * écriture : les définitions changent sans redéploiement, il n'y a rien à mettre en cache.
 */
export async function loadCustomFields(): Promise<CustomFieldDefinition[]> {
  const definitions = await listDefinitions();
  setCustomFields(definitions);
  return definitions;
}

/**
 * Ce que devient la liste de valeurs d'un champ quand l'administrateur en envoie une autre : les
 * valeurs qu'il n'a pas reprises sont retirées, pas effacées (les fiches qui les portent les lisent
 * encore) ; une valeur retirée qu'il remet revient dans les choix.
 */
function nextValues(current: CustomFieldDefinition, incoming: readonly string[]): { values: string[]; retiredValues: string[] } {
  const values = [...incoming];
  const retired = [...current.retiredValues, ...current.values].filter((value) => !values.includes(value));
  return { values, retiredValues: [...new Set(retired)] };
}

/** Champs d'un patch reçu, lus contre les règles du champ ; une propriété absente ne change rien. */
async function readPatch(current: CustomFieldDefinition, input: unknown): Promise<Partial<typeof customFieldDefinition.$inferInsert>> {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const patch: Partial<typeof customFieldDefinition.$inferInsert> = {};
  if (raw.label !== undefined) {
    patch.label = parseLabel(raw.label);
    await assertLabelFree(current.objectType, patch.label, current.id);
  }
  if (raw.required !== undefined) patch.required = raw.required === true;
  if (raw.values !== undefined && current.type === "list") Object.assign(patch, nextValues(current, parseValues(current.type, raw.values)));
  /* Archiver deux fois ne repousse pas la date : le champ est déjà archivé, rien ne change. */
  if (raw.archived !== undefined && raw.archived !== current.archived) patch.archivedAt = raw.archived === true ? new Date() : null;
  return patch;
}

/**
 * Modifie un champ défini : libellé, obligation, valeurs de la liste, archivage. Seules les
 * propriétés reçues changent. 400 hors règle, 404 champ inconnu, 409 libellé déjà pris (contrat 22).
 * Un champ ne se supprime pas — ce qui a été saisi resterait orphelin, et les vues qui le nomment
 * n'auraient plus rien à nommer.
 */
export async function updateDefinition(id: string, input: unknown): Promise<CustomFieldDefinition> {
  const current = await getDefinition(id);
  const patch = await readPatch(current, input);
  if (Object.keys(patch).length === 0) return current;
  const [row] = await db
    .update(customFieldDefinition)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(customFieldDefinition.id, id))
    .returning();
  return toDefinition(row);
}

/**
 * Archive un champ (contrat 19) : sa valeur reste lisible sur les fiches qui en portent une, il ne
 * se saisit plus et sort des filtres.
 */
export const archiveDefinition = (id: string): Promise<CustomFieldDefinition> => updateDefinition(id, { archived: true });

/**
 * Retire une valeur d'une liste : elle passe dans les valeurs retirées. Les fiches qui la portent la
 * lisent encore, marquée « retirée » ; personne ne peut la choisir de nouveau. Rien n'est effacé.
 */
export async function retireValue(id: string, value: string): Promise<CustomFieldDefinition> {
  const current = await getDefinition(id);
  if (!current.values.includes(value)) throw new HttpError(404, "valeur_introuvable", `« ${value} » n'est pas une valeur de « ${current.label} ».`);
  return updateDefinition(id, { values: current.values.filter((entry) => entry !== value) });
}

/**
 * Monte ou descend un champ d'un rang dans son objet : les deux voisins échangent leur rang. Un
 * champ déjà en bout de liste ne bouge pas — ce n'est pas une erreur, il n'y a rien après lui.
 */
export async function moveDefinition(id: string, direction: "up" | "down"): Promise<CustomFieldDefinition> {
  const current = await getDefinition(id);
  const siblings = await listDefinitions(current.objectType);
  const index = siblings.findIndex((definition) => definition.id === id);
  const neighbour = siblings[index + (direction === "up" ? -1 : 1)];
  if (!neighbour) return current;
  await db.update(customFieldDefinition).set({ position: current.position, updatedAt: new Date() }).where(eq(customFieldDefinition.id, neighbour.id));
  const [row] = await db
    .update(customFieldDefinition)
    .set({ position: neighbour.position, updatedAt: new Date() })
    .where(eq(customFieldDefinition.id, id))
    .returning();
  return toDefinition(row);
}
