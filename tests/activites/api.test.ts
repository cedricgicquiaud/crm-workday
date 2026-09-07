import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postActivity } from "@/app/api/objets/[type]/[id]/activites/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-activites@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Activites-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const on = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

async function cleanup() {
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

async function createPerson(lastName: string, companyId?: string): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Claire", lastName, ...(companyId ? { companyId } : {}) }, memberCookie));
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

describe("API des activités — création (CRM-43, D10)", () => {
  it("écrit une note sur une personne avec l'entreprise du moment en parent, et sans parent quand la fiche n'en a pas", async () => {
    const companyId = await createCompany("Banque Solveige");
    const personId = await createPerson("Morvan", companyId);

    const onPerson = await postActivity(jsonRequest("POST", `/api/objets/person/${personId}/activites`, { type: "note", body: "Le client valide le renouvellement." }, memberCookie), on("person", personId));
    expect(onPerson.status).toBe(201);
    expect(await onPerson.json()).toMatchObject({ objectType: "person", objectId: personId, parentType: "company", parentId: companyId, type: "note", body: "Le client valide le renouvellement." });

    const onCompany = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "note", body: "Réunion de cadrage à prévoir." }, memberCookie), on("company", companyId));
    expect(onCompany.status).toBe(201);
    expect(await onCompany.json()).toMatchObject({ objectType: "company", objectId: companyId, parentType: null, parentId: null, type: "note" });
  });
});

describe("API des activités — refus (CRM-43, contrat 16)", () => {
  it("refuse une tâche sans titre et une tâche sans responsable (400 par champ), un type d'activité hors liste (400), une fiche inconnue (404), une fiche archivée (409) et l'absence de session (401)", async () => {
    const companyId = await createCompany("Assurances Vaubourg");

    const sansTitre = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "tache", dueDate: "2026-09-10", assigneeId: memberId }, memberCookie), on("company", companyId));
    expect(sansTitre.status).toBe(400);
    expect(await sansTitre.json()).toMatchObject({ error: "donnees_invalides", fields: { title: "« Titre » est obligatoire." } });

    const sansResponsable = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "tache", title: "Proposer le renouvellement" }, memberCookie), on("company", companyId));
    expect(sansResponsable.status).toBe(400);
    expect(await sansResponsable.json()).toMatchObject({ error: "donnees_invalides", fields: { assigneeId: "« Responsable » est obligatoire." } });

    const complete = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "tache", title: "Proposer le renouvellement", dueDate: "2026-09-12", assigneeId: memberId }, memberCookie), on("company", companyId));
    expect(complete.status).toBe(201);
    expect(await complete.json()).toMatchObject({ type: "tache", title: "Proposer le renouvellement", dueDate: "2026-09-12", assigneeId: memberId, doneAt: null });

    const horsListe = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "sms", body: "Bonjour" }, memberCookie), on("company", companyId));
    expect(horsListe.status).toBe(400);

    const inconnue = "00000000-0000-4000-8000-000000000000";
    expect((await postActivity(jsonRequest("POST", `/api/objets/company/${inconnue}/activites`, { type: "note", body: "Rien" }, memberCookie), on("company", inconnue))).status).toBe(404);
    expect((await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "note", body: "Rien" }), on("company", companyId))).status).toBe(401);

    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, companyId));
    const archivee = await postActivity(jsonRequest("POST", `/api/objets/company/${companyId}/activites`, { type: "note", body: "Après archivage" }, memberCookie), on("company", companyId));
    expect(archivee.status).toBe(409);
    expect(await archivee.json()).toMatchObject({ error: "fiche_archivee" });
  });
});
