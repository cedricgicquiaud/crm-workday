/**
 * Propositions d'une opportunité (4.2b, D44 à D46) : les consultants présentés au client, chacun avec
 * son résultat et son TJM de vente proposé. Ce module est la seule écriture de `opportunity_consultant`
 * hors des mécanismes communs (suppression, fusion), qui la lisent par sa déclaration.
 */
import { and, asc, count, eq, exists, isNull, ne, not, type SQL } from "drizzle-orm";
import { consultantProfile, opportunity, opportunityConsultant, person } from "@/db/schema";
import { parisDay } from "@/features/activities/overdue";
import { personsWithConsultantProfile } from "@/features/consultants/consultant-profile";
import { consultantState, stateLabel } from "@/features/consultants/state";
import { recordHistory } from "@/features/history/history";
import { validateValues, type FieldValues } from "@/features/objects/fields";
import { formatNumber } from "@/features/objects/labels";
import type { FieldDescriptor } from "@/features/objects/registry";
import { assertWritable, getObjectRecord, RECORD_OPTIONS_LIMIT, type Actor, type ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db, type Executor } from "@/lib/db";
import { PROPOSAL_ADDED_ACTION, PROPOSAL_CHANGED_ACTION, PROPOSAL_WITHDRAWN_ACTION } from "./register";
import { OPPORTUNITY_FIELDS, PROPOSAL_RESULTS } from "./schema";

const TYPE = "opportunity";

/** Refus de l'entrée (400), un message sous chaque clé qui l'a causé. */
const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

/** « « result » ne se donne pas à l'ajout d'un consultant. » : `gesture` nomme le geste qui ne prévoit pas la clé. */
const unexpectedKeyRule = (key: string, gesture: string) => `« ${key} » ne se donne pas à ${gesture}.`;

/**
 * Une clé que le geste ne prévoit pas répond 400 sous elle plutôt que d'être ignorée, ce qui ferait
 * croire qu'elle a été enregistrée. Rend l'entrée lue en objet.
 */
function onlyKeys(input: unknown, allowed: readonly string[], gesture: string): Record<string, unknown> {
  const fields = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const unexpected = Object.keys(fields).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) throw invalid(Object.fromEntries(unexpected.map((key) => [key, unexpectedKeyRule(key, gesture)])));
  return fields;
}

const CONSULTANT_REQUIRED = "Choisissez un consultant.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notConsultantRule = (name: string) => `Seul un consultant se propose sur une opportunité : « ${name} » n'a pas de profil consultant.`;

const alreadyProposedRule = (name: string) => `« ${name} » figure déjà parmi les consultants proposés.`;

const archivedRule = (name: string) => `« ${name} » est archivée : restaurez sa fiche pour la proposer.`;

const archivedChangeRule = (name: string) => `« ${name} » est archivée : restaurez sa fiche pour modifier sa proposition.`;

/**
 * Une proposition telle que la section et l'API la rendent : le consultant par son nom, son résultat,
 * son TJM proposé. `archived` : le consultant a été archivé après son ajout (D45) — il reste affiché.
 */
export type Proposal = { personId: string; name: string; archived: boolean; result: string; proposedDailyRate: number | null };

/** Propositions lues au plus pour la fiche ; le reste s'annonce (« et N autres »). */
export const PROPOSALS_LIMIT = 50;

/** Les propositions qui répondent à `where`, la plus ancienne d'abord. Le TJM arrive de la base en décimal écrit (« 650.00 ») : il se lit en nombre. */
async function proposalsWhere(where: SQL | undefined, limit: number): Promise<Proposal[]> {
  const rows = await db
    .select({ personId: opportunityConsultant.personId, name: person.name, archivedAt: person.archivedAt, result: opportunityConsultant.result, proposedDailyRate: opportunityConsultant.proposedDailyRate })
    .from(opportunityConsultant)
    .innerJoin(person, eq(person.id, opportunityConsultant.personId))
    .where(where)
    .orderBy(asc(opportunityConsultant.createdAt), asc(opportunityConsultant.id))
    .limit(limit);
  return rows.map(({ archivedAt, ...row }) => ({ ...row, archived: archivedAt !== null, proposedDailyRate: row.proposedDailyRate === null ? null : Number(row.proposedDailyRate) }));
}

/** Propositions d'une opportunité, la plus ancienne d'abord, bornées. */
export const listProposals = (opportunityId: string, { limit = PROPOSALS_LIMIT } = {}): Promise<Proposal[]> => proposalsWhere(eq(opportunityConsultant.opportunityId, opportunityId), limit);

