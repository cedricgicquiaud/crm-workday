/**
 * Profil consultant (D1) : au plus un par personne, il cohabite avec le profil contact et ne se
 * retire pas (`DELETE` → 405) ; il part avec la personne, par cascade de la base. Ce module est la
 * seule écriture de `consultant_profile`, de `consultant_module` et de `person.billing_company_id`.
 *
 * Trois choses vivent ailleurs que dans la table du profil, et c'est voulu : la société de
 * facturation est portée par la personne (pour la relation déclarée, D4), les modules sont une ligne
 * par module (pour l'unicité et le drapeau « certifié », D3), et « Profils » se recalcule depuis les
 * profils présents (D8). Les trois s'écrivent donc dans une seule transaction avec le profil : un
 * profil sans ses modules, ou une personne dont « Profils » ment, serait une fiche à moitié écrite.
 */
import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { company, consultantModule, consultantProfile, person } from "@/db/schema";
import { recordHistory } from "@/features/history/history";
import { serializeValue, validateValues, type FieldValue, type FieldValues } from "@/features/objects/fields";
import type { FieldDescriptor } from "@/features/objects/registry";
import { assertWritable, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { profilesLabel, recomputeProfiles, registerProfileSource } from "@/features/persons/profiles";
import { HttpError } from "@/lib/auth/session";
import { db, type Executor } from "@/lib/db";
import { CONSULTANT_INPUT_FIELDS, CONSULTANT_PROFILE_FIELDS } from "./schema";

const TYPE = "person";

/** Un profil tel que l'API le rend : ses champs, ses modules, et la société de facturation par son nom. */
export type ConsultantProfile = {
  personId: string;
  status: string;
  modules: string[];
  certifiedModules: string[];
  billingCompanyId: string | null;
  billingCompanyName: string | null;
  /** la société a été archivée après avoir été choisie : elle reste affichée, marquée (D4) */
  billingCompanyArchived: boolean;
  dailyCost: number | null;
  availableFrom: string | null;
  unavailable: "oui" | "non";
  unavailableReason: string | null;
  yearsExperience: number | null;
  languages: string | null;
  cvUrl: string | null;
};

const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

const descriptor = (key: string): FieldDescriptor => CONSULTANT_INPUT_FIELDS.find((field) => field.key === key)!;

/** Les compléments d'une personne sans profil consultant : les clés existent, vides — un filtre « est vide » doit pouvoir les lire. */
const EMPTY_COMPLEMENT: Record<string, unknown> = Object.fromEntries(CONSULTANT_PROFILE_FIELDS.map((field) => [field.key, field.type === "multilist" ? [] : null]));

type ProfileRow = {
  id: string;
  personId: string;
  status: string;
  dailyCost: string | null;
  availableFrom: string | null;
  unavailable: boolean;
  unavailableReason: string | null;
  yearsExperience: number | null;
  languages: string | null;
  cvUrl: string | null;
  billingCompanyId: string | null;
  billingCompanyName: string | null;
  billingCompanyArchived: Date | null;
};

/** Lit les lignes de profil de plusieurs personnes d'un coup : une liste ne fait pas une requête par fiche. */
async function profileRows(personIds: readonly string[], exec: Executor = db): Promise<ProfileRow[]> {
  if (personIds.length === 0) return [];
  return exec
    .select({
      id: consultantProfile.id,
      personId: consultantProfile.personId,
      status: consultantProfile.status,
      dailyCost: consultantProfile.dailyCost,
      availableFrom: consultantProfile.availableFrom,
      unavailable: consultantProfile.unavailable,
      unavailableReason: consultantProfile.unavailableReason,
      yearsExperience: consultantProfile.yearsExperience,
      languages: consultantProfile.languages,
      cvUrl: consultantProfile.cvUrl,
      billingCompanyId: person.billingCompanyId,
      billingCompanyName: company.name,
      billingCompanyArchived: company.archivedAt,
    })
    .from(consultantProfile)
    .innerJoin(person, eq(person.id, consultantProfile.personId))
    .leftJoin(company, eq(company.id, person.billingCompanyId))
    .where(inArray(consultantProfile.personId, [...personIds]));
}

/** Modules de plusieurs profils, retenus et certifiés, dans l'ordre de la liste fermée. */
async function modulesOf(profileIds: readonly string[], exec: Executor = db): Promise<Map<string, { modules: string[]; certified: string[] }>> {
  const byProfile = new Map<string, { modules: string[]; certified: string[] }>();
  if (profileIds.length === 0) return byProfile;
  const rows = await exec.select({ profileId: consultantModule.profileId, module: consultantModule.module, certified: consultantModule.certified }).from(consultantModule).where(inArray(consultantModule.profileId, [...profileIds]));
  const rank = new Map(descriptor("modules").values!.map((value, index) => [value.value, index]));
  for (const row of [...rows].sort((a, b) => (rank.get(a.module) ?? Infinity) - (rank.get(b.module) ?? Infinity))) {
    const entry = byProfile.get(row.profileId) ?? { modules: [], certified: [] };
    entry.modules.push(row.module);
    if (row.certified) entry.certified.push(row.module);
    byProfile.set(row.profileId, entry);
  }
  return byProfile;
}

function toProfile(row: ProfileRow, modules: { modules: string[]; certified: string[] } | undefined): ConsultantProfile {
  return {
    personId: row.personId,
    status: row.status,
    modules: modules?.modules ?? [],
    certifiedModules: modules?.certified ?? [],
    billingCompanyId: row.billingCompanyId,
    billingCompanyName: row.billingCompanyName,
    billingCompanyArchived: row.billingCompanyArchived != null,
    dailyCost: row.dailyCost === null ? null : Number(row.dailyCost),
    availableFrom: row.availableFrom,
    unavailable: row.unavailable ? "oui" : "non",
    unavailableReason: row.unavailableReason,
    yearsExperience: row.yearsExperience,
    languages: row.languages,
    cvUrl: row.cvUrl,
  };
}

/** Lecture directe du profil, sans mémoire : celle d'une écriture, qui relit ce qu'elle vient d'écrire. Un écran passe par `getConsultantProfile`. */
export async function readConsultantProfile(personId: string, exec: Executor = db): Promise<ConsultantProfile | null> {
  const [row] = await profileRows([personId], exec);
  if (!row) return null;
  return toProfile(row, (await modulesOf([row.id], exec)).get(row.id));
}

/**
 * Une lecture du profil par requête (`cache` de React) : la fiche le demande pour sa section et la
 * palette pour son sous-titre, la base n'est interrogée qu'une fois. L'écriture, elle, passe par
 * `readConsultantProfile` : mémorisée, la relecture qui suit l'écriture rendrait le profil d'avant.
 */
export const getConsultantProfile = cache((personId: string) => readConsultantProfile(personId));

/**
 * Complète des personnes de leurs champs de profil consultant (`attach` du registre serveur) : à
 * partir de là, « Statut », « Modules » ou « Coût journalier » se lisent comme des colonnes de la
 * personne — colonnes de liste, filtres, tris et historique ne voient pas la différence.
 */
export async function attachConsultantProfiles(records: readonly ObjectRecord[]): Promise<ObjectRecord[]> {
  if (records.length === 0) return [...records];
  const rows = await profileRows(records.map((record) => record.id));
  const modules = await modulesOf(rows.map((row) => row.id));
  const byPerson = new Map(rows.map((row) => [row.personId, toProfile(row, modules.get(row.id))]));
  return records.map((record) => {
    const profile = byPerson.get(record.id);
    if (!profile) return { ...record, ...EMPTY_COMPLEMENT };
    const { personId: _personId, billingCompanyArchived: _archived, billingCompanyName, ...fields } = profile;
    return { ...record, ...fields, billingCompanyName };
  });
}

/** Le profil consultant compte dans « Profils » (D8), après le contact : la personne le porte dès qu'une ligne existe. */
registerProfileSource({
  value: "consultant",
  order: 20,
  holds: async (personId, exec) => (await exec.select({ id: consultantProfile.id }).from(consultantProfile).where(eq(consultantProfile.personId, personId)).limit(1)).length > 0,
});

/** Valeurs validées d'un profil, prêtes à écrire ; rien n'a encore été écrit. */
export type PreparedConsultantProfile = { values: FieldValues };

/**
 * Valide l'entrée du profil contre ses descripteurs avant toute écriture : à la création (`existing`
 * nul) le statut est obligatoire, en modification seuls les champs présents comptent.
 */
export function prepareConsultantProfile(input: unknown, existing: ConsultantProfile | null): PreparedConsultantProfile {
  const { values, errors } = validateValues(CONSULTANT_INPUT_FIELDS, input, { partial: existing !== null });
  if (Object.keys(errors).length > 0) throw invalid(errors);
  return { values };
}

/** Colonnes de `consultant_profile` que porte une valeur validée ; les autres clés vivent ailleurs. */
const COLUMNS: Readonly<Record<string, (value: FieldValue) => unknown>> = {
  status: (value) => String(value),
  dailyCost: (value) => (value === null ? null : String(value)),
  availableFrom: (value) => value,
  unavailable: (value) => value === "oui",
  unavailableReason: (value) => value,
  yearsExperience: (value) => value,
  languages: (value) => value,
  cvUrl: (value) => value,
};

/** Ce que la ligne de profil portera après ce PATCH, colonne par colonne. */
function rowPatch(values: FieldValues): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => key in COLUMNS).map(([key, value]) => [key, COLUMNS[key](value)]));
}

