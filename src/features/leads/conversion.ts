/**
 * Conversion d'un lead (D14 à D17) : une personne avec son profil contact et une entreprise, créées
 * ou retrouvées, puis le lead « converti » qui les désigne. Toutes ces écritures et leur historique
 * tiennent dans une seule transaction, ouverte sur le lead verrouillé (`FOR UPDATE`) : deux conversions
 * simultanées n'en réussissent qu'une, et un échec en chemin ne laisse rien derrière lui.
 * La conversion réutilise les écritures des personnes : la création générique et le profil contact.
 */
import { eq } from "drizzle-orm";
import { lead } from "@/db/schema";
import { recordHistory, type HistoryInput } from "@/features/history/history";
import { validateValues } from "@/features/objects/fields";
import { createObject, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { writeContactProfile } from "@/features/persons/contact-profile";
import { DECISION_ROLE_FIELD, DEFAULT_DECISION_ROLE, JOB_TITLE_FIELD, PERSON_FIELDS } from "@/features/persons/schema";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CONVERTED_STAGE, OPEN_STAGES } from "./schema";

const TYPE = "lead";

/** L'action d'historique que la conversion écrit sur le lead, et que le registre du lead fait lire « Converti en … ». */
export const CONVERSION_ACTION = "conversion";

/** Ce que la conversion rend : le lead et les deux fiches qu'il désigne désormais. */
export type ConversionResult = { leadId: string; personId: string; companyId: string };

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {});

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** 400 dont le message est la première erreur, et toutes les erreurs par champ pour la fenêtre. */
const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

/** Ce que la fenêtre a confirmé, validé contre les descripteurs de la personne et du profil, avant toute écriture. */
type Plan = { firstName: string; lastName: string; companyName: string; jobTitle: string | null; decisionRole: string };

const personField = (key: string) => PERSON_FIELDS.find((field) => field.key === key)!;

/** Valide l'entrée de la fenêtre : prénom, nom et entreprise obligatoires pour une nouvelle personne, rôle dans sa liste (400 par champ). */
function planOf(current: ObjectRecord, body: Record<string, unknown>): Plan {
  const pick = (key: string) => (key in body ? body[key] : current[key]);
  const { values, errors } = validateValues(
    [personField("firstName"), personField("lastName"), { ...personField("lastName"), key: "companyName", label: "Entreprise" }, JOB_TITLE_FIELD, { ...DECISION_ROLE_FIELD, required: false }],
    { firstName: pick("firstName") ?? "", lastName: pick("lastName") ?? "", companyName: pick("companyName") ?? "", jobTitle: pick("jobTitle"), decisionRole: body.decisionRole },
    { partial: false },
  );
  if (Object.keys(errors).length > 0) throw invalid(errors);
  return {
    firstName: String(values.firstName),
    lastName: String(values.lastName),
    companyName: String(values.companyName),
    jobTitle: text(values.jobTitle),
    decisionRole: text(values.decisionRole) ?? DEFAULT_DECISION_ROLE,
  };
}

/** 409 qui dit pourquoi un lead ne se convertit pas : archivé, déjà converti, écarté (D14). */
function assertConvertible(record: { stage: unknown; archivedAt: unknown }, id: string): void {
  if (record.archivedAt) throw new HttpError(409, "fiche_archivee", "Lead archivé : il ne se convertit pas. Restaurez-le d'abord.", { id });
  if (record.stage === CONVERTED_STAGE) throw new HttpError(409, "deja_converti", "Ce lead est déjà converti.", { id });
  if (!OPEN_STAGES.includes(String(record.stage))) throw new HttpError(409, "avancement_incompatible", "Lead écarté : rouvrez-le avant de le convertir.", { id });
}

/**
 * Convertit un lead (D16) : 404 inconnu, 400 par champ, 409 archivé, converti ou écarté. Tout
 * s'écrit dans une transaction ouverte sur le lead verrouillé, relu sous le verrou.
 */
export async function convertLead(id: string, input: unknown, actor: Actor): Promise<ConversionResult> {
  const current = await getObjectRecord(TYPE, id);
  assertConvertible(current, current.id);
  const plan = planOf(current, asObject(input));
  const ownerId = String(current.ownerId);

  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ stage: lead.stage, archivedAt: lead.archivedAt }).from(lead).where(eq(lead.id, current.id)).for("update");
    assertConvertible(locked, current.id);

    const createdCompany = await createObject("company", { name: plan.companyName, type: "prospect", ownerId }, actor, tx);
    const companyId = createdCompany.id;
    const companyName = String(createdCompany.name);

    const createdPerson = await createObject(
      "person",
      { firstName: plan.firstName, lastName: plan.lastName, email: current.email ?? null, phone: current.phone ?? null, linkedin: current.linkedin ?? null, ownerId },
      actor,
      tx,
    );
    const personId = createdPerson.id;
    const personName = `${plan.firstName} ${plan.lastName}`;

    await writeContactProfile(personId, { values: { jobTitle: plan.jobTitle, decisionRole: plan.decisionRole }, company: { id: companyId, name: companyName, archivedAt: null } }, actor, tx);

    /* Ce que la fenêtre a complété ne s'écrit sur le lead que dans ses champs vides (D15) : rien n'y est écrasé. */
    const completed = Object.entries({ firstName: plan.firstName, lastName: plan.lastName, companyName: plan.companyName, jobTitle: plan.jobTitle }).filter(
      ([key, value]) => value !== null && text(current[key]) === null,
    ) as [string, string][];
    const now = new Date();
    await tx
      .update(lead)
      .set({ ...Object.fromEntries(completed), stage: CONVERTED_STAGE, convertedAt: now, convertedPersonId: personId, convertedCompanyId: companyId, updatedAt: now })
      .where(eq(lead.id, current.id));
    const entries: HistoryInput[] = [
      { objectType: TYPE, objectId: current.id, action: CONVERSION_ACTION, newValue: `${personName} · ${companyName}`, authorId: actor.id },
      ...completed.map(([field, value]) => ({ objectType: TYPE, objectId: current.id, action: "modifiee" as const, field, oldValue: null, newValue: value, authorId: actor.id })),
    ];
    await recordHistory(entries, tx);
    return { leadId: current.id, personId, companyId };
  });
}
