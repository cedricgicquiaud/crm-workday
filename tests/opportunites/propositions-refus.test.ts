import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postProposal } from "@/app/api/opportunites/[id]/propositions/route";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createConsultant } from "@/features/consultants/consultants";
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
