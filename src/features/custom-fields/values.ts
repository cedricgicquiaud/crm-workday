/**
 * Valeurs des champs personnalisés (CRM-55) : une ligne par champ et par fiche, quelle que soit la
 * table de la fiche. Le service générique des objets écrit et relit par ici ; à partir de là, une
 * valeur personnalisée se lit sur la fiche comme une colonne de sa table (`record[clé du champ]`).
 * Ce module ne connaît que la clé d'objet du registre (D4).
 */
import { and, eq, inArray } from "drizzle-orm";
import { customFieldValue } from "@/db/schema";
import { CUSTOM_FIELD_PREFIX, customFieldKey, customFieldsOf, isCustomFieldKey } from "@/features/custom-fields/fields-source";
import { db, type Executor } from "@/lib/db";

/** Fiche telle que le service la lit : ses colonnes, plus les clés des champs personnalisés. */
type RecordWithId = { id: string } & Record<string, unknown>;

/** Identifiant de définition porté par une clé de champ personnalisé (`cf_<uuid>`). */
const definitionIdOf = (key: string): string => key.slice(CUSTOM_FIELD_PREFIX.length);

/** Sépare les valeurs des colonnes de la fiche de celles des champs personnalisés. */
export function splitCustomValues<T>(values: Record<string, T>): { base: Record<string, T>; custom: Record<string, T> } {
  const base: Record<string, T> = {};
  const custom: Record<string, T> = {};
  for (const [key, value] of Object.entries(values)) (isCustomFieldKey(key) ? custom : base)[key] = value;
  return { base, custom };
}

/** Valeurs personnalisées de plusieurs fiches, par identifiant de fiche puis par clé de champ. */
async function readValues(objectType: string, ids: readonly string[]): Promise<Map<string, Record<string, string>>> {
  const byRecord = new Map<string, Record<string, string>>();
  if (ids.length === 0) return byRecord;
  const rows = await db
    .select({ definitionId: customFieldValue.definitionId, objectId: customFieldValue.objectId, value: customFieldValue.value })
    .from(customFieldValue)
    .where(and(eq(customFieldValue.objectType, objectType), inArray(customFieldValue.objectId, [...ids])));
  for (const row of rows) byRecord.set(row.objectId, { ...byRecord.get(row.objectId), [customFieldKey(row.definitionId)]: row.value });
  return byRecord;
}

/**
 * Fiches complétées de leurs valeurs personnalisées. Un champ actif sans valeur vaut `null`, comme
 * une colonne vide : la fiche, la liste et les filtres traitent les deux de la même façon. Les
 * valeurs d'un champ archivé sont rendues elles aussi — elles restent lisibles (contrat 19).
 */
export async function attachCustomValues<T extends RecordWithId>(objectType: string, records: readonly T[]): Promise<T[]> {
  const empty = Object.fromEntries(customFieldsOf(objectType).map((field) => [field.key, null]));
  if (records.length === 0) return [];
  const byRecord = await readValues(objectType, records.map((record) => record.id));
  return records.map((record) => ({ ...record, ...empty, ...byRecord.get(record.id) }));
}

/**
 * Écrit les valeurs personnalisées d'une fiche : une valeur vidée efface sa ligne, les autres
 * remplacent celle du champ (une seule par champ et par fiche). Les valeurs sont déjà sérialisées
 * par les descripteurs (jour ISO, décimal canonique), comme celles de l'historique.
 */
export async function writeCustomValues(objectType: string, objectId: string, values: Record<string, string | null>, exec: Executor = db): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const definitionId = definitionIdOf(key);
    if (value === null) {
      await exec.delete(customFieldValue).where(and(eq(customFieldValue.definitionId, definitionId), eq(customFieldValue.objectId, objectId)));
      continue;
    }
    await exec
      .insert(customFieldValue)
      .values({ definitionId, objectType, objectId, value })
      .onConflictDoUpdate({ target: [customFieldValue.definitionId, customFieldValue.objectId], set: { value, updatedAt: new Date() } });
  }
}
