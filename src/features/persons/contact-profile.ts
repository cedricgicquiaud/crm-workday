/**
 * Profil contact (D3) : au plus un par personne ; entreprise de rattachement obligatoire et jamais
 * archivée, poste, rôle dans la décision. L'entreprise est portée par la personne (`company_id`)
 * pour la relation générique ; le profil porte le poste et le rôle. Le champ dérivé Profils de la
 * personne passe à « contact » quand le profil existe. Chaque changement entre dans l'historique
 * de la personne, l'entreprise par son nom (l'ancienne y reste, D3).
 */
import { eq } from "drizzle-orm";
import { company, contactProfile, person } from "@/db/schema";
import { recordHistory } from "@/features/history/history";
import { validateValues, type FieldValues } from "@/features/objects/fields";
import type { FieldDescriptor } from "@/features/objects/registry";
import { assertWritable, getObjectRecord, type Actor } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DECISION_ROLES, DEFAULT_DECISION_ROLE, JOB_TITLE_FIELD } from "./schema";

const TYPE = "person";

export type ContactProfile = { personId: string; companyId: string; companyName: string; jobTitle: string | null; decisionRole: string };

/** Descripteurs du profil : mêmes règles à l'API et à l'écran (libellés, liste fermée des rôles). */
export const CONTACT_PROFILE_FIELDS: readonly FieldDescriptor[] = [
  { key: "companyId", label: "Entreprise", type: "text", required: true, order: 10 },
  JOB_TITLE_FIELD,
  { key: "decisionRole", label: "Rôle dans la décision", type: "list", values: DECISION_ROLES, required: true, default: DEFAULT_DECISION_ROLE, order: 30 },
];

export const CONTACT_PROFILE_KEYS: readonly string[] = CONTACT_PROFILE_FIELDS.map((field) => field.key);

const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompanyRow = { id: string; name: string; archivedAt: Date | null };

/** L'entreprise de rattachement doit exister (400 sinon) et ne pas être archivée (409, D21). */
async function loadCompany(id: string): Promise<CompanyRow> {
  const [row] = UUID.test(id) ? await db.select({ id: company.id, name: company.name, archivedAt: company.archivedAt }).from(company).where(eq(company.id, id)).limit(1) : [];
  if (!row) throw invalid({ companyId: "« Entreprise » ne désigne aucune entreprise." });
  if (row.archivedAt) throw new HttpError(409, "entreprise_archivee", `Entreprise archivée : « ${row.name} » ne reçoit plus de contact.`, { companyId: row.id });
  return row;
}

async function companyNameOf(id: string | null): Promise<string | null> {
  if (!id) return null;
  const [row] = await db.select({ name: company.name }).from(company).where(eq(company.id, id)).limit(1);
  return row?.name ?? null;
}

export async function getContactProfile(personId: string): Promise<ContactProfile | null> {
  const [row] = await db
    .select({ personId: contactProfile.personId, companyId: person.companyId, companyName: company.name, jobTitle: contactProfile.jobTitle, decisionRole: contactProfile.decisionRole })
    .from(contactProfile)
    .innerJoin(person, eq(person.id, contactProfile.personId))
    .leftJoin(company, eq(company.id, person.companyId))
    .where(eq(contactProfile.personId, personId))
    .limit(1);
  if (!row) return null;
  return { ...row, companyId: row.companyId ?? "", companyName: row.companyName ?? "" };
}

/** Valeurs validées d'un profil et l'entreprise chargée ; rien n'est écrit. */
export type PreparedContactProfile = { values: FieldValues; company: CompanyRow | null };

/**
 * Valide l'entrée d'un profil avant toute écriture : à la création (`existing` nul) l'entreprise est
 * obligatoire et le rôle prend sa valeur par défaut ; en modification seuls les champs présents comptent.
 */
export async function prepareContactProfile(input: unknown, existing: ContactProfile | null): Promise<PreparedContactProfile> {
  const { values, errors } = validateValues(CONTACT_PROFILE_FIELDS, input, { partial: existing !== null });
  if (Object.keys(errors).length > 0) throw invalid(errors);
  if (existing === null && values.decisionRole == null) values.decisionRole = DEFAULT_DECISION_ROLE;
  const companyRow = typeof values.companyId === "string" ? await loadCompany(values.companyId) : null;
  return { values, company: companyRow };
}

const roleLabel = (value: unknown): string | null => DECISION_ROLES.find((role) => role.value === value)?.label ?? (value == null ? null : String(value));

/** Écrit un profil préparé (création ou modification) et son historique ; la personne doit être modifiable. */
export async function writeContactProfile(personId: string, prepared: PreparedContactProfile, actor: Actor): Promise<ContactProfile> {
  const current = await getObjectRecord(TYPE, personId);
  assertWritable(TYPE, current);
  const existing = await getContactProfile(personId);
  const { values, company: target } = prepared;
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const now = new Date();

  if (!existing) {
    if (!target) throw invalid({ companyId: "« Entreprise » est obligatoire." });
    changes.push({ field: "profiles", oldValue: String(current.profiles), newValue: "contact" });
    await db.insert(contactProfile).values({ personId, jobTitle: (values.jobTitle as string | null) ?? null, decisionRole: String(values.decisionRole) });
    await db.update(person).set({ companyId: target.id, profiles: "contact", updatedAt: now }).where(eq(person.id, personId));
    changes.push({ field: "companyId", oldValue: await companyNameOf(current.companyId as string | null), newValue: target.name });
    changes.push({ field: "jobTitle", oldValue: null, newValue: (values.jobTitle as string | null) ?? null });
    changes.push({ field: "decisionRole", oldValue: null, newValue: roleLabel(values.decisionRole) });
  } else {
    const patch: Partial<{ jobTitle: string | null; decisionRole: string }> = {};
    if ("jobTitle" in values && (values.jobTitle ?? null) !== existing.jobTitle) {
      patch.jobTitle = (values.jobTitle as string | null) ?? null;
      changes.push({ field: "jobTitle", oldValue: existing.jobTitle, newValue: patch.jobTitle });
    }
    if (typeof values.decisionRole === "string" && values.decisionRole !== existing.decisionRole) {
      patch.decisionRole = values.decisionRole;
      changes.push({ field: "decisionRole", oldValue: roleLabel(existing.decisionRole), newValue: roleLabel(values.decisionRole) });
    }
    if (target && target.id !== existing.companyId) {
      await db.update(person).set({ companyId: target.id, updatedAt: now }).where(eq(person.id, personId));
      changes.push({ field: "companyId", oldValue: existing.companyName, newValue: target.name });
    }
    if (Object.keys(patch).length > 0) {
      await db.update(contactProfile).set({ ...patch, updatedAt: now }).where(eq(contactProfile.personId, personId));
      await db.update(person).set({ updatedAt: now }).where(eq(person.id, personId));
    }
  }
  await recordHistory(changes.filter((c) => c.oldValue !== c.newValue).map((c) => ({ objectType: TYPE, objectId: personId, action: "modifiee" as const, ...c, authorId: actor.id })));
  return (await getContactProfile(personId))!;
}

/** Ajoute ou modifie le profil contact d'une personne : 400 sans entreprise à la création, 409 entreprise archivée ou personne archivée. */
export async function upsertContactProfile(personId: string, input: unknown, actor: Actor): Promise<ContactProfile> {
  const current = await getObjectRecord(TYPE, personId);
  assertWritable(TYPE, current);
  const prepared = await prepareContactProfile(input, await getContactProfile(personId));
  return writeContactProfile(personId, prepared, actor);
}
