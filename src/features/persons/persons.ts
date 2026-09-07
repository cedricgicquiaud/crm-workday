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

/** L'adresse principale saisie, si elle en est une, doit être libre dans tout le CRM avant toute écriture (une adresse mal formée est refusée ensuite, 400, par les descripteurs). */
async function assertPrimaryEmailAvailable(input: Record<string, unknown>, exceptPersonId: string | null): Promise<void> {
  if (typeof input.email !== "string" || input.email.trim() === "") return;
  await assertEmailAvailable(normalizeEmail(input.email), exceptPersonId);
}

/** Les autres adresses saisies (`otherEmails`), vérifiées avant toute écriture ; `null` si le champ n'est pas envoyé. */
async function otherEmailsToSet(input: Record<string, unknown>, primary: string | null, exceptPersonId: string | null): Promise<string[] | null> {
  if (!("otherEmails" in input)) return null;
  const addresses = parseOtherEmails(typeof input.otherEmails === "string" ? input.otherEmails : "", primary);
  await assertOtherEmailsAvailable(addresses, exceptPersonId);
  return addresses;
}

const primaryOf = (input: Record<string, unknown>, fallback: unknown): string | null => {
  const value = "email" in input ? input.email : fallback;
  return typeof value === "string" && value.trim() !== "" ? normalizeEmail(value) : null;
};

export async function createPerson(input: unknown, actor: Actor): Promise<PersonRecord> {
  const { otherEmails: _ignored, ...raw } = asObject(input);
  refuseDerived(raw);
  await assertPrimaryEmailAvailable(raw, null);
  const others = await otherEmailsToSet(asObject(input), primaryOf(raw, null), null);
  const record = await createObject(TYPE, raw, actor);
  if (others) await setOtherEmails(record.id, others, actor);
  return withEmails(record);
}

export const getPerson = async (id: string): Promise<PersonRecord> => withEmails(await getObjectRecord(TYPE, id));

export async function updatePerson(id: string, patch: unknown, actor: Actor): Promise<PersonRecord> {
  const { otherEmails: _ignored, ...raw } = asObject(patch);
  refuseDerived(raw);
  const current = await getObjectRecord(TYPE, id);
  assertWritable(TYPE, current);
  await assertPrimaryEmailAvailable(raw, id);
  const others = await otherEmailsToSet(asObject(patch), primaryOf(raw, current.email), id);
  let record = current;
  if (Object.keys(raw).length > 0) record = await updateObject(TYPE, id, raw, actor);
  if (others) {
    await setOtherEmails(id, others, actor);
    record = await getObjectRecord(TYPE, id);
  }
  return withEmails(record);
}

export const listPersons = (): Promise<ObjectRecord[]> => listObjectRecords(TYPE);
