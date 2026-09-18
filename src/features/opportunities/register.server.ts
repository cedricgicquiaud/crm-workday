/**
 * Part serveur de la déclaration de l'opportunité : sa table Drizzle, l'ensemble de ses modules rangé
 * dans sa table fille (D53), la condition sur son contact (D35), son montant estimé et sa probabilité,
 * calculés à chaque lecture, et la section « Consultants proposés » (4.2b). Importé par le manifeste serveur.
 */
import { and, desc, eq, exists, ilike, isNull, or } from "drizzle-orm";
import { createElement } from "react";
import { company, contactProfile, opportunity, opportunityModule, person } from "@/db/schema";
import { defineSection, registerServerObject, type SearchHit } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { countProposals, listProposalCandidates, listProposals, PROPOSALS_LIMIT, type Proposal, type ProposalCandidate } from "./proposals";
import { ProposalsSection } from "./proposals-section";
import { CONTACT_OUTSIDE_COMPANY_RULE, estimatedAmount, FROM_LEAD_DELETE_RULE, STAGES, stageProbability, WON_DELETE_RULE, WON_STAGE } from "./schema";

const MAX_HITS = 20;

/** Ce que la section « Consultants proposés » lit d'un coup : les propositions et les consultants que l'ajout propose. */
type ProposalsData = { proposals: Proposal[]; moreProposals: number; candidates: { options: ProposalCandidate[]; more: number } };

/**
 * Section « Consultants proposés » (D44), la première sous « Champs ». Son chargeur lit les propositions,
 * bornées, et les consultants à proposer : la section les reçoit, elle ne les relit pas pour son compte.
 */
const proposalsSection = defineSection<ProposalsData>({
  key: "consultants-proposes",
  order: 10,
  load: async (id) => {
    const [proposals, candidates] = await Promise.all([listProposals(id), listProposalCandidates(id)]);
    /* Le compte n'est demandé que si la borne est atteinte : en dessous, les propositions chargées sont toutes celles qui existent. */
    const moreProposals = proposals.length < PROPOSALS_LIMIT ? 0 : (await countProposals(id)) - proposals.length;
    return { proposals, moreProposals, candidates };
  },
  render: ({ id, data, readOnly }) =>
    createElement(ProposalsSection, { opportunityId: id, proposals: data.proposals, moreProposals: data.moreProposals, candidates: data.candidates.options, moreCandidates: data.candidates.more, readOnly }),
});

/**
 * Palette ⌘K (D48) : sous-chaîne du titre ou du nom de l'entreprise, sous-titre « Étape · Entreprise ».
 * Une opportunité gagnée ou perdue y reste — on la cherche pour la relire ; une archivée en sort.
 */
async function search(query: string): Promise<SearchHit[]> {
  const text = query.trim();
  if (!text) return [];
  const rows = await db
    .select({ id: opportunity.id, title: opportunity.title, stage: opportunity.stage, companyName: company.name })
    .from(opportunity)
    .innerJoin(company, eq(company.id, opportunity.companyId))
    .where(and(isNull(opportunity.archivedAt), or(ilike(opportunity.title, `%${text}%`), ilike(company.name, `%${text}%`))))
    .orderBy(desc(opportunity.updatedAt))
    .limit(MAX_HITS);
  return rows.map((row) => ({ id: row.id, title: row.title, subtitle: `${STAGES.find((stage) => stage.value === row.stage)?.label ?? row.stage} · ${row.companyName}` }));
}

registerServerObject({
  key: "opportunity",
  table: opportunity,
  search,
  duplicateKey: () => null,
  sets: [{ field: "modules", table: opportunityModule, fkColumn: "opportunityId", valueColumn: "module" }],
  /* Le contact est une personne portant un profil contact rattaché à l'entreprise de l'opportunité (D35). */
  relationScopes: [
    {
      field: "contactPersonId",
      dependsOn: "companyId",
      matches: "companyId",
      where: exists(db.select({ id: contactProfile.id }).from(contactProfile).where(eq(contactProfile.personId, person.id))),
      refusal: CONTACT_OUTSIDE_COMPANY_RULE,
      outsideMark: (companyName) => `a quitté ${companyName}`,
    },
  ],
  /* L'entreprise et le contact montrent l'étape de l'opportunité sous son titre (D47, D61). */
  linkSubtitle: { column: "stage", values: STAGES, relations: ["companyId", "contactPersonId"] },
  /* Deux motifs retiennent la suppression (D43) : la victoire, puis l'origine dans un lead. */
  sections: [proposalsSection],
  deletable: (record) => (record.stage === WON_STAGE ? WON_DELETE_RULE : record.leadId != null ? FROM_LEAD_DELETE_RULE : null),
  /*
   * Le TJM arrive de la base en décimal écrit (« 650.00 ») : il se lit en nombre, pour que la saisie
   * montre « 650 ». Le montant estimé et la probabilité ne sont pas stockés (D53) : chaque lecture les
   * calcule, la liste les filtre et les trie comme des colonnes.
   */
  attach: async (records) =>
    records.map((record) => ({
      ...record,
      targetDailyRate: record.targetDailyRate === null ? null : Number(record.targetDailyRate),
      estimatedAmount: estimatedAmount(record),
      probability: stageProbability(String(record.stage)),
    })),
});
