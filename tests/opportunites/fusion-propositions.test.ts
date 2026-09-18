import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, company, consultantModule, consultantProfile, contactProfile, customFieldValue, emailLog, objectRedirect, opportunity, person, personEmail, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { mergeRecords } from "@/features/merge/merge";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-fusion-propositions@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Fusion-Prop-1", role: "membre" as const };

let memberId: string;
let bankId: string;

const actor = () => ({ id: memberId });

async function createOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", ...fields }, actor())).id;
}

const newCompany = async (name: string) => (await createObject("company", { name, type: "prospect" }, actor())).id;

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

/** D47 : la fusion fait suivre à la fiche conservée ce qui la relie aux opportunités. */
describe("fusion d'une fiche liée à une opportunité (CRM-110, D47)", () => {
  it("fait suivre à l'entreprise conservée les opportunités de l'entreprise absorbée", async () => {
    const kept = await newCompany("Banque X SA");
    const opportunityId = await createOpportunity();

    await mergeRecords("company", kept, bankId, []);

    expect((await getObjectRecord("opportunity", opportunityId)).companyId).toBe(kept);
  });
});
