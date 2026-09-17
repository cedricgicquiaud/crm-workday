/**
 * Part serveur de la déclaration de l'opportunité : sa table Drizzle, l'ensemble de ses modules rangé
 * dans sa table fille (D53), la condition sur son contact (D35), son montant estimé et sa probabilité,
 * calculés à chaque lecture. Importé par le manifeste serveur.
 */
import { and, desc, eq, exists, ilike, isNull } from "drizzle-orm";
import { company, contactProfile, opportunity, opportunityModule, person } from "@/db/schema";
import { registerServerObject, type SearchHit } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { CONTACT_OUTSIDE_COMPANY_RULE, estimatedAmount, FROM_LEAD_DELETE_RULE, STAGES, stageProbability, WON_DELETE_RULE, WON_STAGE } from "./schema";

const MAX_HITS = 20;

/**
 * Palette ⌘K (D48) : sous-chaîne du titre, sous-titre « Étape · Entreprise ». Une opportunité gagnée
 * ou perdue y reste — on la cherche pour la relire ; une opportunité archivée en sort.
 */
async function search(query: string): Promise<SearchHit[]> {
  const text = query.trim();
  if (!text) return [];
  const rows = await db
    .select({ id: opportunity.id, title: opportunity.title, stage: opportunity.stage, companyName: company.name })
    .from(opportunity)
    .innerJoin(company, eq(company.id, opportunity.companyId))
    .where(and(isNull(opportunity.archivedAt), ilike(opportunity.title, `%${text}%`)))
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
  /* Deux motifs retiennent la suppression (D43) : la victoire, puis l'origine dans un lead. */
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
