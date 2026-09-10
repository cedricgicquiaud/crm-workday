import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, company, contactProfile, customFieldValue, emailLog, objectRedirect, person, personEmail, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { mergeRecords, planMerge } from "@/features/merge/merge";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { getContactProfile, upsertContactProfile } from "@/features/persons/contact-profile";
import { otherEmailsOf, setOtherEmails } from "@/features/persons/emails";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-fusion-personnes@exemple.fr", firstName: "Sophie", lastName: "Nadal", password: "MotDePasse-Fusion-Personnes-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(objectRedirect);
  await db.delete(emailLog);
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(customFieldValue);
  await db.delete(contactProfile);
  await db.delete(personEmail);
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

const actor = () => ({ id: memberId });
const newPerson = (firstName: string, lastName: string, email: string) => createObject("person", { firstName, lastName, email }, actor());
const newCompany = (name: string) => createObject("company", { name, type: "client" }, actor());

describe("fusion de deux personnes (CRM-59, D20)", () => {
  it("rattache à la personne conservée les autres adresses de l'absorbée, et les annonce dans l'aperçu", async () => {
    const kept = await newPerson("Claire", "Bonnet", "claire.bonnet@exemple.fr");
    const absorbed = await newPerson("Claire", "Bonnet", "c.bonnet@exemple.fr");
    await setOtherEmails(absorbed.id, ["claire.b@ancienne.fr", "cbonnet@ancienne.fr"], actor());

    expect((await planMerge("person", kept.id, absorbed.id)).moved).toContainEqual({ key: "person_email", label: "Adresses email", count: 2 });

    await mergeRecords("person", kept.id, absorbed.id, []);

    expect(await otherEmailsOf(kept.id)).toEqual(["claire.b@ancienne.fr", "cbonnet@ancienne.fr"]);
    expect(await db.select().from(personEmail).where(eq(personEmail.personId, kept.id))).toHaveLength(2);
  });

  it("emmène le profil contact de l'absorbée, avec son entreprise de rattachement, quand la conservée n'en a pas", async () => {
    const acme = await newCompany("Acme");
    const kept = await newPerson("Louis", "Perret", "louis.perret@exemple.fr");
    const absorbed = await newPerson("Louis", "Perret", "l.perret@exemple.fr");
    await upsertContactProfile(absorbed.id, { companyId: acme.id, jobTitle: "Directeur des achats" }, actor());

    expect((await planMerge("person", kept.id, absorbed.id)).moved).toContainEqual({ key: "contact_profile", label: "Profil contact", count: 1 });

    await mergeRecords("person", kept.id, absorbed.id, []);

    expect(await getContactProfile(kept.id)).toMatchObject({ companyId: acme.id, companyName: "Acme", jobTitle: "Directeur des achats" });
    expect((await getObjectRecord("person", kept.id)).profiles).toBe("contact");
  });

  it("garde le profil contact de la conservée quand les deux en ont un, et consigne celui de l'absorbée dans l'entrée de fusion", async () => {
    const acme = await newCompany("Acme");
    const bertin = await newCompany("Fonderie Bertin");
    const kept = await newPerson("Inès", "Roux", "ines.roux@exemple.fr");
    const absorbed = await newPerson("Inès", "Roux", "i.roux@exemple.fr");
    await upsertContactProfile(kept.id, { companyId: acme.id, jobTitle: "Directrice" }, actor());
    await upsertContactProfile(absorbed.id, { companyId: bertin.id, jobTitle: "Consultante" }, actor());

    /* Le profil de l'absorbée ne se déplace pas : l'aperçu ne l'annonce donc pas comme déplacé. */
    expect((await planMerge("person", kept.id, absorbed.id)).moved.find((family) => family.key === "contact_profile")).toBeUndefined();

    await mergeRecords("person", kept.id, absorbed.id, []);

    expect(await getContactProfile(kept.id)).toMatchObject({ companyId: acme.id, jobTitle: "Directrice" });
    expect(await db.select().from(contactProfile).where(inArray(contactProfile.personId, [kept.id, absorbed.id]))).toHaveLength(1);

    /* L'ancien rattachement de l'absorbée est lisible dans l'historique, entreprise nommée (D20). */
    const merged = (await listHistory("person", kept.id)).find((entry) => entry.action === "fusionnee");
    expect(merged?.oldValue).toContain("Profil contact");
    expect(merged?.oldValue).toContain("Consultante");
    expect(merged?.oldValue).toContain("Fonderie Bertin");
  });
});
