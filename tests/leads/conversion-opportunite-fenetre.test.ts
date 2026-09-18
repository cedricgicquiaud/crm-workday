import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getPreview } from "@/app/api/leads/[id]/conversion/route";
import { POST as postLead } from "@/app/api/leads/route";
import { auditLog, lead, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-conversion-opportunite-fenetre@exemple.fr", firstName: "Célia", lastName: "Arnaud", password: "MotDePasse-Conv-Opp-Fen-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createLead(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const previewOf = async (id: string) => {
  const res = await getPreview(jsonRequest("GET", `/api/leads/${id}/conversion`, undefined, memberCookie), byId(id));
  expect(res.status).toBe(200);
  return (await res.json()) as { createsOpportunity: boolean };
};

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

describe("case « Créer une opportunité » de l'aperçu (CRM-111, CRM-113, D50, contrats 55 et 57)", () => {
  it("la coche par défaut pour un lead dont le besoin est rempli", async () => {
    const id = await createLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", need: "Déploiement HCM", origin: "linkedin" });

    expect((await previewOf(id)).createsOpportunity).toBe(true);
  });

  it("la laisse décochée pour un lead sans besoin, ou dont le besoin n'est que des espaces", async () => {
    const empty = await createLead({ firstName: "Paul", lastName: "Leroy", companyName: "Banque Y", origin: "linkedin" });
    const blank = await createLead({ firstName: "Nina", lastName: "Morel", companyName: "Banque Z", need: "   ", origin: "linkedin" });

    expect((await previewOf(empty)).createsOpportunity).toBe(false);
    expect((await previewOf(blank)).createsOpportunity).toBe(false);
  });
});
