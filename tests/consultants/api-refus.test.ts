import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE as deleteConsultant, GET as readConsultant, PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { PATCH as patchPerson, GET as readPersonRoute } from "@/app/api/personnes/[id]/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { listFeed } from "@/features/activities/feed";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-refus-consultant@exemple.fr", firstName: "Lila", lastName: "Andre", password: "MotDePasse-Refus-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));
const readPerson = async (id: string) => (await readPersonRoute(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id))).json();

async function createConsultant(firstName: string, lastName: string, status = "freelance"): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName, lastName }, memberCookie));
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect((await patchProfile(id, { status })).status).toBe(200);
  return id;
}

const historyOf = async (id: string) =>
  (await listFeed("person", id, [])).items
    .filter((item) => item.kind === "changement" && (item.text ?? "").includes(" : "))
    .map((item) => item.text)
    .sort();

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
  await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * D6 : les trois champs de disponibilité se saisissent et s'enregistrent ici ; l'état qui s'en déduit
 * (disponible, en mission, indisponible) arrive en 3.2. Un motif sans la case n'a pas de sens : il
 * est refusé, et décocher la case efface le motif.
 */
describe("disponibilité d'un consultant (CRM-81, D6)", () => {
  it("enregistre la date de disponibilité, la case et son motif, avec une ligne d'historique par champ", async () => {
    const id = await createConsultant("Elsa", "Bruneau");
    const saved = await patchProfile(id, { availableFrom: "2026-11-02", unavailable: "oui", unavailableReason: "Congé sabbatique" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ availableFrom: "2026-11-02", unavailable: "oui", unavailableReason: "Congé sabbatique" });
    expect(await historyOf(id)).toEqual(
      expect.arrayContaining(["Disponible à partir du : vide → 2 nov. 2026", "Indisponible : Non → Oui", "Motif d'indisponibilité : vide → Congé sabbatique"]),
    );
  });

  it("refuse (400) un motif sans la case « Indisponible », et n'enregistre rien", async () => {
    const id = await createConsultant("Tom", "Vasseur");
    const refused = await patchProfile(id, { unavailableReason: "Sans la case" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { unavailableReason: "« Motif d'indisponibilité » ne se renseigne que si « Indisponible » est coché." } });
    expect(await readPerson(id)).toMatchObject({ unavailableReason: null, unavailable: "non" });
  });

  it("efface le motif quand on décoche « Indisponible » : un motif ne reste pas sur un consultant disponible", async () => {
    const id = await createConsultant("Nina", "Cariou");
    await patchProfile(id, { unavailable: "oui", unavailableReason: "Formation" });
    const uncked = await patchProfile(id, { unavailable: "non" });
    expect(uncked.status).toBe(200);
    expect(await uncked.json()).toMatchObject({ unavailable: "non", unavailableReason: null });
    expect(await historyOf(id)).toContain("Motif d'indisponibilité : Formation → vide");
  });
});

/** D1, D21, D19 : ce que l'API du profil refuse, et ce que celle de la personne refuse à sa place. */
describe("refus de l'API du profil consultant (CRM-81, D1, D19, D21)", () => {
  it("refuse (405) le retrait d'un profil consultant : il part avec la personne, pas avant", async () => {
    const id = await createConsultant("Malo", "Gauthier");
    const refused = await deleteConsultant(jsonRequest("DELETE", `/api/personnes/${id}/profil-consultant`, undefined, memberCookie));
    expect(refused.status).toBe(405);
    expect(await refused.json()).toMatchObject({ error: "retrait_impossible" });
    expect(await readPerson(id)).toMatchObject({ profiles: ["consultant"] });
  });

  it("refuse (409) d'ajouter ou de modifier un profil sur une personne archivée", async () => {
    const withProfile = await createConsultant("Zoé", "Marin");
    const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Sans", lastName: "Profil" }, memberCookie));
    const { id: bare } = (await res.json()) as { id: string };
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, withProfile));
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, bare));

    expect((await patchProfile(withProfile, { dailyCost: 700 })).status).toBe(409);
    expect((await patchProfile(bare, { status: "salarie" })).status).toBe(409);
  });

  it("refuse (404) une personne inconnue et (401) une requête sans session", async () => {
    expect((await patchProfile("00000000-0000-4000-8000-000000000000", { status: "freelance" })).status).toBe(404);
    expect((await patchProfile("pas-un-identifiant", { status: "freelance" })).status).toBe(404);
    const anonymous = await readConsultant(jsonRequest("GET", "/api/personnes/x/profil-consultant"), byId("x"));
    expect(anonymous.status).toBe(401);
  });

  it("refuse (400) chaque règle de champ, sans rien enregistrer", async () => {
    const id = await createConsultant("Ugo", "Pichon");
    const cases: [Record<string, unknown>, string, string][] = [
      [{ status: "stagiaire" }, "status", "Valeur hors liste pour « Statut »."],
      [{ dailyCost: -1 }, "dailyCost", "« Coût journalier » doit être compris entre 0 et 10 000."],
      [{ dailyCost: 650.123 }, "dailyCost", "« Coût journalier » ne prend pas plus de 2 décimales."],
      [{ yearsExperience: 6.5 }, "yearsExperience", "« Années d'expérience » doit être un nombre entier."],
      [{ yearsExperience: 41 }, "yearsExperience", "« Années d'expérience » doit être compris entre 0 et 40."],
      [{ cvUrl: "http://exemple.fr/cv.pdf" }, "cvUrl", "Le lien du CV doit être une adresse https (https://…)."],
      [{ modules: "hcm" }, "modules", "« Modules » attend une liste de valeurs."],
    ];
    for (const [input, field, message] of cases) {
      const refused = await patchProfile(id, input);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ fields: { [field]: message } });
    }
    expect(await readPerson(id)).toMatchObject({ status: "freelance", dailyCost: null, yearsExperience: null, cvUrl: null, modules: [] });
  });

  it("refuse (400) sans statut la création d'un profil : le statut est obligatoire dans le profil", async () => {
    const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Sans", lastName: "Statut" }, memberCookie));
    const { id } = (await res.json()) as { id: string };
    const refused = await patchProfile(id, { dailyCost: 500 });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { status: "« Statut » est obligatoire." } });
    expect(await readPerson(id)).toMatchObject({ profiles: [] });
  });

  it("refuse (400) une clé du profil envoyée à l'API de la personne, à la création comme en modification", async () => {
    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Clé", lastName: "Ailleurs", status: "freelance" }, memberCookie));
    expect(created.status).toBe(400);
    expect(await created.json()).toMatchObject({ error: "champ_de_profil", fields: { status: "« Statut » se règle sur le profil consultant." } });

    const id = await createConsultant("Basil", "Corre");
    const patched = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { dailyCost: 900 }, memberCookie), byId(id));
    expect(patched.status).toBe(400);
    expect(await patched.json()).toMatchObject({ error: "champ_de_profil", fields: { dailyCost: "« Coût journalier » se règle sur le profil consultant." } });
    expect(await readPerson(id)).toMatchObject({ dailyCost: null });
  });
});
