/**
 * Propositions d'une opportunité (4.2b, D44 à D46) : les consultants présentés au client, chacun avec
 * son résultat et son TJM de vente proposé. Ce module est la seule écriture de `opportunity_consultant`
 * hors des mécanismes communs (suppression, fusion), qui la lisent par sa déclaration.
 */
import { and, asc, count, eq, exists, isNull, not } from "drizzle-orm";
import { consultantProfile, opportunity, opportunityConsultant, person } from "@/db/schema";
import { personsWithConsultantProfile } from "@/features/consultants/consultant-profile";
import { recordHistory } from "@/features/history/history";
import { assertWritable, getObjectRecord, RECORD_OPTIONS_LIMIT, type Actor } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PROPOSAL_ADDED_ACTION } from "./register";

const TYPE = "opportunity";

/** Refus de l'entrée (400), un message sous chaque clé qui l'a causé. */
const invalid = (errors: Record<string, string>) => new HttpError(400, "donnees_invalides", Object.values(errors)[0], { fields: errors });

const unexpectedKeyRule = (key: string) => `« ${key} » ne se donne pas à l'ajout d'un consultant.`;

const CONSULTANT_REQUIRED = "Choisissez un consultant.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notConsultantRule = (name: string) => `Seul un consultant se propose sur une opportunité : « ${name} » n'a pas de profil consultant.`;

const alreadyProposedRule = (name: string) => `« ${name} » figure déjà parmi les consultants proposés.`;

const archivedRule = (name: string) => `« ${name} » est archivée : restaurez sa fiche pour la proposer.`;

/** Une proposition telle que la section et l'API la rendent : le consultant par son nom, son résultat, son TJM proposé. */
export type Proposal = { personId: string; name: string; result: string; proposedDailyRate: number | null };

/** Propositions d'une opportunité, la plus ancienne d'abord. Le TJM arrive de la base en décimal écrit (« 650.00 ») : il se lit en nombre. */
export async function listProposals(opportunityId: string): Promise<Proposal[]> {
  const rows = await db
    .select({ personId: opportunityConsultant.personId, name: person.name, result: opportunityConsultant.result, proposedDailyRate: opportunityConsultant.proposedDailyRate })
    .from(opportunityConsultant)
    .innerJoin(person, eq(person.id, opportunityConsultant.personId))
    .where(eq(opportunityConsultant.opportunityId, opportunityId))
    .orderBy(asc(opportunityConsultant.createdAt), asc(opportunityConsultant.id));
  return rows.map((row) => ({ ...row, proposedDailyRate: row.proposedDailyRate === null ? null : Number(row.proposedDailyRate) }));
}

/** Un consultant que « Ajouter un consultant » propose. */
export type ProposalCandidate = { id: string; name: string };

/**
 * Consultants que « Ajouter un consultant » propose (D44) : les personnes qui portent un profil
 * consultant, non archivées, pas encore proposées sur cette opportunité, par nom, bornées.
 */
export async function listProposalCandidates(opportunityId: string, { limit = RECORD_OPTIONS_LIMIT } = {}): Promise<{ options: ProposalCandidate[]; more: number }> {
  const alreadyProposed = exists(
    db
      .select({ id: opportunityConsultant.id })
      .from(opportunityConsultant)
      .where(and(eq(opportunityConsultant.opportunityId, opportunityId), eq(opportunityConsultant.personId, person.id))),
  );
  const where = and(isNull(person.archivedAt), not(alreadyProposed));
  const options = await db
    .select({ id: person.id, name: person.name })
    .from(person)
    .innerJoin(consultantProfile, eq(consultantProfile.personId, person.id))
    .where(where)
    .orderBy(asc(person.name), asc(person.id))
    .limit(limit);
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
  const fields = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const unexpected = Object.keys(fields).filter((key) => key !== "personId");
  if (unexpected.length > 0) throw invalid(Object.fromEntries(unexpected.map((key) => [key, unexpectedKeyRule(key)])));
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
  const proposals = await listProposals(record.id);
  return proposals.find((proposal) => proposal.personId === personId)!;
}
