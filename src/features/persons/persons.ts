/**
 * Personne côté serveur : les routes d'API passent par ici. Le comportement commun vient du service
 * générique des objets (validation par les descripteurs, colonnes de base, historique) ; ce module
 * ajoute ce qui est propre à la personne : ses adresses (`emails.ts`) et le refus des champs dérivés.
 */
import { assertWritable, createObject, getObjectRecord, listObjectRecords, updateObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { CONTACT_PROFILE_KEYS, getContactProfile, prepareContactProfile, writeContactProfile, type PreparedContactProfile } from "./contact-profile";
import { assertEmailAvailable, assertOtherEmailsAvailable, otherEmailsOf, parseOtherEmails, setOtherEmails } from "./emails";
import { DERIVED_FIELDS, normalizeEmail } from "./schema";

const TYPE = "person";

/** Une personne telle que l'API la rend : la fiche, ses autres adresses jointes par « , », et le poste de son profil contact. */
export type PersonRecord = ObjectRecord & { otherEmails: string; jobTitle: string | null };

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/** Un champ calculé ou dérivé (nom complet, Profils) ne se saisit pas : 400 rattaché au champ. */
function refuseDerived(input: Record<string, unknown>): void {
  const errors = Object.fromEntries(Object.entries(DERIVED_FIELDS).filter(([key]) => key in input));
  if (Object.keys(errors).length === 0) return;
  throw new HttpError(400, "champ_derive", Object.values(errors)[0], { fields: errors });
}

async function withEmails(record: ObjectRecord): Promise<PersonRecord> {
  const [others, profile] = await Promise.all([otherEmailsOf(record.id), getContactProfile(record.id)]);
  return { ...record, otherEmails: others.join(", "), jobTitle: profile?.jobTitle ?? null };
}

const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/**
 * Sépare l'entrée reçue : les champs de la fiche (pour le service générique) et les adresses, dont
 * l'unicité dans tout le CRM est vérifiée ici, avant toute écriture. Une adresse mal formée est
 * refusée par les descripteurs (principale) ou par `parseOtherEmails` (autres), en 400.
 */
type PreparedInput = { fields: Record<string, unknown>; otherEmails: string[] | null; profile: Record<string, unknown> | null };

async function prepareInput(input: unknown, exceptPersonId: string | null, currentEmail: unknown): Promise<PreparedInput> {
  const { otherEmails, ...rest } = asObject(input);
  /* Les clés du profil (entreprise, poste, rôle) vont au service du profil ; à la création, une valeur vide vaut « non renseigné » (dialogue à cinq champs sans entreprise choisie). */
  const profile = Object.fromEntries(Object.entries(rest).filter(([key, value]) => CONTACT_PROFILE_KEYS.includes(key) && !(exceptPersonId === null && blank(value))));
  const fields = Object.fromEntries(Object.entries(rest).filter(([key]) => !CONTACT_PROFILE_KEYS.includes(key)));
  refuseDerived(fields);
  const primary = primaryOf(fields, currentEmail);
  if (primary) await assertEmailAvailable(primary, exceptPersonId);
  const prepared: PreparedInput = { fields, otherEmails: null, profile: Object.keys(profile).length > 0 ? profile : null };
  if (otherEmails === undefined) return { ...prepared, otherEmails: exceptPersonId && primary ? await withoutPromoted(exceptPersonId, primary) : null };
  const addresses = parseOtherEmails(typeof otherEmails === "string" ? otherEmails : "", primary);
  await assertOtherEmailsAvailable(addresses, exceptPersonId);
  return { ...prepared, otherEmails: addresses };
}

/**
 * Les autres adresses d'une personne sans celle qui vient de passer principale ; `null` quand elles ne
 * changent pas. Sans ce retrait, une adresse promue resterait dans « Autres emails » et la fiche
 * l'afficherait deux fois (défaut d'audit 2.2).
 */
async function withoutPromoted(personId: string, primary: string): Promise<string[] | null> {
  const current = await otherEmailsOf(personId);
  return current.includes(primary) ? current.filter((address) => address !== primary) : null;
}

/** L'adresse principale normalisée après la modification : celle saisie, sinon celle enregistrée ; `null` si aucune. */
function primaryOf(fields: Record<string, unknown>, currentEmail: unknown): string | null {
  const value = "email" in fields ? fields.email : currentEmail;
  return typeof value === "string" && value.trim() !== "" ? normalizeEmail(value) : null;
}

/** Création en un appel (D7 : prénom, nom, email, entreprise, poste) : le profil contact est validé avant que la personne soit écrite, puis attaché. */
export async function createPerson(input: unknown, actor: Actor): Promise<PersonRecord> {
  const { fields, otherEmails, profile } = await prepareInput(input, null, null);
  const preparedProfile: PreparedContactProfile | null = profile ? await prepareContactProfile(profile, null) : null;
  const record = await createObject(TYPE, fields, actor);
  if (otherEmails) await setOtherEmails(record.id, otherEmails, actor);
  if (preparedProfile) await writeContactProfile(record.id, preparedProfile, actor);
  return getPerson(record.id);
}

export const getPerson = async (id: string): Promise<PersonRecord> => withEmails(await getObjectRecord(TYPE, id));

export async function updatePerson(id: string, patch: unknown, actor: Actor): Promise<PersonRecord> {
  const current = await getObjectRecord(TYPE, id);
  assertWritable(TYPE, current);
  const { fields, otherEmails, profile } = await prepareInput(patch, id, current.email);
  const preparedProfile = profile ? await prepareContactProfile(profile, await getContactProfile(id)) : null;
  if (Object.keys(fields).length > 0) await updateObject(TYPE, id, fields, actor);
  if (otherEmails) await setOtherEmails(id, otherEmails, actor);
  if (preparedProfile) await writeContactProfile(id, preparedProfile, actor);
  return getPerson(id);
}

export const listPersons = (): Promise<ObjectRecord[]> => listObjectRecords(TYPE);
