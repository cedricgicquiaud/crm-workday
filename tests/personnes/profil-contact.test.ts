import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/personnes/[id]/profil-contact/route";
import { GET as getPerson, PATCH as patchPerson } from "@/app/api/personnes/[id]/route";
import { GET as listPersons, POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, contactProfile, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
import { getContactProfile, prepareContactProfile, writeContactProfile } from "@/features/persons/contact-profile";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-profil-contact@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Profil-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let solveigeId: string;
let ferrandiId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createPerson(input: Record<string, unknown>): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const readPerson = async (id: string) => (await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id))).json();

/** Entrées « modifiée » de l'historique d'une personne : [champ, ancienne, nouvelle], triées. */
const changesOf = async (id: string) => (await listHistory("person", id)).filter((e) => e.action === "modifiee").map((e) => [e.field, e.oldValue, e.newValue]).sort();

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  solveigeId = (await createObject("company", { name: "Banque Solveige", type: "client" }, { id: memberId })).id;
  ferrandiId = (await createObject("company", { name: "Groupe Ferrandi", type: "partenaire" }, { id: memberId })).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("profil contact — ajout sur une personne (CRM-40, CRM-41, D3, contrat 8)", () => {
  it("une personne sans profil (GET → null) reçoit un profil par PATCH avec l'entreprise et le poste : rôle « non précisé » par défaut, Profils passe à « contact » sur la fiche et dans la liste, l'historique le dit", async () => {
    const id = await createPerson({ firstName: "Camille", lastName: "Faure" });
    const none = await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id));
    expect(none.status).toBe(200);
    expect(await none.json()).toBeNull();
    expect(await readPerson(id)).toMatchObject({ profiles: [], companyId: null });

    const added = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: solveigeId, jobTitle: "DSI" }, memberCookie), byId(id));
    expect(added.status).toBe(200);
    expect(await added.json()).toEqual({ personId: id, companyId: solveigeId, companyName: "Banque Solveige", jobTitle: "DSI", decisionRole: "non_precise" });
    const read = await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id));
    expect(await read.json()).toMatchObject({ companyId: solveigeId, jobTitle: "DSI", decisionRole: "non_precise" });

    expect(await readPerson(id)).toMatchObject({ profiles: ["contact"], companyId: solveigeId });
    const list = await listPersons(jsonRequest("GET", "/api/personnes", undefined, memberCookie));
    const { persons } = (await list.json()) as { persons: { id: string; profiles: string[]; companyId: string | null }[] };
    expect(persons.find((p) => p.id === id)).toMatchObject({ profiles: ["contact"], companyId: solveigeId });

    expect(await changesOf(id)).toEqual([
      ["companyId", null, "Banque Solveige"],
      ["decisionRole", null, "Non précisé"],
      ["jobTitle", null, "DSI"],
      ["profiles", "Aucun", "Contact"],
    ]);
  });

  it("le poste se lit sur la personne (GET) et s'édite par le PATCH de la personne comme les autres clés du profil ; des valeurs vides du profil à la création sont ignorées (dialogue à cinq champs sans entreprise choisie)", async () => {
    const id = await createPerson({ firstName: "Vide", lastName: "Profil", companyId: "", jobTitle: "" });
    expect(await readPerson(id)).toMatchObject({ profiles: [], companyId: null, jobTitle: null });

    const attached = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { companyId: solveigeId, jobTitle: "DSI" }, memberCookie), byId(id));
    expect(attached.status).toBe(200);
    expect(await attached.json()).toMatchObject({ profiles: ["contact"], companyId: solveigeId, jobTitle: "DSI" });
    const renamed = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { jobTitle: "DAF", phone: "01 02" }, memberCookie), byId(id));
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ jobTitle: "DAF", phone: "01 02" });
    const role = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { decisionRole: "decideur" }, memberCookie), byId(id));
    expect(role.status).toBe(200);
    expect(await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id)).then((r) => r.json())).toMatchObject({ jobTitle: "DAF", decisionRole: "decideur" });
    expect(await changesOf(id)).toContainEqual(["jobTitle", "DSI", "DAF"]);
  });

  it("la création d'une personne accepte l'entreprise, le poste et le rôle dans le même appel (contrat 6 par l'API) ; une même personne ne porte qu'un profil", async () => {
    const id = await createPerson({ firstName: "Nadia", lastName: "Kessler", email: "nadia.kessler@solveige.fr", companyId: solveigeId, jobTitle: "Acheteuse", decisionRole: "acheteur" });
    expect(await readPerson(id)).toMatchObject({ name: "Nadia Kessler", email: "nadia.kessler@solveige.fr", profiles: ["contact"], companyId: solveigeId });
    const profile = await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id));
    expect(await profile.json()).toMatchObject({ companyId: solveigeId, jobTitle: "Acheteuse", decisionRole: "acheteur" });
    expect((await listHistory("person", id)).map((e) => e.action)).toContain("creee");

    /* Un second PATCH modifie le profil existant : toujours un seul, la ligne « Profils » n'est pas réécrite. */
    const again = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { jobTitle: "Directrice des achats" }, memberCookie), byId(id));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ companyId: solveigeId, jobTitle: "Directrice des achats", decisionRole: "acheteur" });
    expect((await changesOf(id)).filter(([field]) => field === "profiles")).toEqual([["profiles", "Aucun", "Contact"]]);
    expect(await changesOf(id)).toContainEqual(["jobTitle", "Acheteuse", "Directrice des achats"]);
  });
});

