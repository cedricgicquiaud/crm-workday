import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchConsultant, GET as readConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { GET as getPerson } from "@/app/api/personnes/[id]/route";
import { GET as listPersons, POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listFeed } from "@/features/activities/feed";
import { listHistory } from "@/features/history/history";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-profil-consultant@exemple.fr", firstName: "Awa", lastName: "Diop", password: "MotDePasse-Consultant-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createPerson(input: Record<string, unknown>): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));
const getProfile = (id: string) => readConsultant(jsonRequest("GET", `/api/personnes/${id}/profil-consultant`, undefined, memberCookie), byId(id));
const readPerson = async (id: string) => (await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id))).json();

/**
 * L'historique tel qu'un lecteur le lit dans le fil de la personne : « Statut : vide → Freelance ».
 * On vérifie la phrase affichée, pas la forme enregistrée — c'est elle que D13 décrit.
 */
const historyOf = async (id: string) =>
  (await listFeed("person", id, [])).items
    .filter((item) => item.kind === "changement" && (item.text ?? "").includes(" : "))
    .map((item) => item.text)
    .sort();

/** Nombre d'entrées « modifiée » de l'historique : ce qu'un PATCH sans changement ne doit pas faire grandir. */
const changeCount = async (id: string) => (await listHistory("person", id)).filter((entry) => entry.action === "modifiee").length;

/** Les enfants avant les parents : les clés étrangères de ces tables sont sans cascade côté personne. */
async function cleanup() {
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(auditLog);
  await db.delete(person);
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

/**
 * D1, D2, D9, D13 : le profil consultant naît du premier statut choisi sur la fiche. « Profils »
 * n'est pas recopié — il se recalcule depuis les profils présents — et l'historique de la personne
 * en garde la trace, comme de chaque champ du profil.
 */
describe("profil consultant — création au premier statut (CRM-81, D1, D2, D13)", () => {
  it("rend null tant que la personne n'a pas de profil, puis crée le profil au premier statut et fait passer « Profils » à Consultant", async () => {
    const id = await createPerson({ firstName: "Léa", lastName: "Marchand" });
    const none = await getProfile(id);
    expect(none.status).toBe(200);
    expect(await none.json()).toBeNull();
    expect(await readPerson(id)).toMatchObject({ profiles: [], status: null });

    const created = await patchProfile(id, { status: "freelance" });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ personId: id, status: "freelance", modules: [], certifiedModules: [], billingCompanyId: null, dailyCost: null, unavailable: "non" });

    expect(await (await getProfile(id)).json()).toMatchObject({ status: "freelance" });
    expect(await historyOf(id)).toEqual(["Profils : Aucun → Consultant", "Statut : vide → Freelance"]);
  });

  it("relit les champs du profil sur la personne et dans sa liste : ils se lisent comme ses propres colonnes", async () => {
    const id = await createPerson({ firstName: "Yann", lastName: "Kerbrat" });
    await patchProfile(id, { status: "salarie", dailyCost: 650, yearsExperience: 6, languages: "français, anglais", cvUrl: "https://exemple.fr/cv-kerbrat.pdf" });

    expect(await readPerson(id)).toMatchObject({
      profiles: ["consultant"],
      status: "salarie",
      dailyCost: 650,
      yearsExperience: 6,
      languages: "français, anglais",
      cvUrl: "https://exemple.fr/cv-kerbrat.pdf",
    });

    const list = await listPersons(jsonRequest("GET", "/api/personnes", undefined, memberCookie));
    const { persons } = (await list.json()) as { persons: { id: string; profiles: string[]; status: string | null; dailyCost: number | null }[] };
    expect(persons.find((entry) => entry.id === id)).toMatchObject({ profiles: ["consultant"], status: "salarie", dailyCost: 650 });
  });

  it("modifie ensuite le profil sans en créer un second, et historise chaque champ avec son ancienne et sa nouvelle valeur", async () => {
    const id = await createPerson({ firstName: "Inès", lastName: "Fabre" });
    await patchProfile(id, { status: "portage", dailyCost: 500 });
    const changed = await patchProfile(id, { status: "salarie", dailyCost: 620 });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ status: "salarie", dailyCost: 620 });

    const rows = await db.select({ id: consultantProfile.id }).from(consultantProfile).where(eq(consultantProfile.personId, id));
    expect(rows).toHaveLength(1);
    expect(await historyOf(id)).toEqual([
      "Coût journalier : 500,00 € → 620,00 €",
      "Coût journalier : vide → 500,00 €",
      "Profils : Aucun → Consultant",
      "Statut : Portage → Salarié",
      "Statut : vide → Portage",
    ]);
  });

  it("n'écrit rien quand le PATCH ne change rien : aucune ligne d'historique de plus", async () => {
    const id = await createPerson({ firstName: "Paul", lastName: "Etienne" });
    await patchProfile(id, { status: "freelance", languages: "français" });
    const before = await changeCount(id);
    expect((await patchProfile(id, { status: "freelance", languages: "français" })).status).toBe(200);
    expect(await changeCount(id)).toBe(before);
  });
});
