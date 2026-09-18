import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, company, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { linkedGroups } from "@/features/objects/links-column";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-liens-opportunites@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Liens-Opp-1", role: "membre" as const };

let memberId: string;
let bankId: string;

async function createOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", ...fields }, { id: memberId })).id;
}

/** Le groupe de la colonne des liens qui porte ce libellé. */
const group = async (type: string, id: string, label: string) => (await linkedGroups(type, id)).find((candidate) => candidate.label === label);

/** Les enfants avant les parents : les propositions partent avec l'opportunité (cascade), qui retient l'entreprise et les personnes. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
});

beforeEach(async () => {
  await cleanup();
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D47, D61, contrat 52 : l'entreprise et le contact montrent l'opportunité avec son étape en sous-titre. */
describe("colonne des liens de l'entreprise et du contact (CRM-109, D47, D61)", () => {
  it("la fiche de l'entreprise montre l'opportunité sous « Opportunités », son étape en sous-titre, avec le lien vers sa fiche", async () => {
    const opportunityId = await createOpportunity({ stage: "negociation" });

    expect((await group("company", bankId, "Opportunités"))?.records).toEqual([{ id: opportunityId, title: "Refonte Payroll", href: `/opportunites/${opportunityId}`, subtitle: "Négociation" }]);
  });
});
