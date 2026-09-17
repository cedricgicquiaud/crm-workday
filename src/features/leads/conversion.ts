/**
 * Conversion d'un lead (D14 à D17) : une personne avec son profil contact et une entreprise, créées
 * ou retrouvées, puis le lead « converti » qui les désigne. Toutes ces écritures et leur historique
 * tiennent dans une seule transaction, ouverte sur le lead verrouillé (`FOR UPDATE`) : deux conversions
 * simultanées n'en réussissent qu'une, et un échec en chemin ne laisse rien derrière lui.
 * La conversion réutilise les écritures des personnes : la création générique et le profil contact.
 */
import { desc, eq, or, sql } from "drizzle-orm";
import { company, lead, person } from "@/db/schema";
import { normalizeCompanyName } from "@/features/duplicates/normalize";
import { recordHistory, type HistoryInput } from "@/features/history/history";
import { validateValues, type FieldValues } from "@/features/objects/fields";
import { createObject, getObjectRecord, type Actor, type ObjectRecord } from "@/features/objects/service";
import { readContactProfile, writeContactProfile, type ContactProfile } from "@/features/persons/contact-profile";
import { holderOf, type Holder } from "@/features/persons/emails";
import { DECISION_ROLE_FIELD, DEFAULT_DECISION_ROLE, JOB_TITLE_FIELD, normalizeEmail, PERSON_FIELDS } from "@/features/persons/schema";
import { HttpError } from "@/lib/auth/session";
import { db, type Executor } from "@/lib/db";
import { CONVERSION_ACTION, CONVERTED_STAGE, OPEN_STAGES } from "./schema";

const TYPE = "lead";


/** Ce que la conversion rend : le lead et les deux fiches qu'il désigne désormais. */
export type ConversionResult = { leadId: string; personId: string; companyId: string };

const asObject = (input: unknown): Record<string, unknown> => (input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {});

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** 400 dont le message est la première erreur, et toutes les erreurs par champ pour la fenêtre. */
const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

/** L'entreprise de la conversion : une existante choisie dans les propositions, ou une nouvelle à créer sous ce nom. */
type CompanyChoice = { kind: "existing"; id: string; name: string; archivedAt: Date | null } | { kind: "new"; name: string };

/** La personne de la conversion : celle qui porte déjà l'email du lead (principale ou autre adresse), ou une nouvelle. */
type PersonChoice = { kind: "found"; id: string; name: string; archivedAt: Date | null } | { kind: "new"; firstName: string; lastName: string };

/** Ce que la fenêtre a confirmé, validé contre les descripteurs de la personne et du profil, avant toute écriture. */
type Plan = {
  person: PersonChoice;
  firstName: string | null;
  lastName: string | null;
  company: CompanyChoice;
  /** le profil contact que la personne retrouvée porte déjà */
  contact: ContactProfile | null;
  /** la personne reste contact là où elle l'est : son profil n'est pas touché */
  keepsContact: boolean;
  jobTitle: string | null;
  decisionRole: string;
};

/** Champs de la personne qu'une conversion vers une personne retrouvée remplit s'ils sont vides, sans jamais écraser (D16). */
const FILLED_PERSON_FIELDS = ["phone", "linkedin"] as const;

/** La personne qui porte l'email du lead, par toutes ses adresses, archivée comprise ; aucune sans email. */
export async function foundPersonOf(record: Record<string, unknown>): Promise<Holder | null> {
  const email = text(record.email);
  return email ? holderOf(normalizeEmail(email), null) : null;
}

/** Le champ « Entreprise » de la fenêtre : c'est sous lui que s'affichent les refus sur l'entreprise. */
export const COMPANY_INPUT = "companyName";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const personField = (key: string) => PERSON_FIELDS.find((field) => field.key === key)!;

/** Une entreprise choisie par son identifiant ; un identifiant qui ne désigne aucune entreprise est un refus sous le champ (400), jamais une panne. */
async function chosenCompany(id: unknown): Promise<CompanyChoice | null> {
  if (id === undefined || id === null || id === "") return null;
  const [row] = typeof id === "string" && UUID.test(id) ? await db.select({ id: company.id, name: company.name, archivedAt: company.archivedAt }).from(company).where(eq(company.id, id)).limit(1) : [];
  if (!row) throw invalid({ [COMPANY_INPUT]: "« Entreprise » ne désigne aucune entreprise." });
  return { kind: "existing", ...row };
}

