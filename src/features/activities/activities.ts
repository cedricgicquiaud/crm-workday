/**
 * Activités d'une fiche (D10) : note, appel, réunion, tâche. Mécanisme commun à tout objet — il ne
 * connaît que la clé d'objet du registre. À la création, l'activité mémorise la fiche parente du
 * moment (`feedParent` du registre, lue par la relation déclarée vers elle) : le fil du parent la
 * reprend, et un changement de rattachement ne déplace jamais ce qui est déjà écrit (contrat 7).
 */
import { activity } from "@/db/schema";
import { getObject } from "@/features/objects/registry";
import { assertWritable, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseActivity, type ActivityErrors } from "./schema";

export type ActivityRecord = typeof activity.$inferSelect;

/** Fiche parente du moment : l'objet désigné par `feedParent`, retrouvé par la relation déclarée vers lui. */
function feedParentOf(objectType: string, record: ObjectRecord): { parentType: string | null; parentId: string | null } {
  const definition = getObject(objectType);
  const relation = definition.feedParent ? definition.relations.find((r) => r.to === definition.feedParent) : undefined;
  const parentId = relation ? record[relation.fkColumn] : null;
  return typeof parentId === "string" ? { parentType: definition.feedParent!, parentId } : { parentType: null, parentId: null };
}

/** 400 dont le message est la première erreur, et toutes les erreurs par champ pour l'écran. */
const invalid = (errors: ActivityErrors) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

/** Écrit une activité sur une fiche : 400 données invalides, 404 fiche ou type d'objet inconnu, 409 fiche archivée (D21). */
export async function createActivity(objectType: string, objectId: string, input: unknown, actor: Actor): Promise<ActivityRecord> {
  const record = await getObjectRecord(objectType, objectId);
  assertWritable(objectType, record);
  const parsed = parseActivity(input);
  if ("errors" in parsed) throw invalid(parsed.errors);
  const [row] = await db
    .insert(activity)
    .values({ objectType, objectId, ...feedParentOf(objectType, record), ...parsed.values, authorId: actor.id })
    .returning();
  return row;
}
