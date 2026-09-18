import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { GET as getLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { activity, auditLog, company, lead, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listObjectRecords } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-conversion-opportunite-refus@exemple.fr", firstName: "Oscar", lastName: "Lemaire", password: "MotDePasse-Conv-Opp-Refus-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createLead(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const convert = (id: string, body: unknown) => postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, body, memberCookie), byId(id));
const readLead = async (id: string) => (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;
const fieldsOf = async (res: Response) => ((await res.json()) as { fields: Record<string, string> }).fields;

/** Ce que la conversion aurait pu écrire : aucune de ces listes ne doit bouger après un refus. */
const written = async () => ({
  persons: (await listObjectRecords("person", { includeArchived: true })).map((record) => record.name),
  companies: (await listObjectRecords("company", { includeArchived: true })).map((record) => record.name),
  opportunities: (await listObjectRecords("opportunity", { includeArchived: true })).map((record) => record.title),
});

const complete = { title: "Besoin Workday · Banque X", modules: ["hcm"], expectedClose: "2026-12-15" };

/** Les enfants avant les parents : une opportunité retient son lead, son contact et son entreprise (clés sans cascade). */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(activity);
  await db.delete(lead);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("refus d'une case cochée incomplète (CRM-111, D52, contrat 58)", () => {
  it.each([
    ["title", { ...complete, title: " " }, "« Titre » est obligatoire."],
    ["modules", { ...complete, modules: [] }, "« Modules Workday » est obligatoire."],
    ["expectedClose", { ...complete, expectedClose: "" }, "« Clôture prévue » est obligatoire."],
  ])("refuse (400) sous « %s », et ne crée ni personne, ni entreprise, ni opportunité, ni l'avancement « Converti »", async (key, block, message) => {
    const id = await createLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", need: "Paie", origin: "linkedin" });
    const before = await written();

    const res = await convert(id, { opportunity: block });

    expect(res.status).toBe(400);
    expect(await fieldsOf(res)).toEqual({ [key]: message });
    expect(await written()).toEqual(before);
    expect(await readLead(id)).toMatchObject({ stage: "nouveau", convertedPersonId: null, convertedCompanyId: null });
  });
});
