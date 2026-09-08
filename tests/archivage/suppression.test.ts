import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, company, contactProfile, emailLog, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { deleteBlockers, deleteRecord } from "@/features/archive/delete";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { upsertContactProfile } from "@/features/persons/contact-profile";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-suppression@exemple.fr", firstName: "Léo", lastName: "Vasseur", password: "MotDePasse-Suppression-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(emailLog);
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
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: memberId });

async function newContactOf(companyId: string, lastName: string): Promise<string> {
  const created = await createObject("person", { firstName: "Claire", lastName }, { id: memberId });
  await upsertContactProfile(created.id, { companyId }, { id: memberId });
  return created.id;
}

describe("ce qui retient une fiche (CRM-62, contrat 31)", () => {
  it("ne trouve rien sur une fiche sans lien, et nomme les contacts rattachés, les activités et les emails du journal qui la retiennent", async () => {
    const free = await newCompany("Fonderie Sans Lien");
    expect(await deleteBlockers("company", free.id)).toEqual([]);

    const held = await newCompany("Fonderie Retenue");
    await newContactOf(held.id, "Bonnet");
    expect(await deleteBlockers("company", held.id)).toEqual([{ key: "person-companyId", label: "Contacts", count: 1 }]);

    await createActivity("company", held.id, { type: "note", body: "Premier rendez-vous" }, { id: memberId });
    await db.insert(emailLog).values({ to: "compta@fonderie.fr", subject: "Devis", body: "<p>Devis</p>", template: "test", status: "envoye", objectType: "company", objectId: held.id });
    expect(await deleteBlockers("company", held.id)).toEqual([
      { key: "person-companyId", label: "Contacts", count: 1 },
      { key: "activites", label: "Activités", count: 1 },
      { key: "emails", label: "Emails", count: 1 },
    ]);
  });

  it("compte un contact archivé comme un lien : archiver ne délie pas", async () => {
    const held = await newCompany("Fonderie Contact Archivé");
    const contactId = await newContactOf(held.id, "Roussel");
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, contactId));
    expect(await deleteBlockers("company", held.id)).toEqual([{ key: "person-companyId", label: "Contacts", count: 1 }]);
  });
});

describe("suppression définitive (CRM-62, contrat 31, D21)", () => {
  it("supprime une fiche sans lien avec son historique, et la fiche devient introuvable", async () => {
    const created = await newCompany("Presses Éphémères");
    expect((await listHistory("company", created.id)).length).toBeGreaterThan(0);

    await deleteRecord("company", created.id);
    await expect(getObjectRecord("company", created.id)).rejects.toMatchObject({ status: 404 });
    expect(await listHistory("company", created.id)).toEqual([]);
  });

  it("refuse (409) de supprimer une fiche retenue, sans rien effacer, et la liste de ce qui la retient accompagne le refus", async () => {
    const held = await newCompany("Fonderie Protégée");
    await newContactOf(held.id, "Marchand");

    await expect(deleteRecord("company", held.id)).rejects.toMatchObject({
      status: 409,
      code: "fiche_liee",
      details: { blockers: [{ key: "person-companyId", label: "Contacts", count: 1 }] },
    });
    expect((await getObjectRecord("company", held.id)).id).toBe(held.id);
  });

  it("refuse (404) de supprimer une fiche inconnue", async () => {
    await expect(deleteRecord("company", "11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({ status: 404 });
  });
});
