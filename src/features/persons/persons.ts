/**
 * Personne côté serveur : les routes d'API passent par ici. Le comportement commun vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique) ; ce module
 * ajoute ce qui est propre à la personne : ses adresses (`emails.ts`) et le refus des champs dérivés.
 */
import { assertWritable, createObject, getObjectRecord, listObjectRecords, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { assertEmailAvailable, assertOtherEmailsAvailable, normalizeEmail, otherEmailsOf, parseOtherEmails, setOtherEmails } from "./emails";
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

/**
 * Sépare l'entrée reçue : les champs de la fiche (pour le service générique) et les adresses, dont
 * l'unicité dans tout le CRM est vérifiée ici, avant toute écriture. Une adresse mal formée est
 * refusée par les descripteurs (principale) ou par `parseOtherEmails` (autres), en 400.
 */
async function prepareInput(input: unknown, exceptPersonId: string | null, currentEmail: unknown): Promise<{ fields: Record<string, unknown>; otherEmails: string[] | null }> {
  const { otherEmails, ...fields } = asObject(input);
  refuseDerived(fields);
  const primary = primaryOf(fields, currentEmail);
  if (primary) await assertEmailAvailable(primary, exceptPersonId);
  if (otherEmails === undefined) return { fields, otherEmails: null };
  const addresses = parseOtherEmails(typeof otherEmails === "string" ? otherEmails : "", primary);
  await assertOtherEmailsAvailable(addresses, exceptPersonId);
  return { fields, otherEmails: addresses };
}

/** L'adresse principale normalisée après la modification : celle saisie, sinon celle enregistrée ; `null` si aucune. */
function primaryOf(fields: Record<string, unknown>, currentEmail: unknown): string | null {
  const value = "email" in fields ? fields.email : currentEmail;
  return typeof value === "string" && value.trim() !== "" ? normalizeEmail(value) : null;
}

export async function createPerson(input: unknown, actor: Actor): Promise<PersonRecord> {
  const { fields, otherEmails } = await prepareInput(input, null, null);
  const record = await createObject(TYPE, fields, actor);
  if (otherEmails) await setOtherEmails(record.id, otherEmails, actor);
  return withEmails(record);
}

export const getPerson = async (id: string): Promise<PersonRecord> => withEmails(await getObjectRecord(TYPE, id));

export async function updatePerson(id: string, patch: unknown, actor: Actor): Promise<PersonRecord> {
  const current = await getObjectRecord(TYPE, id);
  assertWritable(TYPE, current);
  const { fields, otherEmails } = await prepareInput(patch, id, current.email);
  let record = current;
  if (Object.keys(fields).length > 0) record = await updateObject(TYPE, id, fields, actor);
  if (otherEmails) {
    await setOtherEmails(id, otherEmails, actor);
    record = await getObjectRecord(TYPE, id);
  }
  return withEmails(record);
}

export const listPersons = (): Promise<ObjectRecord[]> => listObjectRecords(TYPE);
