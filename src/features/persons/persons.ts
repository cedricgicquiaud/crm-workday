/**
 * Personne côté serveur : les routes d'API passent par ici. Le comportement commun vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique) ; ce module
 * ajoute ce qui est propre à la personne : ses adresses (`emails.ts`) et le refus des champs dérivés.
 */
import { createObject, getObjectRecord, listObjectRecords, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { otherEmailsOf } from "./emails";
import { DERIVED_FIELDS } from "./schema";

const TYPE = "person";

/** Une personne telle que l'API la rend : la fiche et ses autres adresses, jointes par « , ». */
export type PersonRecord = ObjectRecord & { otherEmails: string };

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/** Un champ calculé ou dérivé (nom complet, Profils) ne se saisit pas : 400 rattaché au champ. */
function refuseDerived(input: Record<string, unknown>): void {
  const errors = Object.fromEntries(Object.entries(DERIVED_FIELDS).filter(([key]) => key in input));
  if (Object.keys(errors).length === 0) return;
  throw new HttpError(400, "champ_derive", Object.values(errors)[0], { fields: errors });
}

async function withEmails(record: ObjectRecord): Promise<PersonRecord> {
  return { ...record, otherEmails: (await otherEmailsOf(record.id)).join(", ") };
}

export async function createPerson(input: unknown, actor: Actor): Promise<PersonRecord> {
  const raw = asObject(input);
  refuseDerived(raw);
  return withEmails(await createObject(TYPE, raw, actor));
}

export const getPerson = async (id: string): Promise<PersonRecord> => withEmails(await getObjectRecord(TYPE, id));

export async function updatePerson(id: string, patch: unknown, actor: Actor): Promise<PersonRecord> {
  const raw = asObject(patch);
  refuseDerived(raw);
  return withEmails(await updateObject(TYPE, id, raw, actor));
}

export const listPersons = (): Promise<ObjectRecord[]> => listObjectRecords(TYPE);
