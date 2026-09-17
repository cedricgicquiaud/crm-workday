import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-api-opportunite@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Opportunite-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const patch = (id: string, input: Record<string, unknown>) => patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
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

  it("relit un démarrage souhaité posé, et le laisse vide quand il n'est pas donné", async () => {
    const dated = await create({ title: "Déploiement Time Tracking", companyId: bankId, modules: ["time_tracking"], expectedClose: "2026-10-30", desiredStart: "2026-11-02" });
    const undated = await create({ title: "Audit Finance", companyId: bankId, modules: ["finance"], expectedClose: "2026-10-30" });
    expect((await read(dated)).desiredStart).toBe("2026-11-02");
    expect((await read(undated)).desiredStart).toBeNull();
  });
});

/** D31, contrat 33 : le montant estimé est le TJM de vente cible multiplié par la durée estimée ; il manque si l'un manque. */
describe("montant estimé (CRM-103, D31, contrat 33)", () => {
  it("vaut 39 000 pour un TJM de 650 sur 60 jours", async () => {
    const id = await create({ title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650, estimatedDays: 60 });
    expect((await read(id)).estimatedAmount).toBe(39000);
  });

  it("est vide quand le TJM ou la durée manque", async () => {
    const withoutDays = await create({ title: "Sans durée", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650 });
    const withoutRate = await create({ title: "Sans TJM", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", estimatedDays: 60 });
    expect((await read(withoutDays)).estimatedAmount).toBeNull();
    expect((await read(withoutRate)).estimatedAmount).toBeNull();
  });

  it("redevient vide quand on vide la durée", async () => {
    const id = await create({ title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650, estimatedDays: 60 });
    expect((await patch(id, { estimatedDays: null })).status).toBe(200);
    expect((await read(id)).estimatedAmount).toBeNull();
  });
});

/** D34 : tout champ saisissable se règle sur la fiche et se relit. */
describe("modification d'une opportunité (CRM-103, D34)", () => {
  it("accepte de reporter la clôture prévue à une date déjà passée (D48)", async () => {
    const id = await create({ title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30" });
    expect((await patch(id, { expectedClose: "2021-03-01" })).status).toBe(200);
    expect((await read(id)).expectedClose).toBe("2021-03-01");
  });

  it("remplace les modules en une écriture, relus dans l'ordre de la liste, avec une seule ligne d'historique", async () => {
    const id = await create({ title: "Refonte Payroll", companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" });
    expect((await patch(id, { modules: ["finance", "hcm"] })).status).toBe(200);
    expect((await read(id)).modules).toEqual(["hcm", "finance"]);
    const lines = (await listHistory("opportunity", id)).filter((entry) => entry.field === "modules").map((entry) => [entry.oldValue, entry.newValue]);
    expect(lines).toEqual([["hcm,payroll", "hcm,finance"]]);
  });
});