describe("profil contact — écriture tout ou rien (CRM-40, contrat 10)", () => {
  it("si le rattachement de l'entreprise échoue après l'insertion du profil, rien n'est écrit : aucune personne ne garde un profil sans entreprise", async () => {
    const id = await createPerson({ firstName: "Tout", lastName: "Ourien" });
    const doomed = (await createObject("company", { name: "Éphémère SA", type: "client" }, { id: memberId })).id;
    /* L'entreprise disparaît entre la validation et l'écriture : la seconde écriture (`person.company_id`) échoue. */
    const prepared = await prepareContactProfile({ companyId: doomed }, null);
    await db.delete(company).where(eq(company.id, doomed));
    await expect(writeContactProfile(id, prepared, { id: memberId })).rejects.toThrow();

    expect(await db.select({ id: contactProfile.id }).from(contactProfile).where(eq(contactProfile.personId, id))).toEqual([]);
    expect(await readPerson(id)).toMatchObject({ profiles: [], companyId: null });
    expect(await changesOf(id)).toEqual([]);
  });

  it("un profil dont la personne n'a plus d'entreprise est signalé, jamais rendu avec une entreprise vide", async () => {
    const id = await createPerson({ firstName: "Profil", lastName: "Orphelin" });
    await db.insert(contactProfile).values({ personId: id, jobTitle: "DSI", decisionRole: "decideur" });
    await expect(getContactProfile(id)).rejects.toMatchObject({ status: 500, code: "profil_sans_entreprise" });
    await db.delete(contactProfile).where(eq(contactProfile.personId, id));
  });
});

