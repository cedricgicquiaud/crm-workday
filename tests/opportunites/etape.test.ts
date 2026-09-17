import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-etape-opportunite@exemple.fr", firstName: "Nora", lastName: "Benali", password: "MotDePasse-Etape-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const patch = (id: string, input: Record<string, unknown>) => patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

async function create(title = "Refonte Payroll"): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title, companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade) ; ses modules partent avec elle. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(company);
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.delete(company);
  await closeDb();
});

/** D32, contrat 34 : on passe librement entre les six étapes en cours, dans les deux sens. */
describe("passage d'étape (CRM-105, D32, contrat 34)", () => {
  it("passe de « Nouveau besoin » à « Entretien client », puis revient à « Qualifié »", async () => {
    const id = await create();
    expect((await patch(id, { stage: "entretien_client" })).status).toBe(200);
    expect((await read(id)).stage).toBe("entretien_client");
    expect((await patch(id, { stage: "qualifie" })).status).toBe(200);
    expect((await read(id)).stage).toBe("qualifie");
  });
});

/** D33, contrats 31 et 34 : la probabilité se déduit de l'étape, à chaque lecture. */
describe("probabilité (CRM-105, D33, contrats 31 et 34)", () => {
  it("vaut 10 à la création, 50 en « Entretien client », puis 20 au retour à « Qualifié »", async () => {
    const id = await create();
    expect((await read(id)).probability).toBe(10);
    await patch(id, { stage: "entretien_client" });
    expect((await read(id)).probability).toBe(50);
    await patch(id, { stage: "qualifie" });
    expect((await read(id)).probability).toBe(20);
  });
});
