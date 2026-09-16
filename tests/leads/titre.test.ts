import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getLead, PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { auditLog, lead, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-titre-lead@exemple.fr", firstName: "Lina", lastName: "Morel", password: "MotDePasse-Titre-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const titleOf = async (id: string) => ((await (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json()) as { title: string }).title;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(lead);
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

/** D3 : le titre d'un lead se calcule, il ne se saisit jamais. */
describe("titre calculé d'un lead (CRM-90, D3, contrat 2)", () => {
  it("s'écrit « Julie Martin · Banque X » avec un prénom, un nom et un nom d'entreprise", async () => {
    expect(await titleOf(await create({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", origin: "linkedin" }))).toBe("Julie Martin · Banque X");
  });

  it("s'écrit « Paul Durand » sans nom d'entreprise", async () => {
    expect(await titleOf(await create({ firstName: "Paul", lastName: "Durand", origin: "autre" }))).toBe("Paul Durand");
  });

  it("s'écrit « Julie » avec un prénom seul", async () => {
    expect(await titleOf(await create({ firstName: "Julie", origin: "autre" }))).toBe("Julie");
  });

  it("s'écrit « Banque Y » avec le seul nom d'entreprise", async () => {
    expect(await titleOf(await create({ companyName: "Banque Y", origin: "partenaire" }))).toBe("Banque Y");
  });

  it("suit le changement du nom d'entreprise", async () => {
    const id = await create({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", origin: "linkedin" });
    const res = await patchLead(jsonRequest("PATCH", `/api/leads/${id}`, { companyName: "Banque Z" }, memberCookie), byId(id));
    expect(res.status).toBe(200);
    expect(await titleOf(id)).toBe("Julie Martin · Banque Z");
  });
});
