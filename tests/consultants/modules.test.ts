import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { listFeed } from "@/features/activities/feed";
import { createUserWithPassword } from "@/features/auth/accounts";
import { getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-modules@exemple.fr", firstName: "Hugo", lastName: "Sellier", password: "MotDePasse-Modules-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createConsultant(firstName: string, lastName: string): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName, lastName }, memberCookie));
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect((await patchProfile(id, { status: "freelance" })).status).toBe(200);
  return id;
}

const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));

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
 * D3, D13 : les modules Workday sont un ensemble, chacun certifié ou non. « Certifié sur » est un
 * champ à part entière : il a sa colonne, son filtre et sa ligne d'historique, et il ne porte que
 * des modules retenus.
 */
describe("modules Workday d'un consultant (CRM-81, D3)", () => {
  it("retient des modules, en certifie un, et les relit sur le profil comme sur la personne, dans l'ordre de la liste", async () => {
    const id = await createConsultant("Nora", "Vidal");
    const saved = await patchProfile(id, { modules: ["integration", "hcm"], certifiedModules: ["hcm"] });
    expect(saved.status).toBe(200);
    /* L'ordre affiché est celui de la liste fermée, pas celui de la saisie : deux consultants se comparent. */
    expect(await saved.json()).toMatchObject({ modules: ["hcm", "integration"], certifiedModules: ["hcm"] });
    expect(await getObjectRecord("person", id)).toMatchObject({ modules: ["hcm", "integration"], certifiedModules: ["hcm"] });
  });

  it("écrit une ligne d'historique pour les modules et une pour les certifications, l'ancienne valeur vide écrite « vide »", async () => {
    const id = await createConsultant("Basile", "Renard");
    await patchProfile(id, { modules: ["hcm", "integration"], certifiedModules: ["hcm"] });
    expect(await historyOf(id)).toEqual([
      "Certifié sur : vide → HCM",
      "Modules : vide → HCM, Integration",
      "Profils : Aucun → Consultant",
      "Statut : vide → Freelance",
    ]);
  });

  it("retire un module et sa certification part avec lui : une certification ne survit pas au module qu'elle porte", async () => {
    const id = await createConsultant("Alix", "Perrot");
    await patchProfile(id, { modules: ["hcm", "payroll"], certifiedModules: ["hcm", "payroll"] });
    const reduced = await patchProfile(id, { modules: ["payroll"] });
    expect(reduced.status).toBe(200);
    expect(await reduced.json()).toMatchObject({ modules: ["payroll"], certifiedModules: ["payroll"] });
  });

  it("refuse (400) une certification sur un module qui n'est pas retenu, et n'enregistre rien", async () => {
    const id = await createConsultant("Kim", "Lefranc");
    await patchProfile(id, { modules: ["hcm"], certifiedModules: ["hcm"] });
    const refused = await patchProfile(id, { certifiedModules: ["hcm", "finance"] });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { certifiedModules: "« Certifié sur » ne porte que des modules retenus : « Finance » ne l'est pas." } });
    expect(await getObjectRecord("person", id)).toMatchObject({ modules: ["hcm"], certifiedModules: ["hcm"] });
  });

  it("refuse (400) un module que la liste ne porte pas, et n'enregistre rien", async () => {
    const id = await createConsultant("Théo", "Barre");
    const refused = await patchProfile(id, { modules: ["hcm", "workday_plus"] });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { modules: "Valeur hors liste pour « Modules »." } });
    expect(await getObjectRecord("person", id)).toMatchObject({ modules: [] });
  });
});
