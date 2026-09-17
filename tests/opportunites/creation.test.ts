import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, objectRedirect, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { mergeRecords } from "@/features/merge/merge";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-creation-opportunite@exemple.fr", firstName: "Léa", lastName: "Morel", password: "MotDePasse-Creation-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

type Response_ = { status: number; body: Record<string, unknown> & { fields?: Record<string, string>; message?: string } };

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function post(input: Record<string, unknown>): Promise<Response_> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", input, memberCookie));
  return { status: res.status, body: (await res.json()) as Response_["body"] };
}

async function patch(id: string, input: Record<string, unknown>): Promise<Response_> {
  const res = await patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
  return { status: res.status, body: (await res.json()) as Response_["body"] };
}

const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

const newCompany = async (name: string) => (await createObject("company", { name, type: "prospect" }, { id: memberId })).id;

const opportunityAt = (companyId: string) => ({ title: "Refonte Payroll", companyId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" });

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade). */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(objectRedirect);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** Une entreprise absorbée par une fusion a une fiche conservée : c'est elle que l'opportunité désigne. */
describe("entreprise absorbée par une fusion (CRM-104, D36)", () => {
  it("enregistre la fiche conservée quand la création désigne l'entreprise absorbée", async () => {
    const kept = await newCompany("Banque X");
    const absorbed = await newCompany("Banque X SA");
    await mergeRecords("company", kept, absorbed, []);

    const created = await post(opportunityAt(absorbed));
    expect(created.status).toBe(201);
    expect((await read(String(created.body.id))).companyId).toBe(kept);
  });

  it("enregistre la fiche conservée quand la modification désigne l'entreprise absorbée", async () => {
    const kept = await newCompany("Banque X");
    const absorbed = await newCompany("Banque X SA");
    const other = await newCompany("Acme");
    await mergeRecords("company", kept, absorbed, []);
    const { body } = await post(opportunityAt(other));

    expect((await patch(String(body.id), { companyId: absorbed })).status).toBe(200);
    expect((await read(String(body.id))).companyId).toBe(kept);
  });
});
