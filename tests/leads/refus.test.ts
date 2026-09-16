import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getLead, PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { auditLog, lead, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-refus-lead@exemple.fr", firstName: "Hugo", lastName: "Lenoir", password: "MotDePasse-Refus-1", role: "membre" as const };

const NAME_RULE = "Renseignez un prénom, un nom ou une entreprise";

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const create = (input: Record<string, unknown>) => postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
const patch = (id: string, input: Record<string, unknown>) => patchLead(jsonRequest("PATCH", `/api/leads/${id}`, input, memberCookie), byId(id));
const read = async (id: string) => (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;
const countLeads = async () => (await db.select({ id: lead.id }).from(lead)).length;

async function createdId(input: Record<string, unknown>): Promise<string> {
  const res = await create(input);
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

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

/** D4, contrat 10 : un lead nomme quelqu'un ou une entreprise, et dit d'où il vient. */
describe("refus de la règle des trois champs (CRM-91, D4, contrat 10)", () => {
  it("refuse (400) une création sans prénom, nom ni nom d'entreprise, avec un seul message sous le groupe, et ne crée rien", async () => {
    const before = await countLeads();
    const res = await create({ firstName: "  ", lastName: "", origin: "linkedin", email: "sans.nom@exemple.fr" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string; fields: Record<string, string> };
    expect(body.message).toBe(NAME_RULE);
    expect(Object.values(body.fields)).toEqual([NAME_RULE]);
    expect(await countLeads()).toBe(before);
  });

  it("refuse (400) une création sans origine, sous l'origine, et ne crée rien", async () => {
    const before = await countLeads();
    const res = await create({ firstName: "Julie" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { origin: "« Origine » est obligatoire." } });
    expect(await countLeads()).toBe(before);
  });

  it("refuse (400) de vider le dernier des trois champs, et garde la valeur enregistrée", async () => {
    const id = await createdId({ firstName: "Julie", origin: "linkedin" });
    const res = await patch(id, { firstName: "" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe(NAME_RULE);
    expect(await read(id)).toMatchObject({ firstName: "Julie", title: "Julie" });
  });

  it("accepte de vider un des trois champs quand un autre reste", async () => {
    const id = await createdId({ firstName: "Julie", companyName: "Banque X", origin: "linkedin" });
    expect((await patch(id, { firstName: "" })).status).toBe(200);
    expect(await read(id)).toMatchObject({ firstName: null, title: "Banque X" });
  });

  it("refuse (400) de saisir le titre, qui se calcule", async () => {
    const res = await create({ firstName: "Julie", origin: "linkedin", title: "Autre titre" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { title: "« Titre » se calcule depuis le prénom, le nom et le nom de l'entreprise, et ne se saisit pas." } });
  });
});

/** D2, D5, D6, contrat 11 : les bornes du lead sont celles de la personne, refusées sous le champ. */
describe("refus par les descripteurs du lead (CRM-90, contrat 11)", () => {
  const long = (length: number) => "a".repeat(length);
  const cases: [string, Record<string, unknown>, string, string][] = [
    ["une origine hors liste", { origin: "salon" }, "origin", "Valeur hors liste pour « Origine »."],
    ["un score de 0", { score: 0 }, "score", "« Score » doit être compris entre 1 et 3."],
    ["un score de 4", { score: 4 }, "score", "« Score » doit être compris entre 1 et 3."],
    ["un score de 2,5", { score: 2.5 }, "score", "« Score » doit être un nombre entier."],
    ["un email mal formé", { email: "julie.martin" }, "email", "Cette adresse n'est pas valide."],
    ["un email de 201 caractères", { email: `${long(190)}@exemple.fr` }, "email", "« Email » dépasse 200 caractères."],
    ["un téléphone de 41 caractères", { phone: "0".repeat(41) }, "phone", "« Téléphone » dépasse 40 caractères."],
    ["un LinkedIn sans http(s)://", { linkedin: "linkedin.com/in/julie" }, "linkedin", "Le lien LinkedIn doit être une adresse web (https://…)."],
    ["un LinkedIn de 201 caractères", { linkedin: `https://${long(193)}` }, "linkedin", "« LinkedIn » dépasse 200 caractères."],
    ["un poste de 121 caractères", { jobTitle: long(121) }, "jobTitle", "« Poste » dépasse 120 caractères."],
    ["un nom d'entreprise de 121 caractères", { companyName: long(121) }, "companyName", "« Nom de l'entreprise » dépasse 120 caractères."],
    ["un besoin de 2 001 caractères", { need: long(2001) }, "need", "« Besoin » dépasse 2000 caractères."],
  ];

  for (const [label, input, field, message] of cases) {
    it(`refuse (400) ${label} sous le champ, et n'enregistre rien`, async () => {
      const before = await countLeads();
      const res = await create({ firstName: "Julie", origin: "linkedin", ...input });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { fields: Record<string, string> }).fields[field]).toBe(message);
      expect(await countLeads()).toBe(before);
    });
  }
});
