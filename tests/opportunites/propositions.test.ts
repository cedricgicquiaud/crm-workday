import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postProposal } from "@/app/api/opportunites/[id]/propositions/route";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { upsertConsultantProfile } from "@/features/consultants/consultant-profile";
import { createConsultant } from "@/features/consultants/consultants";
import { createObject } from "@/features/objects/service";
import { listProposals } from "@/features/opportunities/proposals";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-propositions@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Propositions-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const propose = (opportunityId: string, input: unknown) => postProposal(jsonRequest("POST", `/api/opportunites/${opportunityId}/propositions`, input, memberCookie), byId(opportunityId));

async function createOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", ...fields }, { id: memberId })).id;
}

/** Un consultant freelance ; `profile` se règle ensuite sur son profil, comme sur sa fiche (la date de disponibilité ne se saisit pas à la création). */
async function consultant(firstName: string, lastName: string, profile: Record<string, unknown> = {}): Promise<string> {
  const { id } = await createConsultant({ firstName, lastName, status: "freelance" }, { id: memberId });
  if (Object.keys(profile).length > 0) await upsertConsultantProfile(id, profile, { id: memberId });
  return id;
}

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
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D44, D45, contrat 51 : un consultant ajouté est « Proposé », son TJM de vente proposé pré-rempli du TJM cible. */
describe("ajout d'un consultant sur une opportunité (CRM-107, D44, D45)", () => {
  it("relit Julie Martin « Proposé » à 650 € sur une opportunité au TJM cible de 650 €", async () => {
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    const julie = await consultant("Julie", "Martin");

    expect((await propose(opportunityId, { personId: julie })).status).toBe(201);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: julie, name: "Julie Martin", result: "propose", proposedDailyRate: 650 }]);
  });

  it("ajoute un consultant sans TJM proposé sur une opportunité sans TJM cible", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");

    expect((await propose(opportunityId, { personId: julie })).status).toBe(201);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: julie, result: "propose", proposedDailyRate: null }]);
  });

  /* Contrat 51 : une mission en cours n'empêche pas de proposer le consultant pour la suivante. */
  it("ajoute un consultant « En mission » jusqu'au 31 décembre 2099", async () => {
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    const marc = await consultant("Marc", "Petit", { availableFrom: "2099-12-31" });

    expect((await propose(opportunityId, { personId: marc })).status).toBe(201);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: marc, result: "propose" }]);
  });
});
