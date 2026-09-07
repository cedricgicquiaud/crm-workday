import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchCompany } from "@/app/api/entreprises/[id]/route";
import { PATCH as patchContactProfile } from "@/app/api/personnes/[id]/profil-contact/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, emailLog, person, user } from "@/db/schema";
import { createActivity, setTaskDone } from "@/features/activities/activities";
import { FEED_ITEMS_LIMIT, listFeed, type FeedItem } from "@/features/activities/feed";
import { activityTypes } from "@/features/activities/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import type { UserOption } from "@/features/objects/labels";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-fil@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Fil-1", role: "membre" as const };
const SECOND = { email: "second-fil@exemple.fr", firstName: "Paul", lastName: "Second", password: "MotDePasse-Fil-2", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let secondId: string;

const ACTIVITY_KINDS = activityTypes().map((type) => type.key);
const activities = (items: readonly FeedItem[]) => items.filter((item) => ACTIVITY_KINDS.includes(item.kind));

/** Le fil reçoit les options d'utilisateurs de son appelant : la plupart de ces cas n'en ont pas besoin. */
const feedOf = async (type: string, id: string, users: readonly UserOption[] = []) => (await listFeed(type, id, users)).items;

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
  await db.delete(user).where(eq(user.email, SECOND.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  secondId = (await createUserWithPassword(SECOND)).id;
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

    const own = activities(await feedOf("person", personId));
    expect(own.map((item) => [item.kind, item.text])).toEqual([
      ["tache", "Envoyer la proposition"],
      ["appel", "Appel de suivi, 12 min."],
      ["note", "Le client valide le renouvellement."],
    ]);
    expect(own.every((item) => item.author?.name === "Inès Roux" && item.source === null)).toBe(true);

    const parent = activities(await feedOf("company", companyId));
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

    const feed = await feedOf("company", companyId);
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

describe("changement d'entreprise et fil (CRM-46, contrat 7)", () => {
  it("laisse dans le fil de l'ancienne entreprise les activités écrites avant le changement, et met dans celui de la nouvelle celles écrites après", async () => {
    const ancienne = await createCompany("Banque Solveige (ancienne)");
    const nouvelle = await createCompany("Groupe Ferrandi (nouvelle)");
    const personId = await createPerson("Julien", "Tessier", ancienne);
    const actor = { id: memberId };
    await createActivity("person", personId, { type: "note", body: "Écrite avant le changement." }, actor);

    const changed = await patchContactProfile(jsonRequest("PATCH", `/api/personnes/${personId}/profil-contact`, { companyId: nouvelle }, memberCookie), { params: Promise.resolve({ id: personId }) });
    expect(changed.status).toBe(200);
    await createActivity("person", personId, { type: "note", body: "Écrite après le changement." }, actor);

    expect(activities(await feedOf("company", ancienne)).map((item) => item.text)).toEqual(["Écrite avant le changement."]);
    expect(activities(await feedOf("company", nouvelle)).map((item) => item.text)).toEqual(["Écrite après le changement."]);
    /* Le fil de la personne, lui, garde les deux, la plus récente d'abord. */
    expect(activities(await feedOf("person", personId)).map((item) => item.text)).toEqual(["Écrite après le changement.", "Écrite avant le changement."]);
  });
});

describe("tâche cochée dans le fil (CRM-45, contrat 12)", () => {
  it("porte jusqu'au fil la date du cochage, nulle tant que la tâche est à faire", async () => {
    const companyId = await createCompany("Tâches datées");
    const task = await createActivity("company", companyId, { type: "tache", title: "Rappeler Claire", dueDate: "2026-09-30", assigneeId: memberId }, { id: memberId });
    const entryOf = async () => (await feedOf("company", companyId)).find((item) => item.id === `activite:${task.id}`)!;

    expect((await entryOf()).task).toMatchObject({ done: false, doneAt: null });

    await setTaskDone(task.id, true);
    const done = (await entryOf()).task!;
    expect(done.done).toBe(true);
    /* La date affichée à côté de « faite » est celle du cochage, jamais celle de la création. */
    expect(Number.isNaN(Date.parse(done.doneAt ?? ""))).toBe(false);
    expect(done.doneAt! >= task.createdAt.toISOString()).toBe(true);
  });
});

describe("le fil est borné (CRM-44)", () => {
  it("ne charge que les entrées les plus récentes jusqu'au plafond, et dit combien restent", async () => {
    const companyId = await createCompany("Fiche bavarde");
    for (let index = 0; index <= FEED_ITEMS_LIMIT; index += 1) {
      await createActivity("company", companyId, { type: "note", body: `Note ${index}` }, { id: memberId });
    }

    /* `FEED_ITEMS_LIMIT + 1` notes, plus l'entrée « Fiche créée » de l'historique. */
    const feed = await listFeed("company", companyId, []);
    expect(feed.items).toHaveLength(FEED_ITEMS_LIMIT);
    expect(feed.more).toBe(2);
    expect(feed.items.map((item) => item.text)).toContain(`Note ${FEED_ITEMS_LIMIT}`);
    expect(feed.items.map((item) => item.text)).not.toContain("Note 0");
  });
});

describe("provenance d'une entrée du fil (CRM-44)", () => {
  it("ne tient une entrée pour « écrite ici » que si le type d'objet et l'identifiant sont ceux de la fiche", async () => {
    const companyId = await createCompany("Homonyme SA");
    /* Une fiche personne dont l'identifiant est celui de l'entreprise : seul le type distingue les deux. */
    await db.insert(person).values({ id: companyId, firstName: "Claire", lastName: "Homonyme", companyId, ownerId: memberId, createdBy: memberId });
    await createActivity("person", companyId, { type: "note", body: "Écrite sur la personne." }, { id: memberId });

    const [entry] = activities(await feedOf("company", companyId));
    expect(entry.text).toBe("Écrite sur la personne.");
    expect(entry.source).toMatchObject({ type: "person", id: companyId, title: "Claire Homonyme", href: `/personnes/${companyId}` });
  });
});

describe("options d'utilisateurs du fil (CRM-44)", () => {
  it("nomme les valeurs d'un champ « utilisateur » avec les options reçues de l'appelant, sans les relire", async () => {
    const companyId = await createCompany("Options fournies");
    const patched = await patchCompany(jsonRequest("PATCH", `/api/entreprises/${companyId}`, { ownerId: secondId }, memberCookie), { params: Promise.resolve({ id: companyId }) });
    expect(patched.status).toBe(200);

    const items = await feedOf("company", companyId, [
      { id: memberId, name: "Inès Roux" },
      { id: secondId, name: "Nom fourni" },
    ]);
    expect(items.map((item) => item.text)).toContain("Responsable : Inès Roux → Nom fourni");
  });
});