/** Valide l'entrée de la fenêtre : prénom, nom et entreprise obligatoires pour une nouvelle personne, rôle dans sa liste (400 par champ). */
async function planOf(current: ObjectRecord, body: Record<string, unknown>): Promise<Plan> {
  const pick = (key: string) => (key in body ? body[key] : current[key]);
  const chosen = await chosenCompany(body.companyId);
  const found = await foundPersonOf(current);
  /* D17 : une fiche archivée ne reçoit rien ; le refus la nomme et dit comment la rouvrir, avant toute écriture. */
  if (found?.archivedAt) throw new HttpError(409, "fiche_archivee", `Personne archivée : « ${found.name} » porte cet email. Restaurez-la pour convertir ce lead.`, { personId: found.id });
  const archivedCompany = (target: CompanyChoice) => new HttpError(409, "fiche_archivee", `Entreprise archivée : « ${target.name} » ne reçoit plus de contact. Restaurez-la pour convertir ce lead.`, { companyId: target.kind === "existing" ? target.id : null });
  if (chosen?.kind === "existing" && chosen.archivedAt) throw archivedCompany(chosen);
  const contact = found ? await readContactProfile(found.id) : null;
  const keeps = keepsContact(found, contact, chosen, body.keepCompany);
  /* L'entreprise gardée est relue comme une choisie : son archivage compte autant (D17). */
  const existing: CompanyChoice | null = keeps && contact ? await chosenCompany(contact.companyId) : chosen;
  if (existing?.kind === "existing" && existing.archivedAt) throw archivedCompany(existing);
  /* Retrouvée, la personne garde son prénom et son nom : la fenêtre les montre en lecture, ils ne sont pas exigés (D15). */
  const named = (key: string) => ({ ...personField(key), required: found === null });
  const companyField = { ...personField("lastName"), key: COMPANY_INPUT, label: "Entreprise", required: existing === null };
  const { values, errors } = validateValues(
    [named("firstName"), named("lastName"), companyField, JOB_TITLE_FIELD, { ...DECISION_ROLE_FIELD, required: false }],
    { firstName: pick("firstName") ?? "", lastName: pick("lastName") ?? "", [COMPANY_INPUT]: existing ? "" : pick(COMPANY_INPUT) ?? "", jobTitle: pick("jobTitle"), decisionRole: body.decisionRole },
    { partial: false },
  );
  if (Object.keys(errors).length > 0) throw invalid(errors);
  const firstName = text(values.firstName);
  const lastName = text(values.lastName);
  return {
    person: found ? { kind: "found", ...found } : { kind: "new", firstName: firstName!, lastName: lastName! },
    firstName,
    lastName,
    company: existing ?? { kind: "new", name: String(values[COMPANY_INPUT]) },
    contact,
    keepsContact: keeps,
    jobTitle: text(values.jobTitle),
    decisionRole: text(values.decisionRole) ?? DEFAULT_DECISION_ROLE,
  };
}

/** La question de la fenêtre quand la personne retrouvée est déjà contact ailleurs : sous elle s'affiche le refus de ne pas y répondre. */
export const KEEP_COMPANY_INPUT = "keepCompany";

/**
 * Vrai quand la conversion garde l'entreprise où la personne est déjà contact (D15) : ce choix désigne
 * l'entreprise de la conversion, et le profil n'est pas touché. La question ne se pose que si la
 * personne est contact ailleurs que dans l'entreprise choisie ; sans réponse, 400 sous la question.
 */
function keepsContact(found: Holder | null, contact: ContactProfile | null, chosen: CompanyChoice | null, answer: unknown): boolean {
  if (!found || !contact) return false;
  if (chosen?.kind === "existing" && chosen.id === contact.companyId) return true;
  if (typeof answer === "boolean") return answer;
  throw invalid({ [KEEP_COMPANY_INPUT]: `« ${found.name} » est déjà contact chez « ${contact.companyName} » : choisissez l'entreprise à garder.` });
}

/** 409 qui dit pourquoi un lead ne se convertit pas : archivé, déjà converti, écarté (D14). */
function assertConvertible(record: Record<string, unknown>, id: string): void {
  if (record.archivedAt) throw new HttpError(409, "fiche_archivee", "Lead archivé : il ne se convertit pas. Restaurez-le d'abord.", { id });
  if (record.stage === CONVERTED_STAGE) throw new HttpError(409, "deja_converti", "Ce lead est déjà converti.", { id });
  if (!OPEN_STAGES.includes(String(record.stage))) throw new HttpError(409, "avancement_incompatible", "Lead écarté : rouvrez-le avant de le convertir.", { id });
}

/** Les fiches que crée la conversion ne recopient aucun champ personnalisé, et n'en exigent aucun (D16). */
const GESTURE = { customRequired: false };