describe("profil contact — refus (CRM-40, CRM-41, contrat 10, D21)", () => {
  it("sans entreprise → 400 ; entreprise inconnue → 400 ; archivée → 409 ; rôle hors liste → 400 ; rien n'est écrit ; les clés du profil sur le PATCH de la personne → 400 ; 404 personne inconnue, 401 sans session", async () => {
    const id = await createPerson({ firstName: "Sans", lastName: "Profil" });
    const before = (await db.select({ id: person.id }).from(person)).length;

    const noCompany = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { jobTitle: "DSI" }, memberCookie), byId(id));
    expect(noCompany.status).toBe(400);
    expect(await noCompany.json()).toMatchObject({ error: "donnees_invalides", fields: { companyId: "« Entreprise » est obligatoire." } });

    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Poste", lastName: "Seul", jobTitle: "DSI" }, memberCookie));
    expect(created.status).toBe(400);
    expect(await created.json()).toMatchObject({ fields: { companyId: "« Entreprise » est obligatoire." } });

    const unknownCompany = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: "00000000-0000-4000-8000-000000000000" }, memberCookie), byId(id));
    expect(unknownCompany.status).toBe(400);
    expect(await unknownCompany.json()).toMatchObject({ fields: { companyId: "« Entreprise » ne désigne aucune entreprise." } });
    expect((await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: "abc" }, memberCookie), byId(id))).status).toBe(400);

    const archivedCompany = (await createObject("company", { name: "Fermée SA", type: "client" }, { id: memberId })).id;
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, archivedCompany));
    const archived = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: archivedCompany }, memberCookie), byId(id));
    expect(archived.status).toBe(409);
    expect(await archived.json()).toMatchObject({ error: "entreprise_archivee", message: "Entreprise archivée : « Fermée SA » ne reçoit plus de contact." });
    const createdOnArchived = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Chez", lastName: "Fermée", companyId: archivedCompany }, memberCookie));
    expect(createdOnArchived.status).toBe(409);

    const role = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: solveigeId, decisionRole: "pdg" }, memberCookie), byId(id));
    expect(role.status).toBe(400);
    expect(await role.json()).toMatchObject({ fields: { decisionRole: "Valeur hors liste pour « Rôle dans la décision »." } });

    expect((await db.select({ id: person.id }).from(person)).length).toBe(before);
    expect(await readPerson(id)).toMatchObject({ profiles: [], companyId: null });
    expect(await changesOf(id)).toEqual([]);

    /* Les clés du profil sur le PATCH de la personne suivent la même règle : sans entreprise, rien n'est créé. */
    const jobOnly = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { jobTitle: "DSI" }, memberCookie), byId(id));
    expect(jobOnly.status).toBe(400);
    expect(await jobOnly.json()).toMatchObject({ fields: { companyId: "« Entreprise » est obligatoire." } });
    expect(await readPerson(id)).toMatchObject({ profiles: [], jobTitle: null });

    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await getProfile(jsonRequest("GET", `/api/personnes/${unknown}/profil-contact`, undefined, memberCookie), byId(unknown))).status).toBe(404);
    expect((await patchProfile(jsonRequest("PATCH", `/api/personnes/${unknown}/profil-contact`, { companyId: solveigeId }, memberCookie), byId(unknown))).status).toBe(404);
    expect((await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`), byId(id))).status).toBe(401);
    expect((await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: solveigeId }), byId(id))).status).toBe(401);
  });
});

describe("profil contact — rôle et changement d'entreprise (CRM-41, CRM-42, contrats 6 et 7)", () => {
  it("le rôle « décideur » se règle par PATCH ; changer l'entreprise déplace la personne (companyId) et l'historique garde l'ancienne par son nom ; un PATCH sans changement n'écrit rien", async () => {
    const id = await createPerson({ firstName: "Hugo", lastName: "Marchand", companyId: solveigeId, jobTitle: "DAF" });
    const role = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { decisionRole: "decideur" }, memberCookie), byId(id));
    expect(role.status).toBe(200);
    expect(await role.json()).toMatchObject({ companyId: solveigeId, jobTitle: "DAF", decisionRole: "decideur" });
    expect(await changesOf(id)).toContainEqual(["decisionRole", "Non précisé", "Décideur"]);

    const moved = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: ferrandiId }, memberCookie), byId(id));
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ companyId: ferrandiId, companyName: "Groupe Ferrandi", jobTitle: "DAF", decisionRole: "decideur" });
    expect(await readPerson(id)).toMatchObject({ companyId: ferrandiId, profiles: ["contact"] });
    expect(await changesOf(id)).toContainEqual(["companyId", "Banque Solveige", "Groupe Ferrandi"]);

    const count = (await changesOf(id)).length;
    const same = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: ferrandiId, jobTitle: "DAF", decisionRole: "decideur" }, memberCookie), byId(id));
    expect(same.status).toBe(200);
    expect((await changesOf(id)).length).toBe(count);

    /* Une personne archivée ne reçoit plus de profil ni de changement (D21). */
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, id));
    const archived = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { decisionRole: "acheteur" }, memberCookie), byId(id));
    expect(archived.status).toBe(409);
    expect(await archived.json()).toMatchObject({ error: "fiche_archivee" });
  });
});
