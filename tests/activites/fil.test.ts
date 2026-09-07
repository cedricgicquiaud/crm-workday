import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { listFeed, type FeedItem } from "@/features/activities/feed";
import { activityTypes } from "@/features/activities/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-fil@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Fil-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const ACTIVITY_KINDS = activityTypes().map((type) => type.key);
const activities = (items: readonly FeedItem[]) => items.filter((item) => ACTIVITY_KINDS.includes(item.kind));

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

async function createPerson(firstName: string, lastName: string, companyId: string): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName, lastName, companyId }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
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

describe("fil d'activité — la fiche et ses contacts (CRM-44, contrat 11)", () => {
  it("rend les activités d'une personne, la plus récente d'abord, et les fait apparaître dans le fil de son entreprise marquées du nom de la personne", async () => {
    const companyId = await createCompany("Banque Solveige");
    const personId = await createPerson("Claire", "Morvan", companyId);
    const actor = { id: memberId };
    await createActivity("person", personId, { type: "note", body: "Le client valide le renouvellement." }, actor);
    await createActivity("person", personId, { type: "appel", body: "Appel de suivi, 12 min." }, actor);
    await createActivity("person", personId, { type: "tache", title: "Envoyer la proposition", dueDate: "2026-09-30", assigneeId: memberId }, actor);

    const own = activities(await listFeed("person", personId));
    expect(own.map((item) => [item.kind, item.text])).toEqual([
      ["tache", "Envoyer la proposition"],
      ["appel", "Appel de suivi, 12 min."],
      ["note", "Le client valide le renouvellement."],
    ]);
    expect(own.every((item) => item.author?.name === "Inès Roux" && item.source === null)).toBe(true);

    const parent = activities(await listFeed("company", companyId));
    expect(parent.map((item) => item.kind)).toEqual(["tache", "appel", "note"]);
    expect(parent.every((item) => item.source?.title === "Claire Morvan" && item.source?.href === `/personnes/${personId}`)).toBe(true);
  });
});
