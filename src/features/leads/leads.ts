/**
 * Lead côté serveur : les routes d'API passent par ici. Le comportement commun vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique) ; ce module
 * ajoute ce qui est propre au lead : la règle des trois champs (D4) et le refus du titre calculé (D3).
 */
import { assertWritable, createObject, getObjectRecord, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { lacksName, LEAD_NAME_ERROR_FIELD, LEAD_NAME_RULE, TITLE_RULE } from "./schema";

const TYPE = "lead";

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/** Le titre se calcule (D3) : le saisir est refusé (400) sous le champ. */
function refuseTitle(input: Record<string, unknown>): void {
  if ("title" in input) throw new HttpError(400, "champ_derive", TITLE_RULE, { fields: { title: TITLE_RULE } });
}

/** D4 : sans prénom, nom ni nom d'entreprise, un seul refus sous le groupe des trois champs. */
function assertNamed(values: Record<string, unknown>): void {
  if (lacksName(values)) throw new HttpError(400, "donnees_invalides", LEAD_NAME_RULE, { fields: { [LEAD_NAME_ERROR_FIELD]: LEAD_NAME_RULE } });
}

export async function createLead(input: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(input);
  refuseTitle(fields);
  assertNamed(fields);
  return createObject(TYPE, fields, actor);
}

export const getLead = (id: string): Promise<ObjectRecord> => getObjectRecord(TYPE, id);

/** La règle des trois champs se lit sur la fiche telle qu'elle serait après la modification : vider le dernier est refusé. */
export async function updateLead(id: string, patch: unknown, actor: Actor): Promise<ObjectRecord> {
  const fields = asObject(patch);
  const current = await getObjectRecord(TYPE, id);
  assertWritable(TYPE, current);
  refuseTitle(fields);
  assertNamed({ ...current, ...fields });
  return updateObject(TYPE, id, fields, actor);
}
