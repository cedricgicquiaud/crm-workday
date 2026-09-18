import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, company, customFieldDefinition, customFieldValue, lead, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { loadCustomFields } from "@/features/custom-fields/definitions";
import { listHistory } from "@/features/history/history";
import { createLead } from "@/features/leads/leads";
import { createObject } from "@/features/objects/service";
import { createOpportunity } from "@/features/opportunities/opportunities";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-conversion-opportunite@exemple.fr", firstName: "Inès", lastName: "Carpentier", password: "MotDePasse-Conv-Opp-1", role: "membre" as const };

let memberId: string;

const newCompany = async (name: string) => (await createObject("company", { name, type: "prospect" }, { id: memberId })).id;

const opportunityAt = (companyId: string) => ({ title: "Besoin Workday · Banque X", companyId, modules: ["hcm"], expectedClose: "2026-12-15" });

/** Les enfants avant les parents : une opportunité retient son lead, son contact et son entreprise (clés sans cascade). */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await loadCustomFields();
  await db.delete(opportunity);
  await db.delete(activity);
  await db.delete(lead);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D67 : le geste de création d'une opportunité (la conversion d'un lead) vérifie l'étape qu'il pose. */
describe("geste de création d'une opportunité (CRM-111, D67)", () => {
  it("refuse (400, sous « stage ») une étape réservée ou inconnue, et ne crée aucune opportunité", async () => {
    const bank = await newCompany("Banque X");
    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });

    for (const stage of ["gagnee", "perdue", "inventee"]) {
      const attempt = db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage, leadId: origin.id }));
      await expect(attempt, stage).rejects.toMatchObject({ status: 400, details: { fields: { stage: expect.any(String) } } });
    }
    expect(await db.select({ id: opportunity.id }).from(opportunity)).toHaveLength(0);
  });

  it("écrit une seule ligne d'historique pour l'étape posée, « Qualifié », à côté de la ligne de création", async () => {
    const bank = await newCompany("Banque X");
    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });

    const created = await db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage: "qualifie", leadId: origin.id }));

    const history = await listHistory("opportunity", created.id);
    expect(history.filter((entry) => entry.field === "stage").map((entry) => [entry.oldValue, entry.newValue])).toEqual([[null, "qualifie"]]);
    expect(history.filter((entry) => entry.action === "creee")).toHaveLength(1);
  });
});
