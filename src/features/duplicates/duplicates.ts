/**
 * Doublons probables (D19, contrat 28), commun à tout objet : deux fiches se ressemblent quand leur
 * clé de rapprochement — celle que l'objet déclare dans le registre serveur (`duplicateKey`) — est
 * la même. Le signal n'est jamais un refus : il nomme la fiche existante, la création reste ouverte.
 * Ce module ne connaît que la clé d'objet (D4). Une fiche archivée n'entre dans aucun rapprochement :
 * elle est rangée, et la fusion la refuse de toute façon (D21).
 */
import "@/features/objects/manifest.server";
import { getTableColumns, isNull } from "drizzle-orm";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord } from "@/features/objects/service";
import { db } from "@/lib/db";

/** Une fiche existante que le signal nomme. */
export type Duplicate = { id: string; title: string };

/**
 * Fiches actives de même clé, la fiche exceptée. La clé se calcule en TypeScript (accents,
 * ponctuation, formes juridiques) : elle ne s'écrit pas en SQL, les fiches actives de l'objet sont
 * donc relues et comparées ici. Aucune clé (fiche sans nom) ne ressemble à personne.
 */
async function matching(type: string, key: string | null, exceptId: string | null): Promise<Duplicate[]> {
  if (!key) return [];
  const definition = getObject(type);
  const { table, duplicateKey } = getServerObject(type);
  const columns = getTableColumns(table);
  const rows = (await db.select().from(table).where(isNull(columns.archivedAt))) as Record<string, unknown>[];
  return rows
    .filter((row) => String(row.id) !== exceptId && duplicateKey(row) === key)
    .map((row) => ({ id: String(row.id), title: String(row[definition.titleField] ?? "") }));
}

/** Doublons probables d'une fiche existante (bannière, D5) : 404 si la fiche est inconnue. */
export async function duplicatesOfRecord(type: string, id: string): Promise<Duplicate[]> {
  const record = await getObjectRecord(type, id);
  if (record.archivedAt) return [];
  return matching(type, getServerObject(type).duplicateKey(record), record.id);
}

/** Doublons probables d'une fiche à créer, d'après les valeurs saisies (avertissement du dialogue). */
export function duplicatesOfValues(type: string, values: Record<string, unknown>): Promise<Duplicate[]> {
  return matching(type, getServerObject(type).duplicateKey(values), null);
}
