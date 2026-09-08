/**
 * Archivage d'une fiche (D21, contrat 30), commun à tout objet : tout membre archive, et le geste
 * est réversible. Une fiche archivée sort des listes, de la palette et des rattachements proposés,
 * et passe en lecture seule (`assertWritable` répond 409). Le geste entre dans l'historique
 * (`archivee`). Ce module ne connaît que la clé d'objet.
 */
import { eq, getTableColumns } from "drizzle-orm";
import { recordHistory } from "@/features/history/history";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Archive une fiche (tout membre) : 404 inconnue, 409 déjà archivée. L'état de la cible est vérifié
 * avant d'écrire — jamais un 200 pour un geste qui n'a rien fait.
 */
export async function archiveRecord(type: string, id: string, actor: Actor): Promise<ObjectRecord> {
  const record = await getObjectRecord(type, id);
  if (record.archivedAt) throw new HttpError(409, "deja_archivee", `${getObject(type).labels.singular} déjà archivée.`, { id });
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const [row] = await db.update(table).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(columns.id, id)).returning();
  await recordHistory([{ objectType: type, objectId: id, action: "archivee", authorId: actor.id }]);
  return row as ObjectRecord;
}
