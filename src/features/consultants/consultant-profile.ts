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
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { company, consultantModule, consultantProfile, person } from "@/db/schema";
import { recordHistory } from "@/features/history/history";
import { serializeValue, setLabels, validateValues, type FieldValue, type FieldValues } from "@/features/objects/fields";
import type { FieldDescriptor } from "@/features/objects/registry";
import { assertWritable, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { profilesLabel, recomputeProfiles, registerProfileSource } from "@/features/persons/profiles";
import { HttpError } from "@/lib/auth/session";
import { db, type Executor } from "@/lib/db";
import { COMPANY_TYPES } from "@/features/companies/schema";
import { RECORD_OPTIONS_LIMIT } from "@/features/objects/service";
import { BILLING_COMPANY_FIELD, BILLING_COMPANY_TYPE, CONSULTANT_INPUT_FIELDS, CONSULTANT_PROFILE_FIELDS, STATUS_SUBJECT } from "./schema";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const typeLabel = (value: string) => COMPANY_TYPES.find((entry) => entry.value === value)?.label.toLowerCase() ?? value;

export type BillingCompanyOption = { id: string; name: string };

/**
 * Entreprises proposées comme société de facturation pour un statut (D4) : celles du type imposé,
 * jamais une archivée, bornées comme tout sélecteur. Un salarié n'en a pas : le sélecteur est vide,
 * et la section ne le montre pas.
 */
export async function listBillingCompanyOptions(status: string, { limit = RECORD_OPTIONS_LIMIT } = {}): Promise<BillingCompanyOption[]> {
  const expected = BILLING_COMPANY_TYPE[status] ?? null;
  if (!expected) return [];
  const rows = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(and(eq(company.type, expected), isNull(company.archivedAt)))
    .orderBy(desc(company.updatedAt), asc(company.id))
    .limit(limit);
  return rows;
}

type BillingCompany = { id: string; name: string; type: string; archived: boolean };

/** L'entreprise désignée : 400 si elle n'existe pas, 409 si elle est archivée (D4). */
async function loadBillingCompany(id: string): Promise<BillingCompany> {
  const [row] = UUID.test(id) ? await db.select({ id: company.id, name: company.name, type: company.type, archivedAt: company.archivedAt }).from(company).where(eq(company.id, id)).limit(1) : [];
  if (!row) throw invalid({ billingCompanyId: `« ${BILLING_COMPANY_FIELD.label} » ne désigne aucune entreprise.` });
  if (row.archivedAt) throw new HttpError(409, "entreprise_archivee", `Entreprise archivée : « ${row.name} » ne facture plus de consultant.`, { billingCompanyId: row.id });
  return { id: row.id, name: row.name, type: row.type, archived: false };
}

/**
 * La société de facturation après ce PATCH, vérifiée contre le statut qui en résulte (D4). Changer
 * de statut quand la société ne convient plus est refusé sur le champ « Statut », avec ce qu'il faut
 * faire : retirer la société d'abord. Deux gestes, donc deux lignes d'historique.
 */
async function resolveBillingCompany(existing: ConsultantProfile | null, values: FieldValues): Promise<{ id: string | null; name: string | null } | null> {
  const status = (values.status as string | undefined) ?? existing?.status ?? "";
  const expected = BILLING_COMPANY_TYPE[status] ?? null;
  const subject = STATUS_SUBJECT[status] ?? "Ce consultant";
  const given = "billingCompanyId" in values;
  const target = given && typeof values.billingCompanyId === "string" ? await loadBillingCompany(values.billingCompanyId) : null;
  const kept = given ? null : existing?.billingCompanyId ?? null;

  if (target) {
    if (!expected) throw invalid({ billingCompanyId: `${subject} n'a pas de société de facturation.` });
    if (target.type !== expected) throw invalid({ billingCompanyId: `${subject} est facturé par une ${typeLabel(expected)} : « ${target.name} » est un ${typeLabel(target.type)}.` });
    return { id: target.id, name: target.name };
  }
  /* La société déjà enregistrée ne convient plus au nouveau statut : c'est le statut qu'on refuse, et le message dit par quoi commencer. */
  if (kept && BILLING_COMPANY_TYPE[status] !== BILLING_COMPANY_TYPE[existing?.status ?? status]) {
    const message = expected ? `${subject} est facturé par une ${typeLabel(expected)} : retirez d'abord « ${existing?.billingCompanyName} ».` : `${subject} n'a pas de société de facturation : retirez d'abord « ${existing?.billingCompanyName} ».`;
    throw invalid({ status: message });
  }
  return given ? { id: null, name: null } : null;
}

/** Les modules qu'un profil portera après ce PATCH, et ceux qui y seront certifiés (D3). */
type ResolvedModules = { modules: string[]; certifiedModules: string[] };

/** Les modules dans l'ordre de la liste fermée : deux consultants se comparent, la saisie ne dicte pas l'ordre. */
function inListOrder(modules: readonly string[]): string[] {
  const rank = new Map(descriptor("modules").values!.map((value, index) => [value.value, index]));
  return [...new Set(modules)].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
}

const moduleLabel = (value: string) => descriptor("modules").values?.find((entry) => entry.value === value)?.label ?? value;

/**
 * Les modules et les certifications après ce PATCH. Une certification ne survit pas au module
 * qu'elle porte : retirer un module retire la sienne. Mais certifier un module qu'on ne retient pas
 * est un refus, pas un silence (D3) — sinon la saisie répondrait 200 sans rien enregistrer.
 */
function resolveModules(existing: ConsultantProfile | null, values: FieldValues): ResolvedModules {
  const modules = inListOrder((values.modules as string[] | undefined) ?? existing?.modules ?? []);
  const claimed = values.certifiedModules as string[] | undefined;
  if (claimed) {
    const orphan = claimed.find((module) => !modules.includes(module));
    if (orphan) throw invalid({ certifiedModules: `« Certifié sur » ne porte que des modules retenus : « ${moduleLabel(orphan)} » ne l'est pas.` });
    return { modules, certifiedModules: inListOrder(claimed) };
  }
  return { modules, certifiedModules: inListOrder((existing?.certifiedModules ?? []).filter((module) => modules.includes(module))) };
}

/** Écrit les modules d'un profil : ceux qui partent, ceux qui arrivent, et le drapeau « certifié » de ceux qui restent. */
async function writeModules(exec: Executor, profileId: string, resolved: ResolvedModules): Promise<void> {
  const rows = await exec.select({ id: consultantModule.id, module: consultantModule.module, certified: consultantModule.certified }).from(consultantModule).where(eq(consultantModule.profileId, profileId));
  const dropped = rows.filter((row) => !resolved.modules.includes(row.module)).map((row) => row.id);
  if (dropped.length > 0) await exec.delete(consultantModule).where(inArray(consultantModule.id, dropped));
  for (const module of resolved.modules) {
    const certified = resolved.certifiedModules.includes(module);
    const row = rows.find((candidate) => candidate.module === module);
    if (!row) await exec.insert(consultantModule).values({ profileId, module, certified });
    else if (row.certified !== certified) await exec.update(consultantModule).set({ certified }).where(eq(consultantModule.id, row.id));
  }
}

/**
 * La disponibilité après ce PATCH (D6). Un motif sans la case n'a pas de sens : il est refusé, pas
 * enregistré en silence. Décocher la case efface le motif — il ne reste pas sur un consultant
 * redevenu disponible. Rend `null` quand le PATCH ne parle ni de la case ni du motif.
 */
function resolveAvailability(existing: ConsultantProfile | null, values: FieldValues): FieldValues | null {
  const givenReason = "unavailableReason" in values;
  if (!("unavailable" in values) && !givenReason) return null;
  const unavailable = (values.unavailable as string | undefined) ?? existing?.unavailable ?? "non";
  if (unavailable !== "oui") {
    if (givenReason && values.unavailableReason !== null) throw invalid({ unavailableReason: `« ${descriptor("unavailableReason").label} » ne se renseigne que si « ${descriptor("unavailable").label} » est coché.` });
    return { unavailable, unavailableReason: null };
  }
  return { unavailable, unavailableReason: givenReason ? values.unavailableReason : existing?.unavailableReason ?? null };
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
  const resolved = resolveModules(existing, values);
  const billing = await resolveBillingCompany(existing, values);
  /* Les valeurs telles qu'elles seront enregistrées : celles reçues, complétées de ce que les règles en déduisent. */
  const effective: FieldValues = { ...values, ...resolved, ...resolveAvailability(existing, values) };
  /* Les modules se comparent toujours : retirer un module retire sa certification, même quand le PATCH ne parle pas d'elle. */
  const changes = fieldChanges(existing, effective);
  const changed = new Set(changes.map((change) => change.field));
  /* En modification, seules les colonnes qui changent sont écrites : un PATCH qui ne change rien n'écrit rien. */
  const patch = rowPatch(existing ? Object.fromEntries(Object.entries(effective).filter(([key]) => changed.has(key))) : effective);
  const movedModules = changes.some((change) => change.field === "modules" || change.field === "certifiedModules");
  /* La société s'historise par son nom : un identifiant ne se lit pas (D13). */
  if (billing && billing.id !== (existing?.billingCompanyId ?? null)) changes.push({ field: BILLING_COMPANY_FIELD.key, oldValue: existing?.billingCompanyName ?? null, newValue: billing.name });
  const now = new Date();

  if (!existing) {
    const before = profilesLabel((current.profiles as string[] | undefined) ?? []);
    let after: string[] = [];
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(consultantProfile).values({ personId, status: String(effective.status), ...patch }).returning({ id: consultantProfile.id });
      await writeModules(tx, row.id, resolved);
      await tx.update(person).set({ ...(billing ? { billingCompanyId: billing.id } : {}), updatedAt: now }).where(eq(person.id, personId));
      after = await recomputeProfiles(personId, tx);
    });
    changes.unshift({ field: "profiles", oldValue: before, newValue: profilesLabel(after) });
  } else if (changes.length > 0) {
    await db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) await tx.update(consultantProfile).set({ ...patch, updatedAt: now }).where(eq(consultantProfile.personId, personId));
      if (movedModules) await writeModules(tx, await profileIdOf(personId, tx), resolved);
      await tx.update(person).set({ ...(billing ? { billingCompanyId: billing.id } : {}), updatedAt: now }).where(eq(person.id, personId));
    });
  }

  await recordHistory(changes.map((change) => ({ objectType: TYPE, objectId: personId, action: "modifiee" as const, ...change, authorId: actor.id })));
  return (await readConsultantProfile(personId))!;
}

