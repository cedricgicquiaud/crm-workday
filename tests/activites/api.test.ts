import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postActivity } from "@/app/api/objets/[type]/[id]/activites/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-activites@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Activites-1", role: "membre" as const };

let memberCookie: string;

const on = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(person);
  await db.delete(company);
}

async function createCompany(name: string): Promise<string> {
  const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name, type: "client" }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createPerson(lastName: string, companyId?: string): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Claire", lastName, ...(companyId ? { companyId } : {}) }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("API des activités — création (CRM-43, D10)", () => {
  it("écrit une note sur une personne avec l'entreprise du moment en parent, et sans parent quand la fiche n'en a pas", async () => {
    const companyId = await createCompany("Banque Solveige");
    const personId = await createPerson("Morvan", companyId);

    const onPerson = await postActivity(jsonRequest("POST", `/api/objets/person/${personId}/activites`, { type: "note", body: "Le client valide le renouvellement." }, memberCookie), on("person", personId));
    expect(onPerson.status).toBe(201);
    expect(await onPerson.json()).toMatchObject({ objectType: "person", objectId: personId, parentType: "company", parentId: companyId, type: "note", body: "Le client valide le renouvellement." });

    const onCompany = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "note", body: "Réunion de cadrage à prévoir." }, memberCookie), on("company", companyId));
    expect(onCompany.status).toBe(201);
    expect(await onCompany.json()).toMatchObject({ objectType: "company", objectId: companyId, parentType: null, parentId: null, type: "note" });
  });
});
