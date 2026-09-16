import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, company, consultantModule, consultantProfile, contactProfile, customFieldValue, emailLog, objectRedirect, person, personEmail, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { mergeRecords, planMerge } from "@/features/merge/merge";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { getConsultantProfile, upsertConsultantProfile } from "@/features/consultants/consultant-profile";
import { getContactProfile, upsertContactProfile } from "@/features/persons/contact-profile";
import { otherEmailsOf, setOtherEmails } from "@/features/persons/emails";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-fusion-personnes@exemple.fr", firstName: "Sophie", lastName: "Nadal", password: "MotDePasse-Fusion-Personnes-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
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

    expect(await otherEmailsOf(kept.id)).toEqual(["cbonnet@ancienne.fr", "claire.b@ancienne.fr"]);
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
    expect((await getObjectRecord("person", kept.id)).profiles).toEqual(["contact"]);
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

/**
 * D16 : la fiche conservée garde ses profils. Un profil consultant que l'absorbée seule porte la
 * rejoint ; quand les deux en ont un, celui de l'absorbée est consigné en toutes lettres dans
 * l'entrée de fusion, puis disparaît. « Profils » se recalcule : il n'est jamais recopié.
 */
describe("fusion de deux consultants (CRM-82, D16)", () => {
  const newConsultant = async (firstName: string, lastName: string, email: string, profile: Record<string, unknown>) => {
    const record = await newPerson(firstName, lastName, email);
    await upsertConsultantProfile(record.id, profile, actor());
    return record;
  };

  it("emmène le profil consultant de l'absorbée, avec ses modules et sa société de facturation, quand la conservée n'en a pas", async () => {
    const dupont = await createObject("company", { name: "Dupont Conseil", type: "societe_de_consultant" }, actor());
    const kept = await newPerson("Hugo", "Sainte", "hugo.sainte@exemple.fr");
    const absorbed = await newConsultant("Hugo", "Sainte", "h.sainte@exemple.fr", { status: "freelance", billingCompanyId: dupont.id, modules: ["hcm", "integration"], certifiedModules: ["hcm"] });

    expect((await planMerge("person", kept.id, absorbed.id)).moved).toContainEqual({ key: "consultant_profile", label: "Profil consultant", count: 1 });

    await mergeRecords("person", kept.id, absorbed.id, []);

    expect(await getConsultantProfile(kept.id)).toMatchObject({ status: "freelance", billingCompanyId: dupont.id, modules: ["hcm", "integration"], certifiedModules: ["hcm"] });
    expect((await getObjectRecord("person", kept.id)).profiles).toEqual(["consultant"]);
  });

  it("garde le profil de la conservée quand les deux en ont un, consigne celui de l'absorbée dans l'entrée de fusion, et ne le compte pas comme déplacé", async () => {
    const portage = await createObject("company", { name: "Portage Atlantique", type: "societe_de_portage" }, actor());
    const kept = await newConsultant("Sarah", "Kouyaté", "sarah.k@exemple.fr", { status: "salarie", modules: ["finance"] });
    const absorbed = await newConsultant("Sarah", "Kouyate", "s.kouyate@exemple.fr", { status: "portage", billingCompanyId: portage.id, modules: ["hcm", "payroll"], certifiedModules: ["payroll"] });

    expect((await planMerge("person", kept.id, absorbed.id)).moved.find((family) => family.key === "consultant_profile")).toBeUndefined();

    await mergeRecords("person", kept.id, absorbed.id, []);

    expect(await getConsultantProfile(kept.id)).toMatchObject({ status: "salarie", modules: ["finance"], billingCompanyId: null });
    expect(await db.select().from(consultantProfile).where(inArray(consultantProfile.personId, [kept.id, absorbed.id]))).toHaveLength(1);

    /* Ce que portait l'absorbée est lisible : son statut, sa société par son nom, ses modules et leurs certifications (D16). */
    const merged = (await listHistory("person", kept.id)).find((entry) => entry.action === "fusionnee");
    expect(merged?.oldValue).toContain("Profil consultant : statut Portage");
    expect(merged?.oldValue).toContain("société de facturation Portage Atlantique");
    expect(merged?.oldValue).toContain("modules HCM, Payroll (certifié sur Payroll)");
  });

  it("fusionne un contact dans un consultant : la conservée porte les deux profils, recalculés depuis ce qu'elle porte", async () => {
    const acme = await newCompany("Acme");
    const kept = await newConsultant("Théo", "Lemoine", "theo.lemoine@exemple.fr", { status: "freelance" });
    const absorbed = await newPerson("Théo", "Lemoine", "t.lemoine@exemple.fr");
    await upsertContactProfile(absorbed.id, { companyId: acme.id, jobTitle: "Architecte" }, actor());

    await mergeRecords("person", kept.id, absorbed.id, []);

    expect((await getObjectRecord("person", kept.id)).profiles).toEqual(["contact", "consultant"]);
    expect(await getContactProfile(kept.id)).toMatchObject({ companyId: acme.id, jobTitle: "Architecte" });
    expect(await getConsultantProfile(kept.id)).toMatchObject({ status: "freelance" });
  });

  it("refuse (409) de rejouer une fusion déjà faite : la fiche conservée ne se détruit pas d'un second appel", async () => {
    const kept = await newConsultant("Rania", "Belkacem", "rania.b@exemple.fr", { status: "salarie" });
    const absorbed = await newPerson("Rania", "Belkacem", "r.belkacem@exemple.fr");
    await mergeRecords("person", kept.id, absorbed.id, []);

    await expect(mergeRecords("person", kept.id, absorbed.id, [])).rejects.toMatchObject({ status: 409, code: "fiche_absorbee" });
    expect(await getConsultantProfile(kept.id)).toMatchObject({ status: "salarie" });
  });
});
