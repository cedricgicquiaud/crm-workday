import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-api-opportunite@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Opportunite-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

async function create(input: Record<string, unknown>): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade) ; ses modules partent avec elle. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D31, D34 : titre, entreprise, au moins un module et clôture prévue suffisent à créer une opportunité. */
describe("création d'une opportunité (CRM-103, D31, D34)", () => {
  it("crée « Refonte Payroll » chez Banque X sur HCM et Payroll, clôture au 30 octobre, et la relit telle quelle", async () => {
    const id = await create({ title: "Refonte Payroll", companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" });
    expect(await read(id)).toMatchObject({ title: "Refonte Payroll", companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30", ownerId: memberId });
  });

  it("accepte une clôture prévue déjà passée, sans signal (D48)", async () => {
    const id = await create({ title: "Support Absence", companyId: bankId, modules: ["absence"], expectedClose: "2020-01-15" });
    expect((await read(id)).expectedClose).toBe("2020-01-15");
  });
});
