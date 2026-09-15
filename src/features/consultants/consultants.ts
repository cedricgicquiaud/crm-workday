/**
 * Création d'un consultant en un geste (D12) : la personne et son profil naissent ensemble. Les deux
 * écritures tiennent dans une seule transaction — une personne créée par un « Nouveau consultant »
 * dont le profil a échoué serait un déchet que personne ne saurait rattraper, et une adresse email
 * consommée pour rien.
 *
 * Tout est validé avant la première écriture : les champs de la personne par ses descripteurs, ceux
 * du profil par les siens, l'unicité de l'adresse dans tout le CRM. Un refus ne crée donc rien.
 */
import { getList, getObject } from "@/features/objects/registry";
import { createObject, type Actor, type ObjectRecord } from "@/features/objects/service";
import { assertEmailAvailable } from "@/features/persons/emails";
import { getPerson, type PersonRecord } from "@/features/persons/persons";
import { recomputeProfiles } from "@/features/persons/profiles";
import { normalizeEmail } from "@/features/persons/schema";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { insertConsultantProfile, prepareConsultantProfile, type PreparedConsultantProfile } from "./consultant-profile";
import { CONSULTANTS_LIST, CONSULTANT_PROFILE_KEYS } from "./schema";

const TYPE = "person";

/** Ce que la création écrira : les champs de la personne d'un côté, ceux de son profil de l'autre. */
export type PreparedConsultant = { fields: Record<string, unknown>; profile: PreparedConsultantProfile };

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

/** Les champs que le dialogue « Nouveau consultant » déclare (D12) : la liste en est la seule source. */
function creationKeys(): readonly string[] {
  const create = getList(CONSULTANTS_LIST).create;
  return (create ? create.fields : undefined) ?? getObject(TYPE).quickCreate ?? [];
}

/**
 * Refuse (400 par champ) toute clé que le dialogue ne déclare pas. Sans ce refus, une clé sans place
 * où aller — le poste, les autres adresses, un champ du profil qui n'est pas au dialogue — partait à
 * la création de la personne, qui l'ignorait : la réponse disait 201 et rien n'était enregistré.
 */
function refuseUnknownKeys(raw: Record<string, unknown>): void {
  const declared = new Set(creationKeys());
  const label = (key: string) => getObject(TYPE).fields.find((field) => field.key === key)?.label ?? key;
  const errors = Object.fromEntries(
    Object.keys(raw)
      .filter((key) => !declared.has(key))
      .map((key) => [key, `« ${label(key)} » ne se saisit pas à la création d'un consultant : il se règle sur sa fiche.`]),
  );
  if (Object.keys(errors).length > 0) throw new HttpError(400, "champ_hors_creation", Object.values(errors)[0], { fields: errors });
}

/**
 * Sépare et valide l'entrée reçue, sans rien écrire : les clés du profil vont à ses descripteurs (le
 * statut y est obligatoire), les autres à la personne. L'unicité de l'adresse est vérifiée par la
 * création de la personne, dans la transaction.
 */
export async function prepareConsultantCreation(input: unknown): Promise<PreparedConsultant> {
  const raw = asObject(input);
  refuseUnknownKeys(raw);
  const profile = Object.fromEntries(Object.entries(raw).filter(([key]) => CONSULTANT_PROFILE_KEYS.includes(key)));
  const fields = Object.fromEntries(Object.entries(raw).filter(([key]) => !CONSULTANT_PROFILE_KEYS.includes(key)));
  const prepared: PreparedConsultant = { fields, profile: prepareConsultantProfile(profile, null) };
  /* Une adresse est unique dans tout le CRM, autres adresses comprises (feature 2, D19) : la règle est
     celle des personnes, vérifiée avant la première écriture, et le refus nomme la personne qui la porte. */
  if (typeof fields.email === "string" && fields.email.trim() !== "") await assertEmailAvailable(normalizeEmail(fields.email), null);
  return prepared;
}

/** Écrit la personne et son profil dans une seule transaction, puis relit la fiche complète. */
export async function writeConsultantCreation(prepared: PreparedConsultant, actor: Actor): Promise<PersonRecord> {
  let record: ObjectRecord | null = null;
  await db.transaction(async (tx) => {
    record = await createObject(TYPE, prepared.fields, actor, tx);
    await insertConsultantProfile(tx, record.id, prepared.profile, actor);
    await recomputeProfiles(record.id, tx);
  });
  return getPerson(record!.id);
}

/** Crée une personne et son profil consultant : 400 par champ, 409 adresse déjà portée ou société archivée. */
export async function createConsultant(input: unknown, actor: Actor): Promise<PersonRecord> {
  return writeConsultantCreation(await prepareConsultantCreation(input), actor);
}
