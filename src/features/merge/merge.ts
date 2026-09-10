/**
 * Fusion de deux fiches (D20, contrat 29), commune à tout objet : on garde l'une, l'autre est
 * absorbée. Tout ce qui désignait l'absorbée désigne ensuite la conservée — les fiches liées par une
 * relation déclarée (`fkColumn`), ses activités, son historique, ses valeurs de champs personnalisés
 * et les emails du journal qui la citent. Ce module ne connaît que la clé d'objet du registre (D4) :
 * ce qui est rattaché vient des déclarations, jamais d'un objet nommé ici.
 *
 * La fusion est irréversible : elle est donc annoncée par un comptage exact de ce qui sera déplacé,
 * et l'état des deux fiches est vérifié avant toute écriture — jamais un 200 pour un geste qui n'a
 * rien fait. Une fiche archivée est en lecture seule et n'entre dans aucune fusion (D21).
 */
import "@/features/objects/manifest.server";
import { and, count, eq, getTableColumns, or, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { activity, auditLog, customFieldValue, emailLog } from "@/db/schema";
import { deleteBlockers } from "@/features/archive/delete";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Une famille de ce qui sera déplacé : sa clé, ce qu'elle est pour un lecteur, et combien. */
export type MergeCount = { key: string; label: string; count: number };

/** Ce que la fusion fera, avant de la faire : les deux fiches et le compte exact par famille. */
export type MergePlan = { keptId: string; absorbedId: string; moved: MergeCount[] };

async function countWhere(table: PgTable, where: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return Number(row?.value ?? 0);
}

const entriesOf = (type: string, id: string) => and(eq(auditLog.objectType, type), eq(auditLog.objectId, id))!;
const valuesOf = (type: string, id: string) => and(eq(customFieldValue.objectType, type), eq(customFieldValue.objectId, id))!;

/**
 * Les deux fiches d'une fusion, vérifiées avant toute écriture : 400 si c'est la même, 404 si l'une
 * est inconnue, 409 si l'une est archivée. Les types différents sont refusés par la route, qui seule
 * connaît le type annoncé pour chacune.
 */
async function pairOf(type: string, keptId: string, absorbedId: string): Promise<{ kept: ObjectRecord; absorbed: ObjectRecord }> {
  if (keptId === absorbedId) throw new HttpError(400, "meme_fiche", `${getObject(type).labels.singular} ne se fusionne pas avec elle-même.`);
  const [kept, absorbed] = await Promise.all([getObjectRecord(type, keptId), getObjectRecord(type, absorbedId)]);
  for (const record of [kept, absorbed]) {
    if (record.archivedAt) throw new HttpError(409, "fiche_archivee", `${getObject(type).labels.singular} archivée : elle n'entre pas dans une fusion.`, { id: record.id });
  }
  return { kept, absorbed };
}

/**
 * Ce que porte une fiche, famille par famille, sans les familles vides. Les fiches liées, les
 * activités et les emails sont exactement ce qui retiendrait la fiche à la suppression : le compte
 * est le même, seul le sort de ces éléments change. L'historique et les valeurs de champs
 * personnalisés s'y ajoutent : la suppression les emporte, la fusion les déplace.
 */
async function attachments(type: string, id: string): Promise<MergeCount[]> {
  const [held, history, values] = await Promise.all([deleteBlockers(type, id), countWhere(auditLog, entriesOf(type, id)), countWhere(customFieldValue, valuesOf(type, id))]);
  return [...held, { key: "historique", label: "Historique", count: history }, { key: "valeurs", label: "Valeurs de champs personnalisés", count: values }].filter((family) => family.count > 0);
}

/** Ce que la fusion déplacera, annoncé au dialogue de confirmation avant qu'il n'écrive rien (contrat 29). */
export async function planMerge(type: string, keptId: string, absorbedId: string): Promise<MergePlan> {
  const { absorbed } = await pairOf(type, keptId, absorbedId);
  return { keptId, absorbedId, moved: await attachments(type, absorbed.id) };
}