/** Nouvelle personne (D16) : prénom, nom, email, téléphone et LinkedIn du lead, au responsable du lead. */
async function createPerson(person: { firstName: string; lastName: string }, current: ObjectRecord, actor: Actor, tx: Executor): Promise<string> {
  const values = { firstName: person.firstName, lastName: person.lastName, email: current.email ?? null, phone: current.phone ?? null, linkedin: current.linkedin ?? null, ownerId: current.ownerId };
  return (await createObject("person", values, actor, tx, GESTURE)).id;
}

/** Personne retrouvée (D16) : ses champs vides reçoivent ceux du lead, une ligne d'historique par champ ; rien n'est écrasé, son responsable ne change pas. */
async function completePerson(personId: string, current: ObjectRecord, actor: Actor, tx: Executor): Promise<string> {
  const [row] = await tx.select({ phone: person.phone, linkedin: person.linkedin }).from(person).where(eq(person.id, personId)).limit(1);
  const filled = FILLED_PERSON_FIELDS.filter((key) => text(row[key]) === null && text(current[key]) !== null).map((key) => [key, text(current[key])!] as const);
  if (filled.length === 0) return personId;
  await tx
    .update(person)
    .set({ ...Object.fromEntries(filled), updatedAt: new Date() })
    .where(eq(person.id, personId));
  await recordHistory(filled.map(([field, value]) => ({ objectType: "person", objectId: personId, action: "modifiee" as const, field, oldValue: null, newValue: value, authorId: actor.id })), tx);
  return personId;
}

/** Ce que la fenêtre annonce de la personne : une nouvelle, pré-remplie ; ou celle qui porte l'email, son profil contact et ce que la conversion changera chez elle. */
export type PersonPreview =
  | { kind: "new"; firstName: string | null; lastName: string | null }
  | { kind: "found"; id: string; name: string; firstName: string; lastName: string; contact: { companyId: string; companyName: string } | null; differences: string[] };

/** Ce que la fenêtre propose pour l'entreprise : la saisie, les entreprises proches (bornées, « et N autres ») et l'homonyme exacte. */
export type CompanyPreview = { query: string; proposals: CompanyProposal[]; more: number; sameNameAs: string | null };

export type CompanyProposal = { id: string; name: string; type: string; archived: boolean };

export type ConversionPreview = { leadId: string; title: string; person: PersonPreview; company: CompanyPreview; jobTitle: string | null };

/** « Téléphone : sera rempli », « LinkedIn : la fiche garde le sien » : ce que la conversion fera des champs que le lead porte (D15). */
function differencesOf(found: Record<string, unknown>, current: ObjectRecord): string[] {
  return FILLED_PERSON_FIELDS.flatMap((key) => {
    const incoming = text(current[key]);
    const kept = text(found[key]);
    if (incoming === null || incoming === kept) return [];
    return [`${personField(key).label} : ${kept === null ? "sera rempli" : "la fiche garde le sien"}`];
  });
}

async function personPreview(current: ObjectRecord): Promise<PersonPreview> {
  const found = await foundPersonOf(current);
  if (!found) return { kind: "new", firstName: text(current.firstName), lastName: text(current.lastName) };
  const [row] = await db.select({ firstName: person.firstName, lastName: person.lastName, phone: person.phone, linkedin: person.linkedin }).from(person).where(eq(person.id, found.id)).limit(1);
  const contact = await readContactProfile(found.id);
  return {
    kind: "found",
    id: found.id,
    name: found.name,
    firstName: row.firstName,
    lastName: row.lastName,
    contact: contact ? { companyId: contact.companyId, companyName: contact.companyName } : null,
    differences: differencesOf(row, current),
  };
}

/** Entreprises proposées au plus (D15) ; au-delà, la fenêtre écrit « et N autres ». */
export const COMPANY_PROPOSALS_LIMIT = 20;

/** Candidates lues au plus avant le rapprochement des noms : la lecture reste bornée même sur une saisie très courte. */
const COMPANY_CANDIDATES_LIMIT = 200;

/** Minuscules sans accents côté base, pour préfiltrer sur les mots de la forme comparable d'un nom. */
const ACCENTED = "àâäáãåéèêëíìîïóòôöõúùûüçñÿ";
const PLAIN = "aaaaaaeeeeiiiiooooouuuucny";

/**
 * Entreprises proches d'une saisie (D15) : celles dont le nom normalisé (D19 de la feature 2) contient
 * celui de la saisie, ou y est contenu. La base préfiltre sur les mots de la saisie, bornée ; le
 * rapprochement se fait ensuite sur la forme comparable. L'homonyme exacte est rangée en tête et
 * nommée dans `sameNameAs` ; une archivée reste proposée, marquée.
 */
