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
import { and, count, eq, getTableColumns, getTableName, inArray, notInArray, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { activity, auditLog, customFieldValue, emailLog, objectRedirect } from "@/db/schema";
import { deleteBlockers } from "@/features/archive/delete";
import { customFieldKey, isCustomFieldKey } from "@/features/custom-fields/fields-source";
import { serializeValue, writableFieldsOf } from "@/features/objects/fields";
import { displayValue } from "@/features/objects/labels";
import { getObject, listObjects } from "@/features/objects/registry";
import { getServerObject, type DependentTable } from "@/features/objects/registry.server";
import { getObjectRecord, listUserOptions, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Une famille de ce qui sera déplacé : sa clé, ce qu'elle est pour un lecteur, et combien. */
export type MergeCount = { key: string; label: string; count: number };

/** Un champ que les deux fiches ne remplissent pas pareil : à trancher avant de fusionner (D20). */
export type MergeField = { key: string; label: string; kept: string; absorbed: string };

/** Ce que la fusion fera, avant de la faire : les deux fiches, le compte par famille, les champs à trancher. */
export type MergePlan = { keptId: string; absorbedId: string; moved: MergeCount[]; fields: MergeField[] };

async function countWhere(table: PgTable, where: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return Number(row?.value ?? 0);
}

const entriesOf = (type: string, id: string) => and(eq(auditLog.objectType, type), eq(auditLog.objectId, id))!;
const valuesOf = (type: string, id: string) => and(eq(customFieldValue.objectType, type), eq(customFieldValue.objectId, id))!;

/**
 * Les deux fiches d'une fusion, vérifiées avant toute écriture : 400 si c'est la même, 404 si l'une
 * est inconnue, 409 si l'une est archivée ou n'existe plus que par sa redirection. Les types
 * différents sont refusés par la route, qui seule connaît le type annoncé pour chacune.
 *
 * La lecture d'une fiche suit les redirections : une fiche absorbée se lit comme la fiche conservée.
 * Ce sont donc les identifiants **résolus** qui disent si la paire n'en fait qu'une — comparer les
 * identifiants annoncés laisserait rejouer une fusion déjà faite, qui supprimerait la fiche conservée
 * en croyant supprimer l'absorbée.
 */
async function pairOf(type: string, keptId: string, absorbedId: string): Promise<{ kept: ObjectRecord; absorbed: ObjectRecord }> {
  const sameRecord = () => new HttpError(400, "meme_fiche", `${getObject(type).labels.singular} ne se fusionne pas avec elle-même.`);
  if (keptId === absorbedId) throw sameRecord();
  const [kept, absorbed] = await Promise.all([getObjectRecord(type, keptId), getObjectRecord(type, absorbedId)]);
  for (const [announced, record] of [[keptId, kept] as const, [absorbedId, absorbed] as const]) {
    /* L'identifiant annoncé désigne une fiche déjà absorbée : la fusion porterait sur une fiche disparue.
       Ce refus passe avant la comparaison des identifiants résolus, sinon rejouer une fusion se lirait
       « la même fiche » (400) au lieu de dire ce qui s'est passé (409, contrat 29). */
    if (record.id !== announced) throw new HttpError(409, "fiche_absorbee", `${getObject(type).labels.singular} déjà fusionnée avec une autre : elle n'entre pas dans une nouvelle fusion.`, { id: record.id });
    if (record.archivedAt) throw new HttpError(409, "fiche_archivee", `${getObject(type).labels.singular} archivée : elle n'entre pas dans une fusion.`, { id: record.id });
  }
  if (kept.id === absorbed.id) throw sameRecord();
  return { kept, absorbed };
}

/** Tables qui dépendent d'une fiche sans être un objet, déclarées par le manifeste de l'objet (D20). */
const dependentsOf = (type: string): readonly DependentTable[] => getServerObject(type).dependents ?? [];

/** Lignes d'une table dépendante rattachées à une fiche. */
const heldBy = (dependent: DependentTable, id: string) => eq(getTableColumns(dependent.table)[dependent.fkColumn], id);

const rowsOf = (dependent: DependentTable, id: string) => db.select().from(dependent.table).where(heldBy(dependent, id)) as unknown as Promise<Record<string, unknown>[]>;

/**
 * Ce que l'absorbée porte dans ses tables dépendantes et qui rejoindra vraiment la conservée. Une
 * ligne « une au plus » que la conservée porte déjà ne se déplace pas : celle de l'absorbée est
 * consignée puis supprimée, et l'annoncer comme déplacée fausserait le compte du dialogue.
 */
async function dependentCounts(type: string, keptId: string, absorbedId: string): Promise<MergeCount[]> {
  return Promise.all(
    dependentsOf(type).map(async (dependent) => {
      const takenAlready = dependent.oneAtMost === true && (await countWhere(dependent.table, heldBy(dependent, keptId))) > 0;
      return { key: getTableName(dependent.table), label: dependent.label, count: takenAlready ? 0 : await countWhere(dependent.table, heldBy(dependent, absorbedId)) };
    }),
  );
}

/**
 * Ce que porte l'absorbée et qui rejoindra la conservée, famille par famille, sans les familles
 * vides. Les fiches liées, les activités et les emails sont exactement ce qui retiendrait la fiche à
 * la suppression : le compte est le même, seul le sort de ces éléments change. L'historique et les
 * valeurs de champs personnalisés s'y ajoutent : la suppression les emporte, la fusion les déplace.
 */
async function attachments(type: string, keptId: string, id: string): Promise<MergeCount[]> {
  const [held, dependents, history, values] = await Promise.all([deleteBlockers(type, id), dependentCounts(type, keptId, id), countWhere(auditLog, entriesOf(type, id)), countMovingValues(type, keptId, id)]);
  return [...held, ...dependents, { key: "historique", label: "Historique", count: history }, { key: "valeurs", label: "Valeurs de champs personnalisés", count: values }].filter((family) => family.count > 0);
}

/** Ce que la fusion déplacera, annoncé au dialogue de confirmation avant qu'il n'écrive rien (contrat 29). */
export async function planMerge(type: string, keptId: string, absorbedId: string): Promise<MergePlan> {
  const { kept, absorbed } = await pairOf(type, keptId, absorbedId);
  const [moved, fields] = await Promise.all([attachments(type, kept.id, absorbed.id), differingFields(type, kept, absorbed)]);
  return { keptId, absorbedId, moved, fields };
}

/**
 * Champs que les deux fiches ne remplissent pas pareil, dans l'ordre d'affichage, avec ce que
 * chacune porte, écrit comme la fiche l'écrit (une liste par son libellé, un responsable par son
 * nom). Les champs identiques ne se tranchent pas : les proposer allongerait le dialogue pour rien.
 */
async function differingFields(type: string, kept: ObjectRecord, absorbed: ObjectRecord): Promise<MergeField[]> {
  const users = await listUserOptions();
  /* Un champ de profil ne se tranche pas ici : il suit son profil, qui est une famille à part (D20). */
  return writableFieldsOf(type)
    .filter((field) => field.editable !== false)
    .filter((field) => serializeValue(field, kept[field.key]) !== serializeValue(field, absorbed[field.key]))
    .map((field) => ({ key: field.key, label: field.label, kept: displayValue(field, kept[field.key], users), absorbed: displayValue(field, absorbed[field.key], users) }));
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

/** Une ligne « une au plus » de l'absorbée que la conservée porte déjà : elle part, son contenu consigné. */
type DroppedDependent = { dependent: DependentTable; row: Record<string, unknown> };

/** Les lignes dépendantes de l'absorbée qui ne rejoindront pas la conservée, parce qu'elle porte déjà la sienne (D20). */
async function droppedDependents(type: string, keptId: string, absorbedId: string): Promise<DroppedDependent[]> {
  const found = await Promise.all(
    dependentsOf(type)
      .filter((dependent) => dependent.oneAtMost === true)
      .map(async (dependent) => {
        const [held] = await rowsOf(dependent, keptId);
        const [row] = held ? await rowsOf(dependent, absorbedId) : [];
        return row ? { dependent, row } : null;
      }),
  );
  return found.filter((entry): entry is DroppedDependent => entry !== null);
}

/** Colonnes techniques d'une ligne dépendante : elles ne disent rien à un lecteur de l'historique. */
const TECHNICAL = new Set(["id", "createdAt", "updatedAt"]);

/**
 * Ce que portait une ligne dépendante de l'absorbée qui ne rejoint pas la conservée, écrit en toutes
 * lettres pour l'entrée de fusion : D20 veut que l'ancien rattachement soit consigné, et un
 * identifiant ne se lit pas. Les colonnes de la fiche que la ligne tient à jour en font partie.
 */
async function droppedNote(type: string, absorbed: ObjectRecord, { dependent, row }: DroppedDependent): Promise<string> {
  /* Une famille qui sait se dire elle-même le fait : ses colonnes brutes ne se lisent pas (D16). */
  if (dependent.describe) return `${dependent.label} : ${await dependent.describe(row, absorbed)}`;
  const own = Object.entries(row).filter(([key, value]) => !TECHNICAL.has(key) && key !== dependent.fkColumn && value !== null && value !== "");
  const carried = (dependent.carries ?? []).filter((key) => absorbed[key] != null).map((key) => [key, absorbed[key]] as [string, unknown]);
  const written = await Promise.all([...own, ...carried].map(async ([key, value]) => `${key} = ${await readableValue(type, key, value)}`));
  return `${dependent.label} : ${written.join(", ")}`;
}

/** Une valeur telle qu'un lecteur la lit : par le titre de la fiche liée quand la colonne porte une relation déclarée. */
async function readableValue(type: string, key: string, value: unknown): Promise<string> {
  const relation = getObject(type).relations.find((candidate) => candidate.fkColumn === key);
  if (!relation || typeof value !== "string") return String(value);
  const linked = await getObjectRecord(relation.to, value).catch(() => null);
  return linked ? String(linked[getObject(relation.to).titleField] ?? value) : value;
}

/**
 * Colonnes de la fiche qui suivent une ligne dépendante déplacée : l'entreprise de rattachement d'un
 * profil n'a pas de sens sans le profil, et la conservée porterait sinon un rattachement à moitié.
 * Rien ne suit une ligne restée sur place — la conservée garde alors ce qu'elle portait déjà.
 */
async function carriedColumns(type: string, absorbed: ObjectRecord, dropped: readonly DroppedDependent[]): Promise<Record<string, unknown>> {
  const moving = dependentsOf(type).filter((dependent) => (dependent.carries?.length ?? 0) > 0 && !dropped.some((entry) => entry.dependent === dependent));
  const taken = await Promise.all(
    moving.map(async (dependent) => ((await rowsOf(dependent, absorbed.id)).length > 0 ? (dependent.carries ?? []).map((key) => [key, absorbed[key]] as [string, unknown]) : [])),
  );
  return Object.fromEntries(taken.flat());
}

/**
 * Colonnes que la fiche conservée prend à l'absorbée : les champs explicitement choisis, et eux
 * seuls. Un champ que l'objet ne déclare pas, ou qui ne se saisit pas (une colonne calculée par la
 * base), est ignoré. Les champs personnalisés vivent dans leur propre table : ils sont pris par le
 * déplacement de leurs valeurs, pas par cette mise à jour.
 */
function chosenColumns(type: string, absorbed: ObjectRecord, taken: readonly string[]): Record<string, unknown> {
  const writable = writableFieldsOf(type).filter((field) => field.editable !== false && !isCustomFieldKey(field.key));
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
 * gardée est celle de la conservée, sauf pour les champs cités dans `taken`. L'entrée d'historique
 * n'a pas d'auteur : la fusion est un geste du système, quel que soit l'administrateur qui l'a lancée.
 *
 * Tout part dans une seule transaction : sans elle, une panne au milieu laisserait des activités
 * rattachées à une fiche disparue. L'état des deux fiches est vérifié avant d'écrire (400, 404, 409).
 */
export async function mergeRecords(type: string, keptId: string, absorbedId: string, taken: readonly string[]): Promise<ObjectRecord> {
  const { kept, absorbed } = await pairOf(type, keptId, absorbedId);
  const title = String(absorbed[getObject(type).titleField] ?? "");
  const columnValues = chosenColumns(type, absorbed, taken);
  const { table } = getServerObject(type);
  const columns = getTableColumns(table);
  const heldDefinitions = await definitionsOf(type, kept.id);
  /* Ce qui ne se déplace pas est lu, et écrit en toutes lettres, avant que l'absorbée ne disparaisse. */
  const dropped = await droppedDependents(type, kept.id, absorbed.id);
  const notes = await Promise.all(dropped.map((entry) => droppedNote(type, absorbed, entry)));
  const carried = await carriedColumns(type, absorbed, dropped);
  /* Une valeur que les deux fiches portent : celle de l'absorbée n'arrive que si le champ lui a été pris. */
  const replaced = heldDefinitions.filter((definitionId) => taken.includes(customFieldKey(definitionId)));
  const droppedDefinitions = heldDefinitions.filter((definitionId) => !replaced.includes(definitionId));

  await db.transaction(async (tx) => {
    for (const { table: pointing, column } of pointingColumns(type)) {
      await tx.update(pointing).set({ [column]: kept.id }).where(eq(getTableColumns(pointing)[column], absorbed.id));
    }
    /* Une ligne « une au plus » que la conservée porte déjà part avec l'absorbée : son contenu est
       consigné dans l'entrée de fusion, la conservée garde la sienne (D20). */
    for (const { dependent, row } of dropped) await tx.delete(dependent.table).where(eq(getTableColumns(dependent.table).id, row.id as string));
    /* Les autres suivent la fiche. Aucune collision possible sur une colonne unique : une adresse
       email est déjà unique dans tout le CRM, deux fiches n'en portent jamais la même. */
    for (const dependent of dependentsOf(type)) await tx.update(dependent.table).set({ [dependent.fkColumn]: kept.id }).where(heldBy(dependent, absorbed.id));
    await tx.update(activity).set({ objectId: kept.id }).where(and(eq(activity.objectType, type), eq(activity.objectId, absorbed.id)));
    await tx.update(activity).set({ parentId: kept.id }).where(and(eq(activity.parentType, type), eq(activity.parentId, absorbed.id)));
    await tx.update(auditLog).set({ objectId: kept.id }).where(entriesOf(type, absorbed.id));
    await tx.update(emailLog).set({ objectId: kept.id }).where(and(eq(emailLog.objectType, type), eq(emailLog.objectId, absorbed.id)));
    /* Les valeurs en double partent avant le déplacement : la table n'en accepte qu'une par champ et par fiche. */
    if (droppedDefinitions.length > 0) await tx.delete(customFieldValue).where(and(valuesOf(type, absorbed.id), inArray(customFieldValue.definitionId, droppedDefinitions)));
    if (replaced.length > 0) await tx.delete(customFieldValue).where(and(valuesOf(type, kept.id), inArray(customFieldValue.definitionId, replaced)));
    await tx.update(customFieldValue).set({ objectId: kept.id }).where(valuesOf(type, absorbed.id));
    /* Une fiche déjà absorbée par celle-ci suit le mouvement : sinon son adresse mènerait à une fiche disparue. */
    await tx.update(objectRedirect).set({ toId: kept.id }).where(and(eq(objectRedirect.objectType, type), eq(objectRedirect.toId, absorbed.id)));
    await tx.insert(objectRedirect).values({ objectType: type, fromId: absorbed.id, toId: kept.id });
    /* L'absorbée part avant que la conservée prenne ses valeurs : une valeur unique (le SIREN) serait sinon refusée. */
    await tx.delete(table).where(eq(columns.id, absorbed.id));
    await tx.update(table).set({ ...carried, ...columnValues, updatedAt: new Date() }).where(eq(columns.id, kept.id));
    /* Les champs dérivés de la conservée se recalculent depuis ce qu'elle porte maintenant : « Profils » ne se recopie pas (D8). */
    await getServerObject(type).recompute?.(kept.id, tx);
    /* L'entrée est écrite ici, et non par `recordHistory`, pour rester dans la transaction : une fusion sans sa trace serait une fusion muette. */
    await tx.insert(auditLog).values({ objectType: type, objectId: kept.id, action: "fusionnee", newValue: title, oldValue: notes.join(" ; ") || null, authorId: null });
  });

  return getObjectRecord(type, kept.id);
}
