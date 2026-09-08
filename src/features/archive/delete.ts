/**
 * Suppression définitive d'une fiche (D21, contrat 31), commun à tout objet : réservée à un
 * administrateur (la route pose `requireAdmin`), et seulement quand plus rien ne retient la fiche.
 * Ce qui la retient vient des déclarations, jamais d'un objet nommé ici : les relations du registre
 * (les fiches qui la désignent), son fil (activités et emails du journal). Sinon 409, avec la liste.
 *
 * L'historique ne se supprime jamais, **sauf avec la fiche elle-même** (amendement de D12 validé le
 * 8 septembre 2026) : il n'est lisible que depuis sa fiche, et le contrat exige qu'elle n'apparaisse
 * plus nulle part. La fiche et ses entrées partent donc dans la même transaction.
 */
import { and, count, eq, getTableColumns, or, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { activity, auditLog, emailLog } from "@/db/schema";
import { getObject, listObjects } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Un lien qui retient une fiche : sa clé, ce qu'il est pour un lecteur, et combien de fois. */
export type DeleteBlocker = { key: string; label: string; count: number };

async function countWhere(table: PgTable, where: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return Number(row?.value ?? 0);
}

/** Fiches d'un autre objet qui désignent celle-ci par une relation déclarée, archivées comprises : archiver ne délie pas. */
async function relationBlockers(type: string, id: string): Promise<DeleteBlocker[]> {
  const pointing = listObjects()
    .filter((object) => object.key !== type)
    .flatMap((object) => object.relations.filter((relation) => relation.to === type).map((relation) => ({ object, relation })));
  const found = await Promise.all(
    pointing.map(async ({ object, relation }) => {
      const columns = getTableColumns(getServerObject(object.key).table);
      return { key: `${object.key}-${relation.fkColumn}`, label: relation.inverseLabel, count: await countWhere(getServerObject(object.key).table, eq(columns[relation.fkColumn], id)) };
    }),
  );
  return found;
}

/** Le fil de la fiche hors historique : ses activités (les siennes et celles qu'elle a reçues comme parente) et les emails du journal qui la citent. */
async function feedBlockers(type: string, id: string): Promise<DeleteBlocker[]> {
  const own = and(eq(activity.objectType, type), eq(activity.objectId, id));
  const asParent = and(eq(activity.parentType, type), eq(activity.parentId, id));
  return [
    { key: "activites", label: "Activités", count: await countWhere(activity, or(own, asParent)!) },
    { key: "emails", label: "Emails", count: await countWhere(emailLog, and(eq(emailLog.objectType, type), eq(emailLog.objectId, id))!) },
  ];
}

/** Tout ce qui retient une fiche, dans l'ordre déclaré ; vide quand elle se supprime. */
export async function deleteBlockers(type: string, id: string): Promise<DeleteBlocker[]> {
  const found = [...(await relationBlockers(type, id)), ...(await feedBlockers(type, id))];
  return found.filter((blocker) => blocker.count > 0);
}

/**
 * Supprime définitivement une fiche et son historique : 404 inconnue, 409 `fiche_liee` avec la liste
 * de ce qui la retient. L'état de la cible est vérifié avant d'écrire — jamais un 200 pour un geste
 * qui n'a rien fait.
 */
export async function deleteRecord(type: string, id: string): Promise<void> {
  await getObjectRecord(type, id);
  const blockers = await deleteBlockers(type, id);
  if (blockers.length > 0) {
    throw new HttpError(409, "fiche_liee", `${getObject(type).labels.singular} liée : elle ne se supprime pas tant que d'autres fiches ou entrées la retiennent.`, { blockers });
  }
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  await db.transaction(async (tx) => {
    await tx.delete(auditLog).where(and(eq(auditLog.objectType, type), eq(auditLog.objectId, id)));
    await tx.delete(table).where(eq(columns.id, id));
  });
}
