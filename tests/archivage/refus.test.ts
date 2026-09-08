import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchActivity } from "@/app/api/activites/[id]/route";
import { PATCH as patchCompany } from "@/app/api/entreprises/[id]/route";
import { POST as postActivity } from "@/app/api/objets/[type]/[id]/activites/route";
import { PATCH as patchContactProfile } from "@/app/api/personnes/[id]/profil-contact/route";
import { PATCH as patchPerson } from "@/app/api/personnes/[id]/route";
import { activity, auditLog, company, contactProfile, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-refus-archivage@exemple.fr", firstName: "Iris", lastName: "Naudin", password: "MotDePasse-Refus-Archivage-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const at = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(contactProfile);
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

describe("une fiche archivée n'accepte plus d'écriture (CRM-61, contrat 30, D21)", () => {
  it("refuse (409) un champ modifié, une activité ajoutée et une tâche cochée sur une entreprise archivée", async () => {
    const created = await createObject("company", { name: "Tuileries Marceau", type: "client" }, { id: memberId });
    const task = await createActivity("company", created.id, { type: "tache", title: "Relancer", dueDate: "2026-12-01", assigneeId: memberId }, { id: memberId });
    await archiveRecord("company", created.id, { id: memberId });

    const field = await patchCompany(jsonRequest("PATCH", `/api/entreprises/${created.id}`, { city: "Lyon" }, memberCookie), byId(created.id));
    expect(field.status).toBe(409);
    expect(await field.json()).toMatchObject({ error: "fiche_archivee" });

    const added = await postActivity(jsonRequest("POST", `/api/objets/company/${created.id}/activites`, { type: "note", body: "Compte rendu" }, memberCookie), at("company", created.id));
    expect(added.status).toBe(409);

    const ticked = await patchActivity(jsonRequest("PATCH", `/api/activites/${task.id}`, { done: true }, memberCookie), byId(task.id));
    expect(ticked.status).toBe(409);
  });

  it("refuse (409) un champ et un profil contact sur une personne archivée, et le rattachement à une entreprise archivée", async () => {
    const host = await createObject("company", { name: "Tuileries Rangées", type: "client" }, { id: memberId });
    const archivedPerson = await createObject("person", { firstName: "Claire", lastName: "Bonnet" }, { id: memberId });
    await archiveRecord("person", archivedPerson.id, { id: memberId });

    const field = await patchPerson(jsonRequest("PATCH", `/api/personnes/${archivedPerson.id}`, { phone: "0102030405" }, memberCookie), byId(archivedPerson.id));
    expect(field.status).toBe(409);

    const profile = await patchContactProfile(jsonRequest("PATCH", `/api/personnes/${archivedPerson.id}/profil-contact`, { companyId: host.id }, memberCookie), byId(archivedPerson.id));
    expect(profile.status).toBe(409);

    const living = await createObject("person", { firstName: "Yves", lastName: "Marchand" }, { id: memberId });
    await archiveRecord("company", host.id, { id: memberId });
    const attached = await patchContactProfile(jsonRequest("PATCH", `/api/personnes/${living.id}/profil-contact`, { companyId: host.id }, memberCookie), byId(living.id));
    expect(attached.status).toBe(409);
    expect(await attached.json()).toMatchObject({ error: "entreprise_archivee" });
  });
});
