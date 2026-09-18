import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, company, consultantModule, consultantProfile, contactProfile, customFieldValue, emailLog, objectRedirect, opportunity, person, personEmail, user } from "@/db/schema";
import { deleteRecord, type DeleteBlocker } from "@/features/archive/delete";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createConsultant } from "@/features/consultants/consultants";
import { listHistory } from "@/features/history/history";
import { mergeRecords, planMerge } from "@/features/merge/merge";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { addProposal, changeProposal, listProposals } from "@/features/opportunities/proposals";
import { WON_STAGE } from "@/features/opportunities/schema";
import { createPerson } from "@/features/persons/persons";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-fusion-propositions@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Fusion-Prop-1", role: "membre" as const };

let memberId: string;
let bankId: string;

const actor = () => ({ id: memberId });

async function createOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", ...fields }, actor())).id;
}

const newCompany = async (name: string) => (await createObject("company", { name, type: "prospect" }, actor())).id;

/** Un contact de Banque X : l'opportunité ne désigne comme contact qu'une personne de son entreprise (D35). */
const newPerson = async (firstName: string, lastName: string) => (await createPerson({ firstName, lastName, companyId: bankId }, actor())).id;

/** « Marquer gagnée » arrive en 4.2d : une opportunité figée se pose directement en base. */
const winInDatabase = (opportunityId: string) => db.update(opportunity).set({ stage: WON_STAGE }).where(eq(opportunity.id, opportunityId));

/** Un consultant freelance, proposable sur une opportunité. */
const consultant = async (firstName: string, lastName: string) => (await createConsultant({ firstName, lastName, status: "freelance" }, actor())).id;

/** Les enfants avant les parents : les propositions partent avec l'opportunité (cascade), qui retient l'entreprise et les personnes. */
async function cleanup() {
  await db.delete(objectRedirect);
  await db.delete(emailLog);
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(customFieldValue);
  await db.delete(opportunity);
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(contactProfile);
  await db.delete(personEmail);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
});

beforeEach(async () => {
  await cleanup();
  bankId = await newCompany("Banque X");
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** Ce qui retient la suppression, tel que le refus 409 le rend au dialogue. */
async function blockersOf(type: string, id: string): Promise<DeleteBlocker[]> {
  const refusal = await deleteRecord(type, id).then(
    () => null,
    (error: unknown) => error,
  );
  expect(refusal).toMatchObject({ status: 409, code: "fiche_liee" });
  return (refusal as { details: { blockers: DeleteBlocker[] } }).details.blockers;
}

/** D47, contrat 54 : une fiche liée à une opportunité ne se supprime pas définitivement, et le refus nomme les opportunités. */
describe("suppression définitive d'une fiche liée à une opportunité (CRM-110, D47)", () => {
  it("refuse (409) de supprimer une entreprise liée à une opportunité, en la nommant", async () => {
    await createOpportunity();

    expect(await blockersOf("company", bankId)).toContainEqual({ key: "opportunity-companyId", label: "Opportunités", count: 1, titles: ["Refonte Payroll"] });
  });

  it("ne nomme que trois opportunités et compte les autres", async () => {
    for (const title of ["Refonte Payroll", "Migration HCM", "Audit Absences", "Déploiement Talent"]) await createOpportunity({ title });

    const held = (await blockersOf("company", bankId)).find((blocker) => blocker.label === "Opportunités");
    expect(held?.count).toBe(4);
    expect(held?.titles).toHaveLength(3);
  });

  it("refuse (409) de supprimer une personne liée comme contact d'une opportunité, en la nommant", async () => {
    const julie = await newPerson("Julie", "Martin");
    await createOpportunity({ contactPersonId: julie });

    expect(await blockersOf("person", julie)).toContainEqual({ key: "opportunity-contactPersonId", label: "Opportunités", count: 1, titles: ["Refonte Payroll"] });
  });
});

/** D47 : la fusion fait suivre à la fiche conservée ce qui la relie aux opportunités. */
describe("fusion d'une fiche liée à une opportunité (CRM-110, D47)", () => {
  it("fait suivre à l'entreprise conservée les opportunités de l'entreprise absorbée", async () => {
    const kept = await newCompany("Banque X SA");
    const opportunityId = await createOpportunity();

    await mergeRecords("company", kept, bankId, []);

    expect((await getObjectRecord("opportunity", opportunityId)).companyId).toBe(kept);
  });

  it("fait suivre à la personne conservée l'opportunité dont l'absorbée était le contact", async () => {
    const kept = await newPerson("Julie", "Martin");
    const absorbed = await newPerson("Julie", "Martin");
    const opportunityId = await createOpportunity({ contactPersonId: absorbed });

    await mergeRecords("person", kept, absorbed, []);

    expect((await getObjectRecord("opportunity", opportunityId)).contactPersonId).toBe(kept);
  });

  it("fait suivre à la personne conservée les propositions de l'absorbée", async () => {
    const kept = await consultant("Julie", "Martin");
    const absorbed = await consultant("Julie", "Martin");
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    await addProposal(opportunityId, { personId: absorbed }, actor());

    await mergeRecords("person", kept, absorbed, []);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: kept, result: "propose", proposedDailyRate: 650 }]);
  });

  it("fait suivre les propositions à la personne conservée même sur une opportunité gagnée : ce n'est pas un geste sur l'opportunité", async () => {
    const kept = await consultant("Julie", "Martin");
    const absorbed = await consultant("Julie", "Martin");
    const opportunityId = await createOpportunity();
    await addProposal(opportunityId, { personId: absorbed }, actor());
    await changeProposal(opportunityId, absorbed, { result: "retenu" }, actor());
    await winInDatabase(opportunityId);

    await mergeRecords("person", kept, absorbed, []);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: kept, result: "retenu" }]);
  });
});

