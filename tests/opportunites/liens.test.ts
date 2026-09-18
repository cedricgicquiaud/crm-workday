import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createConsultant } from "@/features/consultants/consultants";
import { LINKED_RECORDS_LIMIT, linkedGroups } from "@/features/objects/links-column";
import { createObject, updateObject } from "@/features/objects/service";
import { addProposal, changeProposal } from "@/features/opportunities/proposals";
import { createPerson } from "@/features/persons/persons";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-liens-opportunites@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Liens-Opp-1", role: "membre" as const };

let memberId: string;
let bankId: string;

async function createOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", ...fields }, { id: memberId })).id;
}

/** Un consultant freelance, proposable sur une opportunité. */
const consultant = async (firstName: string, lastName: string) => (await createConsultant({ firstName, lastName, status: "freelance" }, { id: memberId })).id;

/** Le groupe de la colonne des liens qui porte ce libellé. */
const group = async (type: string, id: string, label: string) => (await linkedGroups(type, id)).find((candidate) => candidate.label === label);

/** Les enfants avant les parents : les propositions partent avec l'opportunité (cascade), qui retient l'entreprise et les personnes. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
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

  it("la fiche du contact montre l'opportunité sous « Opportunités », son étape en sous-titre, avec le lien vers sa fiche", async () => {
    const julie = (await createPerson({ firstName: "Julie", lastName: "Martin", companyId: bankId }, { id: memberId })).id;
    const opportunityId = await createOpportunity({ contactPersonId: julie, stage: "qualifie" });

    expect((await group("person", julie, "Opportunités"))?.records).toEqual([{ id: opportunityId, title: "Refonte Payroll", href: `/opportunites/${opportunityId}`, subtitle: "Qualifié" }]);
  });
});

/** D47, contrat 52 : un consultant proposé voit l'opportunité dans sa colonne des liens, avec le résultat de sa proposition. */
describe("colonne des liens du consultant proposé (CRM-109, D47, D54)", () => {
  it("la fiche de Julie Martin, retenue, montre l'opportunité sous « Opportunités proposées » avec « Retenu » en sous-titre et le lien vers sa fiche", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");
    await addProposal(opportunityId, { personId: julie }, { id: memberId });
    await changeProposal(opportunityId, julie, { result: "retenu" }, { id: memberId });

    expect((await group("person", julie, "Opportunités proposées"))?.records).toEqual([{ id: opportunityId, title: "Refonte Payroll", href: `/opportunites/${opportunityId}`, subtitle: "Retenu" }]);
  });

  it("le sous-titre suit le résultat de la proposition sur la fiche du consultant, et l'étape sur celle de l'entreprise", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");
    await addProposal(opportunityId, { personId: julie }, { id: memberId });

    await changeProposal(opportunityId, julie, { result: "entretien" }, { id: memberId });
    await updateObject("opportunity", opportunityId, { stage: "entretien_client" }, { id: memberId });

    expect((await group("person", julie, "Opportunités proposées"))?.records.map((record) => record.subtitle)).toEqual(["Entretien"]);
    expect((await group("company", bankId, "Opportunités"))?.records.map((record) => record.subtitle)).toEqual(["Entretien client"]);
  });

  it("n'affiche que les vingt dernières opportunités proposées et compte les autres", async () => {
    const julie = await consultant("Julie", "Martin");
    const total = LINKED_RECORDS_LIMIT + 3;
    for (let rang = 1; rang <= total; rang += 1) {
      await addProposal(await createOpportunity({ title: `Opportunité ${rang}` }), { personId: julie }, { id: memberId });
    }

    const proposed = await group("person", julie, "Opportunités proposées");
    expect(proposed?.records).toHaveLength(LINKED_RECORDS_LIMIT);
    expect(proposed?.more).toBe(3);
  });
});
