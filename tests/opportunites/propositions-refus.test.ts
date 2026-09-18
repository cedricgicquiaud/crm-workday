import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postProposal } from "@/app/api/opportunites/[id]/propositions/route";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createConsultant } from "@/features/consultants/consultants";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
import { listProposals } from "@/features/opportunities/proposals";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-propositions-refus@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Propositions-2", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let opportunityId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const propose = (id: string, input: unknown, cookie: string | undefined = memberCookie) => postProposal(jsonRequest("POST", `/api/opportunites/${id}/propositions`, input, cookie), byId(id));

const consultant = async (firstName: string, lastName: string) => (await createConsultant({ firstName, lastName, status: "freelance" }, { id: memberId })).id;

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
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

beforeEach(async () => {
  await cleanup();
  const bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
  opportunityId = (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650 }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D44, contrat 53 : seul un consultant se propose. */
describe("refus d'une personne sans profil consultant (CRM-107, D44)", () => {
  it("répond 400 sous « personId » pour un contact sans profil consultant, et ne propose rien", async () => {
    const paul = (await createObject("person", { firstName: "Paul", lastName: "Durand" }, { id: memberId })).id;

    const res = await propose(opportunityId, { personId: paul });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { personId: "Seul un consultant se propose sur une opportunité : « Paul Durand » n'a pas de profil consultant." } });
    expect(await listProposals(opportunityId)).toEqual([]);
  });
});

/** D44, contrat 53 : un consultant est proposé une fois par opportunité. */
describe("refus d'un consultant déjà proposé (CRM-107, D44)", () => {
  it("répond 409 au second ajout de Julie Martin, et garde une seule proposition et une seule ligne d'historique", async () => {
    const julie = await consultant("Julie", "Martin");
    expect((await propose(opportunityId, { personId: julie })).status).toBe(201);

    const res = await propose(opportunityId, { personId: julie });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ message: "« Julie Martin » figure déjà parmi les consultants proposés." });
    expect(await listProposals(opportunityId)).toHaveLength(1);
    expect((await listHistory("opportunity", opportunityId)).filter((entry) => entry.action === "proposition_ajoutee")).toHaveLength(1);
  });
});

/** D44, contrat 53 : un consultant archivé ne se propose pas. */
describe("refus d'un consultant archivé (CRM-107, D44)", () => {
  it("répond 409 en nommant Julie Martin archivée, et ne propose rien", async () => {
    const julie = await consultant("Julie", "Martin");
    await archiveRecord("person", julie, { id: memberId });

    const res = await propose(opportunityId, { personId: julie });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ message: "« Julie Martin » est archivée : restaurez sa fiche pour la proposer." });
    expect(await listProposals(opportunityId)).toEqual([]);
  });
});

/** D55 : l'entrée se valide avant la première requête ; une clé que l'ajout ne prévoit pas répond 400, jamais ignorée. */
describe("entrée de l'ajout (CRM-107, D55)", () => {
  it("répond 400 sous « result » : le résultat d'un ajout est toujours « Proposé »", async () => {
    const julie = await consultant("Julie", "Martin");

    const res = await propose(opportunityId, { personId: julie, result: "retenu" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { result: "« result » ne se donne pas à l'ajout d'un consultant." } });
    expect(await listProposals(opportunityId)).toEqual([]);
  });

  it.each([
    ["absent", {}],
    ["mal formé", { personId: "julie" }],
    ["d'un autre type", { personId: 42 }],
    ["inconnu", { personId: "00000000-0000-4000-8000-000000000000" }],
  ])("répond 400 sous « personId » pour un consultant %s", async (_case, input) => {
    const res = await propose(opportunityId, input);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { personId: "Choisissez un consultant." } });
  });
});