/** Identifiant de la ligne de profil d'une personne ; elle existe, l'appelant vient de la lire. */
async function profileIdOf(personId: string, exec: Executor): Promise<string> {
  const [row] = await exec.select({ id: consultantProfile.id }).from(consultantProfile).where(eq(consultantProfile.personId, personId)).limit(1);
  return row.id;
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

/**
 * Ce qu'un consultant dit de lui dans une recherche (D14) : « Freelance · HCM, Integration ». Il
 * prime sur l'entreprise du profil contact et sur l'adresse email — c'est par son statut et ses
 * modules qu'on cherche un consultant. Rien pour une personne qui n'en est pas un.
 */
export async function consultantSubtitles(personIds: readonly string[]): Promise<Map<string, string>> {
  const rows = await profileRows(personIds);
  const modules = await modulesOf(rows.map((row) => row.id));
  const statusLabel = (value: string) => descriptor("status").values?.find((entry) => entry.value === value)?.label ?? value;
  return new Map(
    rows.map((row) => {
      const retained = modules.get(row.id)?.modules ?? [];
      const labels = retained.length === 0 ? "" : ` · ${setLabels(descriptor("modules"), retained).join(", ")}`;
      return [row.personId, `${statusLabel(row.status)}${labels}`];
    }),
  );
}

/** Personnes qui portent un profil consultant, parmi celles qu'on lui passe (fusion, listes). */
export async function personsWithConsultantProfile(personIds: readonly string[], exec: Executor = db): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const rows = await exec.select({ personId: consultantProfile.personId }).from(consultantProfile).where(and(inArray(consultantProfile.personId, [...personIds])));
  return new Set(rows.map((row) => row.personId));
}
