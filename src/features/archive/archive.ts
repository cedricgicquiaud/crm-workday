/**
 * Archivage et restauration d'une fiche (D21, contrat 30), commun à tout objet : tout membre
 * archive, et le geste est réversible. Une fiche archivée sort des listes, de la palette et des
 * rattachements proposés, et passe en lecture seule (`assertWritable` répond 409). Chaque geste
 * entre dans l'historique (`archivee`, `restauree`). Ce module ne connaît que la clé d'objet.
 */
import { eq, getTableColumns } from "drizzle-orm";
import { recordHistory, type HistoryAction } from "@/features/history/history";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Pose ou retire la date d'archivage, et historise le geste. L'état de la cible est vérifié avant
 * d'écrire : archiver une fiche déjà archivée, restaurer une fiche vivante, c'est un 409 — jamais
 * un 200 pour un geste qui n'a rien fait.
 */
async function setArchived(type: string, id: string, archivedAt: Date | null, action: HistoryAction, actor: Actor): Promise<ObjectRecord> {
  const record = await getObjectRecord(type, id);
  const { labels } = getObject(type);
  if (archivedAt && record.archivedAt) throw new HttpError(409, "deja_archivee", `${labels.singular} déjà archivée.`, { id });
  if (!archivedAt && !record.archivedAt) throw new HttpError(409, "non_archivee", `${labels.singular} n'est pas archivée.`, { id });
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const [row] = await db.update(table).set({ archivedAt, updatedAt: new Date() }).where(eq(columns.id, id)).returning();
  await recordHistory([{ objectType: type, objectId: id, action, authorId: actor.id }]);
  return row as ObjectRecord;
}

/** Archive une fiche (tout membre) : 404 inconnue, 409 déjà archivée. */
export const archiveRecord = (type: string, id: string, actor: Actor): Promise<ObjectRecord> => setArchived(type, id, new Date(), "archivee", actor);

/** Restaure une fiche archivée, telle qu'elle était : 404 inconnue, 409 si elle ne l'est pas. */
export const restoreRecord = (type: string, id: string, actor: Actor): Promise<ObjectRecord> => setArchived(type, id, null, "restauree", actor);
