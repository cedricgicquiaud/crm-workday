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
import { and, count, eq, getTableColumns, inArray, notInArray, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { activity, auditLog, customFieldValue, emailLog, objectRedirect } from "@/db/schema";
import { deleteBlockers } from "@/features/archive/delete";
import { customFieldKey, isCustomFieldKey } from "@/features/custom-fields/fields-source";
import { fieldsOf } from "@/features/objects/fields";
import { getObject, listObjects } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
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
 * Ce que porte l'absorbée et qui rejoindra la conservée, famille par famille, sans les familles
 * vides. Les fiches liées, les activités et les emails sont exactement ce qui retiendrait la fiche à
 * la suppression : le compte est le même, seul le sort de ces éléments change. L'historique et les
 * valeurs de champs personnalisés s'y ajoutent : la suppression les emporte, la fusion les déplace.
 */
async function attachments(type: string, keptId: string, id: string): Promise<MergeCount[]> {
  const [held, history, values] = await Promise.all([deleteBlockers(type, id), countWhere(auditLog, entriesOf(type, id)), countMovingValues(type, keptId, id)]);
  return [...held, { key: "historique", label: "Historique", count: history }, { key: "valeurs", label: "Valeurs de champs personnalisés", count: values }].filter((family) => family.count > 0);
}

/** Ce que la fusion déplacera, annoncé au dialogue de confirmation avant qu'il n'écrive rien (contrat 29). */
export async function planMerge(type: string, keptId: string, absorbedId: string): Promise<MergePlan> {
  const { kept, absorbed } = await pairOf(type, keptId, absorbedId);
  return { keptId, absorbedId, moved: await attachments(type, kept.id, absorbed.id) };
}

/** Définitions de champ personnalisé dont une fiche porte déjà une valeur. */
async function definitionsOf(type: string, id: string): Promise<string[]> {
  const rows = await db.select({ definitionId: customFieldValue.definitionId }).from(customFieldValue).where(valuesOf(type, id));
  return rows.map((row) => row.definitionId);
}

/**
 * Valeurs personnalisées de l'absorbée qui rejoindront vraiment la conservée : celles dont la
 * conservée ne porte pas déjà une valeur. Une valeur que les deux fiches portent ne se déplace pas,
 * elle se choisit champ par champ — l'annoncer comme déplacée fausserait le compte du dialogue.
 */
async function countMovingValues(type: string, keptId: string, absorbedId: string): Promise<number> {
  const held = await definitionsOf(type, keptId);
  const scope = held.length === 0 ? valuesOf(type, absorbedId) : and(valuesOf(type, absorbedId), notInArray(customFieldValue.definitionId, held))!;
  return countWhere(customFieldValue, scope);
}

/**
 * Valeurs que la fiche conservée prend à l'absorbée : les champs explicitement choisis, et eux
 * seuls. Un champ que l'objet ne déclare pas, ou qui ne se saisit pas (une colonne calculée par la
 * base), est ignoré : sa valeur ne s'écrit pas.
 */
function chosenValues(type: string, absorbed: ObjectRecord, taken: readonly string[]): Record<string, unknown> {
  const writable = fieldsOf(type).filter((field) => field.editable !== false);
  return Object.fromEntries(writable.filter((field) => taken.includes(field.key)).map((field) => [field.key, absorbed[field.key] ?? null]));
}

/** Relations déclarées qui désignent cet objet : la colonne à re-pointer, dans la table qui la porte. */
function pointingColumns(type: string): { table: PgTable; column: string }[] {
  return listObjects().flatMap((object) =>
    object.relations.filter((relation) => relation.to === type).map((relation) => ({ table: getServerObject(object.key).table, column: relation.fkColumn })),
  );
}

/**
 * Fusionne deux fiches (D20, contrat 29) : tout ce qui désignait l'absorbée désigne la conservée,
 * l'absorbée disparaît, son adresse redirige, et le fil de la conservée porte « fusionnée avec … »,
 * écrite par le système (elle est donc marquée « automatique », D11). Champ par champ, la valeur
 * gardée est celle de la conservée, sauf pour les champs cités dans `taken`.
 *
 * Tout part dans une seule transaction : sans elle, une panne au milieu laisserait des activités
 * rattachées à une fiche disparue. L'état des deux fiches est vérifié avant d'écrire (400, 404, 409).
 */
export async function mergeRecords(type: string, keptId: string, absorbedId: string, taken: readonly string[], actor: Actor): Promise<ObjectRecord> {
  const { kept, absorbed } = await pairOf(type, keptId, absorbedId);
  const title = String(absorbed[getObject(type).titleField] ?? "");
  const values = chosenValues(type, absorbed, taken);
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const heldDefinitions = await definitionsOf(type, kept.id);
  /* Une valeur que les deux fiches portent : celle de l'absorbée n'arrive que si le champ lui a été pris. */
  const replaced = heldDefinitions.filter((definitionId) => taken.includes(customFieldKey(definitionId)));
  const dropped = heldDefinitions.filter((definitionId) => !replaced.includes(definitionId));

  await db.transaction(async (tx) => {
    for (const { table: pointing, column } of pointingColumns(type)) {
      await tx.update(pointing).set({ [column]: kept.id }).where(eq(getTableColumns(pointing)[column], absorbed.id));
    }
    await tx.update(activity).set({ objectId: kept.id }).where(and(eq(activity.objectType, type), eq(activity.objectId, absorbed.id)));
    await tx.update(activity).set({ parentId: kept.id }).where(and(eq(activity.parentType, type), eq(activity.parentId, absorbed.id)));
    await tx.update(auditLog).set({ objectId: kept.id }).where(entriesOf(type, absorbed.id));
    await tx.update(emailLog).set({ objectId: kept.id }).where(and(eq(emailLog.objectType, type), eq(emailLog.objectId, absorbed.id)));
    /* Les valeurs en double partent avant le déplacement : la table n'en accepte qu'une par champ et par fiche. */
    if (dropped.length > 0) await tx.delete(customFieldValue).where(and(valuesOf(type, absorbed.id), inArray(customFieldValue.definitionId, dropped)));
    if (replaced.length > 0) await tx.delete(customFieldValue).where(and(valuesOf(type, kept.id), inArray(customFieldValue.definitionId, replaced)));
    await tx.update(customFieldValue).set({ objectId: kept.id }).where(valuesOf(type, absorbed.id));
    /* Une fiche déjà absorbée par celle-ci suit le mouvement : sinon son adresse mènerait à une fiche disparue. */
    await tx.update(objectRedirect).set({ toId: kept.id }).where(and(eq(objectRedirect.objectType, type), eq(objectRedirect.toId, absorbed.id)));
    await tx.insert(objectRedirect).values({ objectType: type, fromId: absorbed.id, toId: kept.id });
    /* L'absorbée part avant que la conservée prenne ses valeurs : une valeur unique (le SIREN) serait sinon refusée. */
    await tx.delete(table).where(eq(columns.id, absorbed.id));
    const base = Object.fromEntries(Object.entries(values).filter(([key]) => !isCustomFieldKey(key)));
    await tx.update(table).set({ ...base, updatedAt: new Date() }).where(eq(columns.id, kept.id));
    /* L'entrée est écrite ici, et non par `recordHistory`, pour rester dans la transaction : une fusion sans sa trace serait une fusion muette. */
    await tx.insert(auditLog).values({ objectType: type, objectId: kept.id, action: "fusionnee", newValue: title, authorId: null });
  });

  return getObjectRecord(type, kept.id);
}
