/**
 * Part serveur de la déclaration de l'opportunité : sa table Drizzle, l'ensemble de ses modules rangé
 * dans sa table fille (D53), la condition sur son contact (D35) et son montant estimé, calculé à chaque
 * lecture. Importé par le manifeste serveur.
 */
import { eq, exists } from "drizzle-orm";
import { contactProfile, opportunity, opportunityModule, person } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { CONTACT_OUTSIDE_COMPANY_RULE, estimatedAmount } from "./schema";

registerServerObject({
  key: "opportunity",
  table: opportunity,
  search: async () => [],
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
  /*
   * Le TJM arrive de la base en décimal écrit (« 650.00 ») : il se lit en nombre, pour que la saisie
   * montre « 650 ». Le montant estimé n'est pas stocké (D53) : chaque lecture le calcule, la liste le
   * filtre et le trie comme une colonne.
   */
  attach: async (records) =>
    records.map((record) => ({ ...record, targetDailyRate: record.targetDailyRate === null ? null : Number(record.targetDailyRate), estimatedAmount: estimatedAmount(record) })),
});
