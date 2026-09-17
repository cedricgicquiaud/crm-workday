import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-refus-opportunite@exemple.fr", firstName: "Malo", lastName: "Garnier", password: "MotDePasse-Refus-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

type Refusal = { status: number; fields: Record<string, string> };

/** Une opportunité valide, que chaque cas abîme d'un seul champ. */
const valid = () => ({ title: "Refonte Payroll", companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" });

async function post(input: Record<string, unknown>): Promise<Refusal> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", input, memberCookie));
  const body = (await res.json()) as { fields?: Record<string, string> };
  return { status: res.status, fields: body.fields ?? {} };
}

const count = async () => (await db.select({ id: opportunity.id }).from(opportunity)).length;

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

/** D31, contrat 39 : chaque champ refuse ce qui sort de ses bornes, sous le champ, et rien n'est créé. */
describe("bornes d'une opportunité à la création (CRM-103, D31, contrat 39)", () => {
  it("refuse un titre de 121 caractères sous le champ, et n'en crée aucune", async () => {
    const refusal = await post({ ...valid(), title: "T".repeat(121) });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["title"]);
    expect(await count()).toBe(0);
  });

  it("accepte un titre de 120 caractères", async () => {
    expect((await post({ ...valid(), title: "T".repeat(120) })).status).toBe(201);
  });

  it("refuse un titre fait d'espaces sous le champ", async () => {
    const refusal = await post({ ...valid(), title: "   " });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["title"]);
  });

  it("refuse une opportunité sans entreprise sous le champ", async () => {
    const { companyId: _omitted, ...withoutCompany } = valid();
    const refusal = await post(withoutCompany);
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["companyId"]);
  });

  it("refuse sous le champ une entreprise qui n'existe pas, identifiant mal formé compris, et n'en crée aucune", async () => {
    for (const companyId of ["00000000-0000-4000-8000-000000000000", "pas-un-uuid"]) {
      const refusal = await post({ ...valid(), companyId });
      expect(refusal.status, companyId).toBe(400);
      expect(Object.keys(refusal.fields), companyId).toEqual(["companyId"]);
    }
    expect(await count()).toBe(0);
  });

  it("refuse sous le champ une opportunité sans module, liste vide ou absente, et n'en crée aucune", async () => {
    const { modules: _omitted, ...withoutModules } = valid();
    for (const input of [withoutModules, { ...valid(), modules: [] }]) {
      const refusal = await post(input);
      expect(refusal.status).toBe(400);
      expect(Object.keys(refusal.fields)).toEqual(["modules"]);
    }
    expect(await count()).toBe(0);
  });

  it("refuse sous le champ un module hors de la liste des modules Workday", async () => {
    const refusal = await post({ ...valid(), modules: ["hcm", "sap_fico"] });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["modules"]);
  });

  it("refuse un besoin de 2 001 caractères sous le champ, en accepte un de 2 000", async () => {
    const refusal = await post({ ...valid(), need: "B".repeat(2001) });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["need"]);
    expect((await post({ ...valid(), need: "B".repeat(2000) })).status).toBe(201);
  });

  it("refuse sous le champ un TJM de vente cible de 0, de 5 000,01 ou à trois décimales, et n'en crée aucune", async () => {
    for (const targetDailyRate of [0, 5000.01, 650.125]) {
      const refusal = await post({ ...valid(), targetDailyRate });
      expect(refusal.status, String(targetDailyRate)).toBe(400);
      expect(Object.keys(refusal.fields), String(targetDailyRate)).toEqual(["targetDailyRate"]);
    }
    expect(await count()).toBe(0);
  });
});
