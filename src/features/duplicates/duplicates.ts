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

/**
 * Une fiche existante que le signal nomme. `href` et `message` viennent d'un avertissement de saisie
 * déclaré (D8) : la fiche peut être d'un autre objet, et la phrase est celle de la source.
 */
export type Duplicate = { id: string; title: string; href?: string; message?: string };

/** Valeur qui désigne la fiche en cours de saisie (sa propre fiche) : elle ne se rappelle pas elle-même. */
const RECORD_VALUE = "id";

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

/**
 * Ce que des valeurs saisies rappellent (avertissement du dialogue ou d'un champ de fiche) : les
 * doublons probables de la clé de l'objet, puis ce que dit sa source d'avertissement déclarée (D8).
 * `id` parmi les valeurs désigne la fiche qu'on modifie : elle n'est rappelée par aucune des deux.
 */
export async function duplicatesOfValues(type: string, values: Record<string, unknown>): Promise<Duplicate[]> {
  const { duplicateKey, entryWarnings } = getServerObject(type);
  const exceptId = typeof values[RECORD_VALUE] === "string" ? String(values[RECORD_VALUE]) : null;
  const [twins, warnings] = await Promise.all([matching(type, duplicateKey(values), exceptId), entryWarnings ? entryWarnings(values, exceptId) : Promise.resolve([])]);
  return [...twins, ...warnings];
}