/** Nombre de propositions d'une opportunité : ce que la lecture bornée n'a pas chargé se déduit de ce compte. */
export async function countProposals(opportunityId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(opportunityConsultant).where(eq(opportunityConsultant.opportunityId, opportunityId));
  return Number(row?.value ?? 0);
}

/** Un consultant que « Ajouter un consultant » propose, avec son état écrit (« En mission · disponible le 5 oct. 2026 »). */
export type ProposalCandidate = { id: string; name: string; state: string };

/**
 * Consultants que « Ajouter un consultant » propose (D44) : les personnes qui portent un profil
 * consultant, non archivées, pas encore proposées sur cette opportunité, par nom, bornées. L'état se
 * déduit au jour civil de Paris de la lecture (D6) : un consultant en mission se propose comme un autre.
 */
export async function listProposalCandidates(opportunityId: string, { limit = RECORD_OPTIONS_LIMIT } = {}): Promise<{ options: ProposalCandidate[]; more: number }> {
  const alreadyProposed = exists(
    db
      .select({ id: opportunityConsultant.id })
      .from(opportunityConsultant)
      .where(and(eq(opportunityConsultant.opportunityId, opportunityId), eq(opportunityConsultant.personId, person.id))),
  );
  const where = and(isNull(person.archivedAt), not(alreadyProposed));
  const rows = await db
    .select({ id: person.id, name: person.name, status: consultantProfile.status, availableFrom: consultantProfile.availableFrom, unavailable: consultantProfile.unavailable })
    .from(person)
    .innerJoin(consultantProfile, eq(consultantProfile.personId, person.id))
    .where(where)
    .orderBy(asc(person.name), asc(person.id))
    .limit(limit);
  const today = parisDay();
  const options = rows.map(({ id, name, status, availableFrom, unavailable }) => ({
    id,
    name,
    state: stateLabel({ state: consultantState({ unavailable: unavailable ? "oui" : "non", availableFrom }, today), availableFrom, status }),
  }));
  /* Le compte n'est demandé que si la borne est atteinte : en dessous, les consultants chargés sont tous ceux qui existent. */
  if (options.length < limit) return { options, more: 0 };
  const [total] = await db.select({ value: count() }).from(person).innerJoin(consultantProfile, eq(consultantProfile.personId, person.id)).where(where);
  return { options, more: Math.max(Number(total?.value ?? options.length) - options.length, 0) };
}

/**
 * L'entrée d'un ajout, validée avant la première requête (D55) : le consultant, rien d'autre. Le
 * résultat (« Proposé ») et le TJM proposé (le TJM cible) se posent seuls ; une clé de plus répond 400
 * plutôt que d'être ignorée, ce qui ferait croire qu'elle a été enregistrée.
 */
function readAddition(input: unknown): string {
  const fields = onlyKeys(input, ["personId"], "l'ajout d'un consultant");
  /* Un identifiant mal formé n'atteint jamais Postgres, qui répondrait par une panne (500). */
  if (typeof fields.personId !== "string" || !UUID.test(fields.personId)) throw invalid({ personId: CONSULTANT_REQUIRED });
  return fields.personId;
}

/**
 * Ajoute un consultant à une opportunité (D44) : « Proposé », au TJM de vente cible de l'opportunité
 * (D45). La proposition et sa ligne d'historique, sur l'opportunité seulement (D46), s'écrivent ensemble.
 * L'opportunité et la personne se relisent dans la transaction, verrouillées en partage : archivée
 * entre la lecture et l'écriture, l'une ou l'autre serait écrite quand même.
 */
export async function addProposal(opportunityId: string, input: unknown, actor: Actor): Promise<Proposal> {
  const personId = readAddition(input);
  const record = await getObjectRecord(TYPE, opportunityId);
  await db.transaction(async (tx) => {
    const [locked] = await tx.select({ archivedAt: opportunity.archivedAt, targetDailyRate: opportunity.targetDailyRate }).from(opportunity).where(eq(opportunity.id, record.id)).limit(1).for("share");
    assertWritable(TYPE, { ...record, ...locked });
    const [consultant] = await tx.select({ name: person.name, archivedAt: person.archivedAt }).from(person).where(eq(person.id, personId)).limit(1).for("share");
    if (!consultant) throw invalid({ personId: CONSULTANT_REQUIRED });
    if (consultant.archivedAt) throw new HttpError(409, "consultant_archive", archivedRule(consultant.name), { personId });
    if (!(await personsWithConsultantProfile([personId], tx)).has(personId)) throw invalid({ personId: notConsultantRule(consultant.name) });
    /* L'unicité du couple tranche, même entre deux ajouts simultanés : aucune ligne insérée, c'est un doublon. */
    const inserted = await tx
      .insert(opportunityConsultant)
      .values({ opportunityId: record.id, personId, proposedDailyRate: locked.targetDailyRate })
      .onConflictDoNothing()
      .returning({ id: opportunityConsultant.id });
    if (inserted.length === 0) throw new HttpError(409, "deja_proposee", alreadyProposedRule(consultant.name), { personId });
    await recordHistory([{ objectType: TYPE, objectId: record.id, action: PROPOSAL_ADDED_ACTION, field: personId, newValue: consultant.name, authorId: actor.id }], tx);
  });
  const [added] = await proposalsWhere(and(eq(opportunityConsultant.opportunityId, record.id), eq(opportunityConsultant.personId, personId)), 1);
  return added;
}