/** D47, contrat 54 : deux personnes proposées sur la même opportunité n'en gardent qu'une, la plus avancée. */
describe("fusion de deux personnes proposées sur la même opportunité (CRM-110, D47)", () => {
  it("garde la proposition « Retenu » de l'absorbée avec son TJM de 700 €, sur une opportunité gagnée où la conservée était « Proposé » à 650 €", async () => {
    const kept = await consultant("Julie", "Martin");
    const absorbed = await consultant("Julie", "Martin");
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    await addProposal(opportunityId, { personId: kept }, actor());
    await addProposal(opportunityId, { personId: absorbed }, actor());
    await changeProposal(opportunityId, absorbed, { result: "retenu", proposedDailyRate: 700 }, actor());
    await winInDatabase(opportunityId);

    await mergeRecords("person", kept, absorbed, []);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: kept, result: "retenu", proposedDailyRate: 700 }]);
  });

  it("garde la proposition « Entretien » de la conservée avec son TJM de 700 € quand l'absorbée était « Refusé » à 650 €", async () => {
    const kept = await consultant("Julie", "Martin");
    const absorbed = await consultant("Julie", "Martin");
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    await addProposal(opportunityId, { personId: kept }, actor());
    await addProposal(opportunityId, { personId: absorbed }, actor());
    await changeProposal(opportunityId, kept, { result: "entretien", proposedDailyRate: 700 }, actor());
    await changeProposal(opportunityId, absorbed, { result: "refuse" }, actor());

    await mergeRecords("person", kept, absorbed, []);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: kept, result: "entretien", proposedDailyRate: 700 }]);
  });

  it("consigne dans l'entrée de fusion la proposition écartée, par le titre de l'opportunité, son résultat et son TJM", async () => {
    const kept = await consultant("Julie", "Martin");
    const absorbed = await consultant("Julie", "Martin");
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    await addProposal(opportunityId, { personId: kept }, actor());
    await addProposal(opportunityId, { personId: absorbed }, actor());
    await changeProposal(opportunityId, kept, { result: "retenu" }, actor());

    await mergeRecords("person", kept, absorbed, []);

    const merged = (await listHistory("person", kept)).find((entry) => entry.action === "fusionnee");
    expect(merged?.oldValue).toContain("Propositions : Refonte Payroll, Proposé, TJM de vente proposé 650,00 €");
  });

  it("annonce dans l'aperçu une seule proposition déplacée quand l'absorbée en a deux, dont une écartée", async () => {
    const kept = await consultant("Julie", "Martin");
    const absorbed = await consultant("Julie", "Martin");
    const shared = await createOpportunity();
    await addProposal(shared, { personId: kept }, actor());
    await changeProposal(shared, kept, { result: "retenu" }, actor());
    await addProposal(shared, { personId: absorbed }, actor());
    await addProposal(await createOpportunity({ title: "Migration HCM" }), { personId: absorbed }, actor());

    expect((await planMerge("person", kept, absorbed)).moved).toContainEqual({ key: "opportunity_consultant", label: "Propositions", count: 1 });
  });
});
