import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/personnes/[id]/profil-contact/route";
import { GET as getPerson, PATCH as patchPerson } from "@/app/api/personnes/[id]/route";
import { GET as listPersons, POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
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
    expect(await readPerson(id)).toMatchObject({ profiles: "aucun", companyId: null });

    const added = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: solveigeId, jobTitle: "DSI" }, memberCookie), byId(id));
    expect(added.status).toBe(200);
    expect(await added.json()).toEqual({ personId: id, companyId: solveigeId, companyName: "Banque Solveige", jobTitle: "DSI", decisionRole: "non_precise" });
    const read = await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id));
    expect(await read.json()).toMatchObject({ companyId: solveigeId, jobTitle: "DSI", decisionRole: "non_precise" });

    expect(await readPerson(id)).toMatchObject({ profiles: "contact", companyId: solveigeId });
    const list = await listPersons(jsonRequest("GET", "/api/personnes", undefined, memberCookie));
    const { persons } = (await list.json()) as { persons: { id: string; profiles: string; companyId: string | null }[] };
    expect(persons.find((p) => p.id === id)).toMatchObject({ profiles: "contact", companyId: solveigeId });

    expect(await changesOf(id)).toEqual([
      ["companyId", null, "Banque Solveige"],
      ["decisionRole", null, "Non précisé"],
      ["jobTitle", null, "DSI"],
      ["profiles", "aucun", "contact"],
    ]);
  });

  it("la création d'une personne accepte l'entreprise, le poste et le rôle dans le même appel (contrat 6 par l'API) ; une même personne ne porte qu'un profil", async () => {
    const id = await createPerson({ firstName: "Nadia", lastName: "Kessler", email: "nadia.kessler@solveige.fr", companyId: solveigeId, jobTitle: "Acheteuse", decisionRole: "acheteur" });
    expect(await readPerson(id)).toMatchObject({ name: "Nadia Kessler", email: "nadia.kessler@solveige.fr", profiles: "contact", companyId: solveigeId });
    const profile = await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id));
    expect(await profile.json()).toMatchObject({ companyId: solveigeId, jobTitle: "Acheteuse", decisionRole: "acheteur" });
    expect((await listHistory("person", id)).map((e) => e.action)).toContain("creee");

    /* Un second PATCH modifie le profil existant : toujours un seul, la ligne « Profils » n'est pas réécrite. */
    const again = await patchProfile(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { jobTitle: "Directrice des achats" }, memberCookie), byId(id));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ companyId: solveigeId, jobTitle: "Directrice des achats", decisionRole: "acheteur" });
    expect((await changesOf(id)).filter(([field]) => field === "profiles")).toEqual([["profiles", "aucun", "contact"]]);
    expect(await changesOf(id)).toContainEqual(["jobTitle", "Acheteuse", "Directrice des achats"]);
  });
});