async function companyPreview(query: string): Promise<CompanyPreview> {
  const wanted = normalizeCompanyName(query);
  if (wanted === "") return { query, proposals: [], more: 0, sameNameAs: null };
  const words = wanted.split(" ");
  const rows = await db
    .select({ id: company.id, name: company.name, type: company.type, archivedAt: company.archivedAt })
    .from(company)
    .where(or(...words.map((word) => sql`translate(lower(${company.name}), ${ACCENTED}, ${PLAIN}) like ${`%${word}%`}`)))
    .orderBy(desc(company.updatedAt), desc(company.id))
    .limit(COMPANY_CANDIDATES_LIMIT);
  const close = rows
    .map((row) => ({ row, name: normalizeCompanyName(row.name) }))
    .filter(({ name }) => name !== "" && (name.includes(wanted) || wanted.includes(name)))
    .sort((a, b) => Number(b.name === wanted) - Number(a.name === wanted) || Number(a.row.archivedAt !== null) - Number(b.row.archivedAt !== null) || a.row.name.localeCompare(b.row.name));
  const same = close.find(({ name }) => name === wanted);
  return {
    query,
    proposals: close.slice(0, COMPANY_PROPOSALS_LIMIT).map(({ row }) => ({ id: row.id, name: row.name, type: row.type, archived: row.archivedAt !== null })),
    more: Math.max(close.length - COMPANY_PROPOSALS_LIMIT, 0),
    sameNameAs: same ? same.row.name : null,
  };
}

/** Aperçu de la conversion pour la fenêtre (D15) : 404 inconnu, 409 si le lead ne se convertit pas ; rien n'est écrit. */
export async function previewConversion(id: string, companyQuery: string | null): Promise<ConversionPreview> {
  const current = await getObjectRecord(TYPE, id);
  assertConvertible(current, current.id);
  const query = companyQuery ?? text(current.companyName) ?? "";
  return {
    leadId: current.id,
    title: String(current.title),
    person: await personPreview(current),
    company: await companyPreview(query),
    jobTitle: text(current.jobTitle),
  };
}

/**
 * Valeurs du profil contact (D16) : créé, il prend le poste et le rôle de la fenêtre ; complété, il ne
 * reçoit le poste que s'il n'en a pas, et le rôle que s'il est « non précisé » — rien n'est écrasé.
 */
function profileValues({ contact, jobTitle, decisionRole }: Plan): FieldValues {
  if (!contact) return { jobTitle, decisionRole };
  return {
    ...(contact.jobTitle === null && jobTitle !== null ? { jobTitle } : {}),
    ...(contact.decisionRole === DEFAULT_DECISION_ROLE ? { decisionRole } : {}),
  };
}

/**
 * Convertit un lead (D16) : 404 inconnu, 400 par champ, 409 archivé, converti ou écarté. Tout
 * s'écrit dans une transaction ouverte sur le lead verrouillé, relu sous le verrou.
 */
export async function convertLead(id: string, input: unknown, actor: Actor): Promise<ConversionResult> {
  const current = await getObjectRecord(TYPE, id);
  assertConvertible(current, current.id);
  const plan = await planOf(current, asObject(input));
  const ownerId = String(current.ownerId);

  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ stage: lead.stage, archivedAt: lead.archivedAt }).from(lead).where(eq(lead.id, current.id)).for("update");
    assertConvertible(locked, current.id);

    /* Une entreprise existante garde son type et son responsable ; une nouvelle est un prospect au responsable du lead (D16). */
    const target = plan.company.kind === "existing" ? plan.company : await createObject("company", { name: plan.company.name, type: "prospect", ownerId }, actor, tx, GESTURE);
    const companyId = target.id;
    const companyName = String(target.name);

    const personId = plan.person.kind === "found" ? await completePerson(plan.person.id, current, actor, tx) : await createPerson(plan.person, current, actor, tx);
    const personName = plan.person.kind === "found" ? plan.person.name : `${plan.person.firstName} ${plan.person.lastName}`;

    if (!plan.keepsContact) await writeContactProfile(personId, { values: profileValues(plan), company: { id: companyId, name: companyName, archivedAt: null } }, actor, tx);

    /* Ce que la fenêtre a complété ne s'écrit sur le lead que dans ses champs vides (D15) : rien n'y est écrasé. */
    const completed = Object.entries({ firstName: plan.firstName, lastName: plan.lastName, companyName, jobTitle: plan.jobTitle }).filter(
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
