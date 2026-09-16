import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { auditLog, company, consultantModule, consultantProfile, person, savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listForState } from "@/features/lists/apply-filters";
import { defaultColumnKeys } from "@/features/lists/columns";
import { listUrl, parseListState } from "@/features/lists/url-state";
import { getList, listLists } from "@/features/objects/registry";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { createView, defaultView, deleteView, listViews, updateView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-liste-consultants@exemple.fr", firstName: "Eva", lastName: "Bonnaud", password: "MotDePasse-Liste-1", role: "membre" as const };

const LIST = "consultants";

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));

async function cleanup() {
  await db.delete(savedView);
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
 * D10, D19 : « Consultants » n'est pas un objet — c'est une liste de personnes, restreinte à celles
 * qui portent un profil consultant. Elle se déclare au registre, comme n'importe quelle liste : la
 * barre latérale, l'URL, les colonnes et les vues la lisent sans qu'un mécanisme la nomme.
 */
describe("liste « Consultants » déclarée au registre (CRM-83, D10)", () => {
  it("prend sa place dans la barre latérale après « Personnes », avec son libellé et son adresse", () => {
    expect(listLists().map((list) => list.key)).toEqual(["company", "person", "consultants"]);
    expect(getList(LIST)).toMatchObject({ key: LIST, objectKey: "person", label: "Consultants", href: "/consultants" });
    /* La liste d'un objet est une liste comme une autre : on la lit par la même fonction. */
    expect(getList("person")).toMatchObject({ objectKey: "person", label: "Personnes", href: "/personnes" });
  });

  it("porte les colonnes par défaut de la décision 10, et écrit ses adresses sous son propre chemin", () => {
    expect(defaultColumnKeys(LIST)).toEqual(["status", "modules", "dailyCost", "state", "ownerId", "updatedAt"]);
    expect(listUrl(LIST, parseListState(LIST, new URLSearchParams("tri=status:asc")))).toBe("/consultants?tri=status%3Aasc");
    /* Les colonnes de la liste des personnes ne bougent pas : chaque liste a les siennes. */
    expect(defaultColumnKeys("person")).toEqual(["profiles", "ownerId", "updatedAt"]);
  });

  it("ne montre que les personnes à profil consultant, et une URL bricolée ne retire pas ce filtre", async () => {
    const consultant = await createObject("person", { firstName: "Yuna", lastName: "Kerhoas" }, { id: memberId });
    await patchProfile(consultant.id, { status: "freelance" });
    const contact = await createObject("person", { firstName: "Simple", lastName: "Contact" }, { id: memberId });
    const records = await listObjectRecords("person");

    const names = (query: string) => listForState(LIST, records, parseListState(LIST, new URLSearchParams(query))).map((record) => record.name);
    expect(names("")).toEqual(["Yuna Kerhoas"]);
    /* Un filtre bricolé s'ajoute au filtre de base, il ne le remplace pas : le contact reste dehors. */
    expect(names("f=profiles:est_vide:")).toEqual([]);
    expect(names("f=profiles:contient:contact")).toEqual([]);
    expect(listForState("person", records, parseListState("person", new URLSearchParams())).map((record) => record.name)).toEqual(expect.arrayContaining([contact.name]));
  });

  it("ouvre sa propre vue par défaut, « Tous les consultants », qui ne se renomme ni ne se supprime", async () => {
    expect(defaultView(LIST)).toMatchObject({ id: "default", objectType: LIST, name: "Tous les consultants", query: "" });
    expect((await listViews(LIST)).map((view) => view.name)).toEqual(["Tous les consultants"]);
    await expect(updateView("default", { name: "Mes consultants" })).rejects.toMatchObject({ status: 409 });
    await expect(deleteView("default")).rejects.toMatchObject({ status: 409 });
    /* Le nom de la vue par défaut n'est pas libre : deux entrées du même nom seraient indiscernables. */
    await expect(createView({ objectType: LIST, name: "Tous les consultants", query: "" }, { id: memberId })).rejects.toMatchObject({ status: 409 });
  });

  it("range ses vues sauvegardées sous sa propre clé : celles des personnes restent aux personnes", async () => {
    await createView({ objectType: LIST, name: "Freelances", query: "f=status:est:freelance" }, { id: memberId });
    expect((await listViews(LIST)).map((view) => view.name)).toEqual(["Tous les consultants", "Freelances"]);
    expect((await listViews("person")).map((view) => view.name)).toEqual(["Toutes les personnes"]);
  });
});
