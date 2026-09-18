/**
 * Suppression définitive d'une fiche (D21, contrat 31), commun à tout objet : réservée à un
 * administrateur (la route pose `requireAdmin`), et seulement quand plus rien ne retient la fiche.
 * Ce qui la retient vient des déclarations, jamais d'un objet nommé ici : les relations du registre
 * (les fiches qui la désignent), ses tables dépendantes déclarées `holds` (les lignes qui la relient à
 * une autre fiche), son fil (activités et emails du journal). Sinon 409, avec la liste.
 *
 * L'historique ne se supprime jamais, **sauf avec la fiche elle-même** (amendement de D12 validé le
 * 8 septembre 2026) : il n'est lisible que depuis sa fiche, et le contrat exige qu'elle n'apparaisse
 * plus nulle part. La fiche, ses entrées et ses valeurs de champs personnalisés partent donc dans la
 * même transaction.
 */
import { and, count, desc, eq, getTableColumns, getTableName, or, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { activity, auditLog, customFieldValue, emailLog } from "@/db/schema";
import { getObject, listObjects } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Un lien qui retient une fiche : sa clé, ce qu'il est pour un lecteur, combien de fois, et pour une relation les titres des fiches qui la retiennent (trois au plus, D27). */
export type DeleteBlocker = { key: string; label: string; count: number; titles?: string[] };

/** Titres nommés au plus par bloqueur : au-delà, le compte suffit (« et N autres »). */
export const BLOCKER_TITLES_LIMIT = 3;

async function countWhere(table: PgTable, where: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return Number(row?.value ?? 0);
}

/** Fiches qui désignent celle-ci par une relation déclarée, du même objet compris, archivées comprises : archiver ne délie pas. */
async function relationBlockers(type: string, id: string): Promise<DeleteBlocker[]> {
  const pointing = listObjects()
    .flatMap((object) => object.relations.filter((relation) => relation.to === type).map((relation) => ({ object, relation })));
  return Promise.all(
    pointing.map(async ({ object, relation }) => {
      const { table } = getServerObject(object.key);
      const columns = getTableColumns(table);
      const where = eq(columns[relation.fkColumn], id);
      const count = await countWhere(table, where);
      if (count === 0) return { key: `${object.key}-${relation.fkColumn}`, label: relation.inverseLabel, count, titles: [] };
      const rows = await db.select({ title: columns[object.titleField] }).from(table).where(where).orderBy(desc(columns.updatedAt), desc(columns.id)).limit(BLOCKER_TITLES_LIMIT);
      return { key: `${object.key}-${relation.fkColumn}`, label: relation.inverseLabel, count, titles: rows.map((row) => String(row.title ?? "")) };
    }),
  );
}

/**
 * Lignes dépendantes déclarées comme retenant la fiche (`holds`), archivées comprises : le refus nomme
 * les fiches qu'elles désignent, les plus récentes d'abord (D47).
 */
async function dependentBlockers(type: string, id: string): Promise<DeleteBlocker[]> {
  const holding = (getServerObject(type).dependents ?? []).flatMap((dependent) => (dependent.holds ? [{ dependent, holds: dependent.holds }] : []));
  return Promise.all(
    holding.map(async ({ dependent, holds }) => {
      const key = getTableName(dependent.table);
      const rows = getTableColumns(dependent.table);
      const where = eq(rows[dependent.fkColumn], id);
      const count = await countWhere(dependent.table, where);
      if (count === 0) return { key, label: holds.label, count, titles: [] };
      const target = getServerObject(holds.to).table;
      const targetColumns = getTableColumns(target);
      const titles = await db
        .select({ title: targetColumns[getObject(holds.to).titleField] })
        .from(dependent.table)
        .innerJoin(target, eq(targetColumns.id, rows[holds.fkColumn]))
        .where(where)
        .orderBy(desc(targetColumns.updatedAt), desc(targetColumns.id))
        .limit(BLOCKER_TITLES_LIMIT);
      return { key, label: holds.label, count, titles: titles.map((row) => String(row.title ?? "")) };
    }),
  );
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
  const found = [...(await relationBlockers(type, id)), ...(await dependentBlockers(type, id)), ...(await feedBlockers(type, id))];
  return found.filter((blocker) => blocker.count > 0);
}

/**
 * Supprime définitivement une fiche et son historique : 404 inconnue, 409 `fiche_liee` avec la liste
 * de ce qui la retient. L'état de la cible est vérifié avant d'écrire — jamais un 200 pour un geste
 * qui n'a rien fait.
 */
export async function deleteRecord(type: string, id: string): Promise<void> {
  const record = await getObjectRecord(type, id);
  /* L'état de la fiche d'abord (D21, `deletable`) : une fiche que son objet retient s'archive, quoi qu'on lui ait lié. */
  const refusal = getServerObject(type).deletable?.(record) ?? null;
  if (refusal) throw new HttpError(409, "suppression_refusee", refusal, { id: record.id });
  const blockers = await deleteBlockers(type, id);
  if (blockers.length > 0) {
    throw new HttpError(409, "fiche_liee", `${getObject(type).labels.singular} liée : elle ne se supprime pas tant que d'autres fiches ou entrées la retiennent.`, { blockers });
  }
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  await db.transaction(async (tx) => {
    await tx.delete(auditLog).where(and(eq(auditLog.objectType, type), eq(auditLog.objectId, id)));
    /* Les valeurs personnalisées (2.4) partent avec la fiche : aucune clé étrangère ne les tient, la fiche n'est dans aucune table commune. */
    await tx.delete(customFieldValue).where(and(eq(customFieldValue.objectType, type), eq(customFieldValue.objectId, id)));
    await tx.delete(table).where(eq(columns.id, id));
  });
}