/**
 * Relit l'opportunité verrouillée (`FOR UPDATE`) dans la transaction d'un geste sur ses propositions,
 * et refuse une opportunité archivée entre-temps (409). Le verrou range ces gestes l'un après l'autre.
 */
async function lockWritable(tx: Executor, record: ObjectRecord): Promise<void> {
  const [locked] = await tx.select({ archivedAt: opportunity.archivedAt }).from(opportunity).where(eq(opportunity.id, record.id)).limit(1).for("update");
  assertWritable(TYPE, { ...record, ...locked });
}

/** La proposition visée n'existe pas : consultant inconnu, ou pas proposé sur cette opportunité. */
const notProposed = () => new HttpError(404, "proposition_introuvable", "Ce consultant n'est pas proposé sur cette opportunité.");

const RETAINED = "retenu";

const alreadyRetainedRule = (name: string) => `« ${name} » est déjà retenu sur cette opportunité : changez d'abord son résultat.`;

const NOTHING_TO_CHANGE = "Donnez un résultat ou un TJM de vente proposé.";

/** TJM de vente proposé (D45) : les bornes, les décimales et l'unité du TJM de vente cible. */
const RATE_FIELD: FieldDescriptor = { ...OPPORTUNITY_FIELDS.find((field) => field.key === "targetDailyRate")!, key: "proposedDailyRate", label: "TJM de vente proposé" };

/** Ce qu'une modification de proposition règle : son résultat, pris dans la liste fermée, et son TJM de vente proposé (D45). */
const PROPOSAL_FIELDS: readonly FieldDescriptor[] = [{ key: "result", label: "Résultat", type: "list", required: true, values: PROPOSAL_RESULTS, order: 10 }, RATE_FIELD];

/** Une proposition relue sous verrou avant d'être modifiée ou retirée : ce qu'elle porte, et le nom du consultant pour l'historique. */
type LockedProposal = { id: string; name: string; archivedAt: Date | null; result: string; proposedDailyRate: string | null };

/**
 * La proposition du consultant sur l'opportunité, verrouillée avec la fiche du consultant dans la
 * transaction du geste : un consultant archivé entre-temps se voit ici. 404 s'il n'y est pas proposé.
 */
async function lockedProposal(tx: Executor, opportunityId: string, personId: string): Promise<LockedProposal> {
  const [row] = await tx
    .select({ id: opportunityConsultant.id, name: person.name, archivedAt: person.archivedAt, result: opportunityConsultant.result, proposedDailyRate: opportunityConsultant.proposedDailyRate })
    .from(opportunityConsultant)
    .innerJoin(person, eq(person.id, opportunityConsultant.personId))
    .where(and(eq(opportunityConsultant.opportunityId, opportunityId), eq(opportunityConsultant.personId, personId)))
    .limit(1)
    .for("update");
  if (!row) throw notProposed();
  return row;
}

/**
 * Un seul « Retenu » par opportunité (D45) : un autre consultant déjà retenu répond 409 et le nomme. Lu
 * sous le verrou de l'opportunité, qui range les gestes sur ses propositions l'un après l'autre : deux
 * « Retenu » simultanés ne passent pas tous les deux.
 */
async function assertNoOtherRetained(tx: Executor, opportunityId: string, personId: string): Promise<void> {
  const [retained] = await tx
    .select({ name: person.name })
    .from(opportunityConsultant)
    .innerJoin(person, eq(person.id, opportunityConsultant.personId))
    .where(and(eq(opportunityConsultant.opportunityId, opportunityId), eq(opportunityConsultant.result, RETAINED), ne(opportunityConsultant.personId, personId)))
    .limit(1);
  if (retained) throw new HttpError(409, "deja_retenu", alreadyRetainedRule(retained.name));
}

const resultLabel = (value: string) => PROPOSAL_RESULTS.find((result) => result.value === value)?.label ?? value;

