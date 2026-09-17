import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as archiveRecord } from "@/app/api/objets/[type]/[id]/archiver/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { search } from "@/features/search/search";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-palette-opportunite@exemple.fr", firstName: "Léo", lastName: "Fabre", password: "MotDePasse-Palette-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

/** Ce que la palette montre d'une opportunité trouvée : son objet, son titre, son sous-titre et son adresse. */
const hitsFor = async (query: string) => (await search(query)).filter((result) => result.type === "opportunity");

async function create(title: string, stage?: string, companyId = bankId): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title, companyId, modules: ["hcm"], expectedClose: "2026-10-30" }, memberCookie));
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  /* Gagnée et perdue se posent par leur geste (4.2d) : la palette les montre quand même (D48). */
  if (stage) await db.update(opportunity).set({ stage }).where(eq(opportunity.id, id));
  return id;
}

async function archive(id: string): Promise<void> {
  const res = await archiveRecord(jsonRequest("POST", `/api/objets/opportunity/${id}/archiver`, undefined, memberCookie), { params: Promise.resolve({ type: "opportunity", id }) });
  expect(res.status).toBe(200);
}

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade). */
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

/** D48, contrat 37 : on retrouve une affaire par son nom ou par celui du client, avec son étape sous le titre. */
describe("opportunité dans la palette (CRM-106, D48, contrat 37)", () => {
  it("la retrouve par une sous-chaîne de son titre, sous « Négociation · Banque X », et mène à sa fiche", async () => {
    const id = await create("Refonte Payroll", "negociation");

    expect(await hitsFor("payr")).toEqual([{ type: "opportunity", id, title: "Refonte Payroll", subtitle: "Négociation · Banque X", href: `/opportunites/${id}` }]);
  });
});
