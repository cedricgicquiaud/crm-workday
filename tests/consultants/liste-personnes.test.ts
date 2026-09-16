import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, contactProfile, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listForState } from "@/features/lists/apply-filters";
import { columnsOf } from "@/features/lists/columns";
import { parseListState } from "@/features/lists/url-state";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const PERSONS = "person";

const MEMBER = { email: "membre-liste-personnes@exemple.fr", firstName: "Nora", lastName: "Blanchet", password: "MotDePasse-Personnes-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

/** Crée une personne par l'API — contact si on lui donne une entreprise — et, si on lui en donne un, son profil consultant. */
async function seed(firstName: string, { companyId, status }: { companyId?: string; status?: string }): Promise<void> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName, lastName: "Personnes", ...(companyId ? { companyId } : {}) }, memberCookie));
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  if (status) expect((await patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, { status }, memberCookie), byId(id))).status).toBe(200);
}

/** Les enfants avant les parents : les clés étrangères de ces tables sont sans cascade côté personne. */
async function cleanup() {
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(contactProfile);
  await db.delete(auditLog);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  const { id: memberId } = await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  const acme = await createObject("company", { name: "Acme Personnes", type: "client" }, { id: memberId });

  /* Carla contact, Ugo consultant, Bianca les deux, Sam sans profil. */
  await seed("Carla", { companyId: acme.id });
  await seed("Ugo", { status: "freelance" });
  await seed("Bianca", { companyId: acme.id, status: "salarie" });
  await seed("Sam", {});
});

afterAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await closeDb();
});

/** Prénoms qu'une liste rend pour cette adresse, triés : on compare des ensembles de fiches. */
async function shown(list: string, query: string): Promise<string[]> {
  const state = parseListState(list, new URLSearchParams(query));
  const records = await listObjectRecords("person", { includeArchived: state.includeArchived });
  return listForState(list, records, state).map((record) => String(record.firstName)).sort();
}

/** Contrat 16 (D10, D11) : les champs du profil sont aussi colonnes et filtres de la liste des personnes. */
describe("profil consultant depuis la liste des personnes (CRM-87, contrat 16)", () => {
  it("propose « Statut » du profil consultant comme colonne, et l'adresse qui l'ajoute la garde", () => {
    expect(columnsOf(PERSONS).map((column) => column.label)).toContain("Statut");
    expect(parseListState(PERSONS, new URLSearchParams("colonnes=profiles,status")).columns).toEqual(["profiles", "status"]);
  });

  it("« Profils contient consultant » ramène exactement les personnes de la liste « Consultants »", async () => {
    expect(await shown(PERSONS, "f=profiles:contient:consultant")).toEqual(["Bianca", "Ugo"]);
    expect(await shown("consultants", "")).toEqual(["Bianca", "Ugo"]);
  });

  it("« Profils contient contact » ramène les contacts, et une personne qui est les deux figure dans les deux résultats", async () => {
    expect(await shown(PERSONS, "f=profiles:contient:contact")).toEqual(["Bianca", "Carla"]);
  });

  it("« Profils est vide » ramène les personnes sans profil", async () => {
    expect(await shown(PERSONS, "f=profiles:est_vide:")).toEqual(["Sam"]);
  });
});
