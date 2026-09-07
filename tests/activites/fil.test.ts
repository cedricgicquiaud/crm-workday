import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchCompany } from "@/app/api/entreprises/[id]/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, emailLog, person, user } from "@/db/schema";
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
  await db.delete(emailLog);
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

describe("fil d'activité — changements et emails (CRM-44, contrats 13 et 14)", () => {
  it("mêle au fil les changements de la fiche et les emails du journal qui la référencent, avec sujet, statut et auteur ; seul un email envoyé par le système est sans auteur, donc automatique", async () => {
    const companyId = await createCompany("Groupe Ferrandi");
    const patched = await patchCompany(jsonRequest("PATCH", `/api/entreprises/${companyId}`, { type: "prospect" }, memberCookie), { params: Promise.resolve({ id: companyId }) });
    expect(patched.status).toBe(200);
    await db.insert(emailLog).values({ to: "marc@ferrandi.fr", subject: "Proposition commerciale", body: "<p>Bonjour</p>", template: "test", status: "envoye", authorId: memberId, objectType: "company", objectId: companyId, createdAt: new Date("2026-09-05T08:00:00Z") });
    await db.insert(emailLog).values({ to: "marc@ferrandi.fr", subject: "Relance automatique", body: "<p>Relance</p>", template: "test", status: "echec", errorReason: "adresse refusée", objectType: "company", objectId: companyId, createdAt: new Date("2026-09-05T09:00:00Z") });

    const feed = await listFeed("company", companyId);
    expect(feed.filter((item) => item.kind === "email").map((item) => [item.text, item.status, item.author?.name ?? null])).toEqual([
      ["Relance automatique", "echec", null],
      ["Proposition commerciale", "envoye", "Inès Roux"],
    ]);
    const changes = feed.filter((item) => item.kind === "changement");
    expect(changes.map((item) => item.text)).toEqual(["Type : Client → Prospect", "Fiche créée"]);
    expect(changes.every((item) => item.author?.name === "Inès Roux")).toBe(true);
    /* Un seul fil, antéchronologique quelle que soit la provenance des entrées. */
    expect(feed.map((item) => item.at)).toEqual([...feed.map((item) => item.at)].sort().reverse());
  });
});
