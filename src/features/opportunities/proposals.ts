/**
 * Propositions d'une opportunité (4.2b, D44 à D46) : les consultants présentés au client, chacun avec
 * son résultat et son TJM de vente proposé. Ce module est la seule écriture de `opportunity_consultant`
 * hors des mécanismes communs (suppression, fusion), qui la lisent par sa déclaration.
 */
import { asc, eq } from "drizzle-orm";
import { opportunityConsultant, person } from "@/db/schema";
import { recordHistory } from "@/features/history/history";
import { getObjectRecord, type Actor } from "@/features/objects/service";
import { db } from "@/lib/db";
import { PROPOSAL_ADDED_ACTION } from "./register";

const TYPE = "opportunity";

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

/**
 * Ajoute un consultant à une opportunité (D44) : « Proposé », au TJM de vente cible de l'opportunité
 * (D45). La proposition et sa ligne d'historique, sur l'opportunité seulement (D46), s'écrivent ensemble.
 */
export async function addProposal(opportunityId: string, input: unknown, actor: Actor): Promise<Proposal> {
  const record = await getObjectRecord(TYPE, opportunityId);
  const { personId } = input as { personId: string };
  const [consultant] = await db.select({ name: person.name }).from(person).where(eq(person.id, personId)).limit(1);
  await db.transaction(async (tx) => {
    await tx.insert(opportunityConsultant).values({ opportunityId: record.id, personId, proposedDailyRate: record.targetDailyRate == null ? null : String(record.targetDailyRate) });
    await recordHistory([{ objectType: TYPE, objectId: record.id, action: PROPOSAL_ADDED_ACTION, field: personId, newValue: consultant.name, authorId: actor.id }], tx);
  });
  const proposals = await listProposals(record.id);
  return proposals.find((proposal) => proposal.personId === personId)!;
}
