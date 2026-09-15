import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { listFeed } from "@/features/activities/feed";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listBillingCompanyOptions } from "@/features/consultants/consultant-profile";
import { linkedGroups } from "@/features/objects/links-column";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-societe@exemple.fr", firstName: "Sami", lastName: "Oz", password: "MotDePasse-Societe-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let dupontId: string;
let portageId: string;
let clientId: string;
let archivedId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));

async function createConsultant(firstName: string, lastName: string, status: string): Promise<string> {
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
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  const actor = { id: memberId };
  dupontId = (await createObject("company", { name: "Dupont Conseil", type: "societe_de_consultant" }, actor)).id;
  portageId = (await createObject("company", { name: "Portage Atlantique", type: "societe_de_portage" }, actor)).id;
  clientId = (await createObject("company", { name: "Banque Solveige", type: "client" }, actor)).id;
  archivedId = (await createObject("company", { name: "Ancienne Société", type: "societe_de_consultant" }, actor)).id;
  await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, archivedId));
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * D4 : la société de facturation est une entreprise liée par une relation déclarée de la personne.
 * Son type est imposé par le statut — la sienne pour un freelance, sa société de portage pour un
 * porté, aucune pour un salarié.
 */
describe("société de facturation d'un consultant (CRM-81, D4)", () => {
  it("rattache la société d'un freelance, la fait apparaître sous « Consultants facturés » sur sa fiche, et l'historise par son nom", async () => {
    const id = await createConsultant("Chloé", "Dupont", "freelance");
    const saved = await patchProfile(id, { billingCompanyId: dupontId });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ billingCompanyId: dupontId, billingCompanyName: "Dupont Conseil", billingCompanyArchived: false });
    expect(await getObjectRecord("person", id)).toMatchObject({ billingCompanyId: dupontId, billingCompanyName: "Dupont Conseil" });

    const groups = await linkedGroups("company", dupontId);
    expect(groups.find((group) => group.label === "Consultants facturés")?.records.map((record) => record.title)).toEqual(["Chloé Dupont"]);
    expect(await historyOf(id)).toContain("Société de facturation : vide → Dupont Conseil");
  });

  it("ne propose au sélecteur que les entreprises du type imposé par le statut, et aucune pour un salarié", async () => {
    expect((await listBillingCompanyOptions("freelance")).map((option) => option.name)).toEqual(["Dupont Conseil"]);
    expect((await listBillingCompanyOptions("portage")).map((option) => option.name)).toEqual(["Portage Atlantique"]);
    expect(await listBillingCompanyOptions("salarie")).toEqual([]);
  });

  it("refuse (400) une entreprise qui n'est pas du type imposé par le statut, et n'enregistre rien", async () => {
    const id = await createConsultant("Marius", "Cauet", "freelance");
    const refused = await patchProfile(id, { billingCompanyId: clientId });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { billingCompanyId: "Un freelance est facturé par une société de consultant : « Banque Solveige » est un client." } });
    expect(await getObjectRecord("person", id)).toMatchObject({ billingCompanyId: null });
  });

  it("refuse (400) une société de facturation à un salarié : il n'en a pas", async () => {
    const id = await createConsultant("Olga", "Ferrand", "salarie");
    const refused = await patchProfile(id, { billingCompanyId: dupontId });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { billingCompanyId: "Un salarié n'a pas de société de facturation." } });
    expect(await getObjectRecord("person", id)).toMatchObject({ billingCompanyId: null });
  });

  it("refuse (400) le passage à salarié tant qu'une société est renseignée, et dit de la retirer d'abord", async () => {
    const id = await createConsultant("Rémi", "Salaun", "freelance");
    await patchProfile(id, { billingCompanyId: dupontId });
    const refused = await patchProfile(id, { status: "salarie" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { status: "Un salarié n'a pas de société de facturation : retirez d'abord « Dupont Conseil »." } });
    expect(await getObjectRecord("person", id)).toMatchObject({ status: "freelance", billingCompanyId: dupontId });

    /* Deux gestes, deux lignes d'historique : on retire la société, puis on change de statut. */
    expect((await patchProfile(id, { billingCompanyId: null })).status).toBe(200);
    expect((await patchProfile(id, { status: "salarie" })).status).toBe(200);
    expect(await historyOf(id)).toContain("Société de facturation : Dupont Conseil → vide");
  });

  it("refuse (409) une entreprise archivée à la saisie, mais garde lisible celle qui a été archivée après coup", async () => {
    const id = await createConsultant("Jade", "Noury", "freelance");
    const refused = await patchProfile(id, { billingCompanyId: archivedId });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "entreprise_archivee" });

    await patchProfile(id, { billingCompanyId: dupontId });
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, dupontId));
    expect(await (await patchProfile(id, { languages: "français" })).json()).toMatchObject({ billingCompanyName: "Dupont Conseil", billingCompanyArchived: true });
    await db.update(company).set({ archivedAt: null }).where(eq(company.id, dupontId));
  });

  it("refuse (400) un identifiant qui ne désigne aucune entreprise", async () => {
    const id = await createConsultant("Enzo", "Balard", "freelance");
    const refused = await patchProfile(id, { billingCompanyId: "pas-un-identifiant" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { billingCompanyId: "« Société de facturation » ne désigne aucune entreprise." } });
  });
});
