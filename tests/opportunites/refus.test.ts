import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
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

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function created(): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", valid(), memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function patch(id: string, input: Record<string, unknown>): Promise<Refusal> {
  const res = await patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
  const body = (await res.json()) as { fields?: Record<string, string> };
  return { status: res.status, fields: body.fields ?? {} };
}

const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

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

  it("accepte un TJM de vente cible de 0,01, de 19,99 ou de 5 000", async () => {
    for (const targetDailyRate of [0.01, 19.99, 5000]) expect((await post({ ...valid(), targetDailyRate })).status, String(targetDailyRate)).toBe(201);
  });

  it("refuse sous le champ une durée estimée de 0, de 1 001 ou de 2,5 jours, et accepte 1 et 1 000", async () => {
    for (const estimatedDays of [0, 1001, 2.5]) {
      const refusal = await post({ ...valid(), estimatedDays });
      expect(refusal.status, String(estimatedDays)).toBe(400);
      expect(Object.keys(refusal.fields), String(estimatedDays)).toEqual(["estimatedDays"]);
    }
    expect(await count()).toBe(0);
    for (const estimatedDays of [1, 1000]) expect((await post({ ...valid(), estimatedDays })).status, String(estimatedDays)).toBe(201);
  });

  it("refuse sous le champ une opportunité sans clôture prévue, ou dont la clôture n'est pas une date", async () => {
    const { expectedClose: _omitted, ...withoutClose } = valid();
    for (const input of [withoutClose, { ...valid(), expectedClose: "2026-13-45" }]) {
      const refusal = await post(input);
      expect(refusal.status).toBe(400);
      expect(Object.keys(refusal.fields)).toEqual(["expectedClose"]);
    }
    expect(await count()).toBe(0);
  });

  it("refuse sous la clé une clé qu'aucun champ ne prévoit, et n'en crée aucune (D55)", async () => {
    const refusal = await post({ ...valid(), budget: 40000 });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["budget"]);
    expect(await count()).toBe(0);
  });
});

/** D34, contrat 39 : sur la fiche, un champ obligatoire ne se vide pas ; le refus tombe sous le champ et la valeur enregistrée reste. */
describe("champs obligatoires vidés en modification (CRM-103, D34, contrat 39)", () => {
  it("refuse sous le champ de vider le titre, l'entreprise ou la clôture prévue, ou de retirer le dernier module, et garde la valeur enregistrée", async () => {
    const id = await created();
    for (const input of [{ title: "  " }, { companyId: null }, { expectedClose: "" }, { modules: [] }]) {
      const [key] = Object.keys(input);
      const refusal = await patch(id, input);
      expect(refusal.status, key).toBe(400);
      expect(Object.keys(refusal.fields), key).toEqual([key]);
    }
    expect(await read(id)).toMatchObject(valid());
  });

  it("refuse sous le champ une entreprise qui n'existe pas, et garde l'entreprise enregistrée", async () => {
    const id = await created();
    const refusal = await patch(id, { companyId: "00000000-0000-4000-8000-000000000000" });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["companyId"]);
    expect((await read(id)).companyId).toBe(bankId);
  });
});

/** D31 : le montant estimé se calcule depuis le TJM et la durée ; il ne se saisit ni à la création ni en modification. */
describe("montant estimé en lecture seule (CRM-103, D31)", () => {
  it("refuse sous le champ un montant estimé fourni à la création ou en modification, en disant qu'il se calcule", async () => {
    const creation = await post({ ...valid(), estimatedAmount: 50000 });
    expect(creation.status).toBe(400);
    expect(creation.fields.estimatedAmount).toMatch(/se calcule/);
    const id = await created();
    const modification = await patch(id, { estimatedAmount: 50000 });
    expect(modification.status).toBe(400);
    expect(modification.fields.estimatedAmount).toMatch(/se calcule/);
    expect((await read(id)).estimatedAmount).toBeNull();
  });
});

/** D55 : une modification ne porte que des champs saisissables ; le reste répond 400 et rien n'est écrit. */
describe("clé imprévue en modification (CRM-103, D55)", () => {
  it("refuse sous la clé une clé qu'aucun champ ne prévoit, et n'écrit pas le titre envoyé avec elle", async () => {
    const id = await created();
    const refusal = await patch(id, { title: "Refonte Payroll 2027", budget: 40000 });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.fields)).toEqual(["budget"]);
    expect((await read(id)).title).toBe("Refonte Payroll");
  });
});