type Change = { field: string; oldValue: string | null; newValue: string | null };

/** Ce qui change entre le profil enregistré et les valeurs reçues, écrit comme un lecteur le lit (D13). */
function fieldChanges(existing: ConsultantProfile | null, values: FieldValues): Change[] {
  return Object.keys(values)
    .filter((key) => key in COLUMNS || key === "modules" || key === "certifiedModules")
    .map((key) => {
      const field = descriptor(key);
      return { field: key, oldValue: existing ? serializeValue(field, existing[key as keyof ConsultantProfile]) : null, newValue: serializeValue(field, values[key]) };
    })
    .filter((change) => change.oldValue !== change.newValue);
}

/** Écrit un profil validé (création ou modification), ses modules, sa société et « Profils », d'un bloc. */
export async function writeConsultantProfile(personId: string, prepared: PreparedConsultantProfile, actor: Actor): Promise<ConsultantProfile> {
  const current = await getObjectRecord(TYPE, personId);
  assertWritable(TYPE, current);
  const existing = await readConsultantProfile(personId);
  const { values } = prepared;
  const changes = fieldChanges(existing, values);
  const patch = rowPatch(values);
  const now = new Date();

  if (!existing) {
    const before = profilesLabel((current.profiles as string[] | undefined) ?? []);
    let after: string[] = [];
    await db.transaction(async (tx) => {
      await tx.insert(consultantProfile).values({ personId, status: String(values.status), ...patch });
      await tx.update(person).set({ updatedAt: now }).where(eq(person.id, personId));
      after = await recomputeProfiles(personId, tx);
    });
    changes.unshift({ field: "profiles", oldValue: before, newValue: profilesLabel(after) });
  } else if (changes.length > 0) {
    await db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) await tx.update(consultantProfile).set({ ...patch, updatedAt: now }).where(eq(consultantProfile.personId, personId));
      await tx.update(person).set({ updatedAt: now }).where(eq(person.id, personId));
    });
  }

  await recordHistory(changes.map((change) => ({ objectType: TYPE, objectId: personId, action: "modifiee" as const, ...change, authorId: actor.id })));
  return (await readConsultantProfile(personId))!;
}

/** Ajoute (au premier statut) ou modifie le profil consultant d'une personne : 400 données invalides, 404 personne inconnue, 409 personne archivée. */
export async function upsertConsultantProfile(personId: string, input: unknown, actor: Actor): Promise<ConsultantProfile> {
  const current = await getObjectRecord(TYPE, personId);
  assertWritable(TYPE, current);
  const existing = await readConsultantProfile(personId);
  return writeConsultantProfile(personId, prepareConsultantProfile(input, existing), actor);
}

/** Le profil consultant ne se retire pas en V1 (D1) : la demande est refusée, jamais exécutée à moitié. */
export function refuseProfileRemoval(): never {
  throw new HttpError(405, "retrait_impossible", "Un profil consultant ne se retire pas : il part avec la personne.");
}

/** Personnes qui portent un profil consultant, parmi celles qu'on lui passe (fusion, listes). */
export async function personsWithConsultantProfile(personIds: readonly string[], exec: Executor = db): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const rows = await exec.select({ personId: consultantProfile.personId }).from(consultantProfile).where(and(inArray(consultantProfile.personId, [...personIds])));
  return new Set(rows.map((row) => row.personId));
}