/** « 650,00 € », « vide » : le TJM proposé tel que l'historique l'écrit. */
const rateLabel = (value: string | number | null) => (value === null ? "vide" : formatNumber(RATE_FIELD, Number(value)));

/**
 * Les phrases d'historique d'une modification (D46), une par valeur qui change vraiment, au nom du
 * consultant : « Julie Martin : Proposé → Entretien », « Julie Martin : TJM de vente proposé 650,00 € → 700,00 € ».
 */
function changeSentences(before: LockedProposal, values: FieldValues): string[] {
  const sentences: string[] = [];
  if (typeof values.result === "string" && values.result !== before.result) sentences.push(`${before.name} : ${resultLabel(before.result)} → ${resultLabel(values.result)}`);
  if ("proposedDailyRate" in values) {
    const after = values.proposedDailyRate as number | null;
    if ((before.proposedDailyRate === null ? null : Number(before.proposedDailyRate)) !== after) sentences.push(`${before.name} : ${RATE_FIELD.label} ${rateLabel(before.proposedDailyRate)} → ${rateLabel(after)}`);
  }
  return sentences;
}

/**
 * Change le résultat ou le TJM de vente proposé d'une proposition (D45) : Proposé, Entretien, Retenu
 * et Refusé se choisissent dans tous les sens tant que l'opportunité est en cours. La proposition et ses
 * lignes d'historique, sur l'opportunité seulement (D46), s'écrivent ensemble.
 */
export async function changeProposal(opportunityId: string, personId: string, input: unknown, actor: Actor): Promise<Proposal> {
  const fields = onlyKeys(input, PROPOSAL_FIELDS.map((field) => field.key), "la modification d'une proposition");
  const { values, errors } = validateValues(PROPOSAL_FIELDS, fields, { partial: true });
  if (Object.keys(errors).length > 0) throw invalid(errors);
  if (Object.keys(values).length === 0) throw new HttpError(400, "donnees_invalides", NOTHING_TO_CHANGE);
  /* Un identifiant mal formé n'atteint jamais Postgres, qui répondrait par une panne (500). */
  if (!UUID.test(personId)) throw notProposed();
  const record = await getObjectRecord(TYPE, opportunityId);
  /* La colonne est un décimal : le TJM s'y écrit en texte (« 700 »), et un TJM absent de la saisie n'y touche pas. */
  const rate = "proposedDailyRate" in values ? { proposedDailyRate: values.proposedDailyRate === null ? null : String(values.proposedDailyRate) } : {};
  await db.transaction(async (tx) => {
    await lockWritable(tx, record);
    const before = await lockedProposal(tx, record.id, personId);
    if (before.archivedAt) throw new HttpError(409, "consultant_archive", archivedChangeRule(before.name), { personId });
    if (values.result === RETAINED) await assertNoOtherRetained(tx, record.id, personId);
    await tx
      .update(opportunityConsultant)
      .set({ ...(values.result ? { result: String(values.result) } : {}), ...rate, updatedAt: new Date() })
      .where(eq(opportunityConsultant.id, before.id));
    const entries = changeSentences(before, values).map((sentence) => ({ objectType: TYPE, objectId: record.id, action: PROPOSAL_CHANGED_ACTION, field: personId, newValue: sentence, authorId: actor.id }));
    await recordHistory(entries, tx);
  });
  const [changed] = await proposalsWhere(and(eq(opportunityConsultant.opportunityId, record.id), eq(opportunityConsultant.personId, personId)), 1);
  return changed;
}

/**
 * Retire une proposition (D46), retenu compris, tant que l'opportunité est en cours ; celle d'un
 * consultant archivé après son ajout se retire aussi (D45). L'opportunité se relit sous verrou : archivée
 * entre la lecture et l'écriture, elle serait écrite quand même. Le retrait et sa ligne d'historique
 * (« Consultant retiré : Julie Martin ») s'écrivent ensemble.
 */
export async function withdrawProposal(opportunityId: string, personId: string, actor: Actor): Promise<void> {
  if (!UUID.test(personId)) throw notProposed();
  const record = await getObjectRecord(TYPE, opportunityId);
  await db.transaction(async (tx) => {
    await lockWritable(tx, record);
    const before = await lockedProposal(tx, record.id, personId);
    await tx.delete(opportunityConsultant).where(eq(opportunityConsultant.id, before.id));
    await recordHistory([{ objectType: TYPE, objectId: record.id, action: PROPOSAL_WITHDRAWN_ACTION, field: personId, newValue: before.name, authorId: actor.id }], tx);
  });
}
