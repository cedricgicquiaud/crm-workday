import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getCompany } from "@/app/api/entreprises/[id]/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-entreprises@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Entreprises-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("API des entreprises — création (CRM-34, D1, D11)", () => {
  it("un membre crée une entreprise avec raison sociale et type (201), la relit par son identifiant : il en est le créateur et le responsable", async () => {
    const created = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "ACME SAS", type: "client" }, memberCookie));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const read = await getCompany(jsonRequest("GET", `/api/entreprises/${id}`, undefined, memberCookie), byId(id));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ id, name: "ACME SAS", type: "client", paymentTerms: "30_jours", country: "France", ownerId: memberId, createdBy: memberId, archivedAt: null });
  });
});
