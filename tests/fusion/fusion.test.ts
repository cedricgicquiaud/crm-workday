import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, company, contactProfile, customFieldDefinition, customFieldValue, emailLog, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { listHistory } from "@/features/history/history";
import { mergeRecords, planMerge } from "@/features/merge/merge";
import { createObject, getObjectRecord, updateObject } from "@/features/objects/service";
import { upsertContactProfile } from "@/features/persons/contact-profile";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-fusion@exemple.fr", firstName: "Alix", lastName: "Barrault", password: "MotDePasse-Fusion-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(emailLog);
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(customFieldValue);
  await db.delete(contactProfile);
  await db.delete(person);
  await db.delete(company);
  await db.delete(customFieldDefinition);
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
const newCompany = (name: string, values: Record<string, unknown> = {}) => createObject("company", { name, type: "client", ...values }, actor());

describe("fusion de deux fiches (CRM-59, contrat 29, D20)", () => {
  it("rattache à la fiche conservée les contacts, activités, historique, valeurs et références de l'absorbée, puis fait disparaître l'absorbée", async () => {
    const kept = await newCompany("Acme");
    const absorbed = await newCompany("ACME SAS");
    const contact = await createObject("person", { firstName: "Claire", lastName: "Bonnet" }, actor());
    await upsertContactProfile(contact.id, { companyId: absorbed.id }, actor());
    const note = await createActivity("company", absorbed.id, { type: "note", body: "Premier rendez-vous" }, actor());
    /* Une activité écrite sur le contact porte l'entreprise du moment comme fiche parente : elle suit aussi. */
    const surLeContact = await createActivity("person", contact.id, { type: "note", body: "Appel du contact" }, actor());
    await db.insert(emailLog).values({ to: "compta@acme.fr", subject: "Devis", body: "<p>Devis</p>", template: "test", status: "envoye", objectType: "company", objectId: absorbed.id });
    const segment = await createDefinition({ objectType: "company", label: "Segment", type: "text" }, actor());
    await updateObject("company", absorbed.id, { [customFieldKey(segment.id)]: "PME" }, actor());

    await mergeRecords("company", kept.id, absorbed.id, []);

    expect((await db.select().from(person).where(eq(person.id, contact.id)))[0].companyId).toBe(kept.id);
    expect((await db.select().from(activity).where(eq(activity.id, note.id)))[0].objectId).toBe(kept.id);
    expect((await db.select().from(activity).where(eq(activity.id, surLeContact.id)))[0].parentId).toBe(kept.id);
    expect((await db.select().from(emailLog).where(eq(emailLog.objectType, "company")))[0].objectId).toBe(kept.id);
    expect((await getObjectRecord("company", kept.id))[customFieldKey(segment.id)]).toBe("PME");
    expect(await db.select().from(company).where(eq(company.id, absorbed.id))).toEqual([]);
  });

  it("écrit dans le fil de la fiche conservée une entrée « fusionnée » sans auteur, qui nomme l'absorbée, et reprend l'historique de celle-ci", async () => {
    const kept = await newCompany("Banque Solveige");
    const absorbed = await newCompany("Banque Solveige SA");

    await mergeRecords("company", kept.id, absorbed.id, []);

    const history = await listHistory("company", kept.id);
    expect(history.filter((entry) => entry.action === "creee")).toHaveLength(2);
    expect(history.find((entry) => entry.action === "fusionnee")).toMatchObject({ author: null, newValue: "Banque Solveige SA" });
  });

  it("garde champ par champ la valeur de la fiche conservée, sauf pour les champs explicitement pris à l'absorbée", async () => {
    const kept = await newCompany("Fonderie Bertin");
    const absorbed = await newCompany("Fonderie Bertin SARL", { city: "Lyon", sector: "Métallurgie" });

    const merged = await mergeRecords("company", kept.id, absorbed.id, ["city"]);

    expect(merged.name).toBe("Fonderie Bertin");
    expect(merged.city).toBe("Lyon");
    expect(merged.sector).toBeNull();
  });

  it("ne garde qu'une valeur par champ personnalisé quand les deux fiches en portent une, et l'aperçu ne la compte pas comme déplacée", async () => {
    const kept = await newCompany("Presses Aubry");
    const absorbed = await newCompany("Presses Aubry SAS");
    const note = await createDefinition({ objectType: "company", label: "Note interne", type: "text" }, actor());
    const key = customFieldKey(note.id);
    await updateObject("company", kept.id, { [key]: "à rappeler" }, actor());
    await updateObject("company", absorbed.id, { [key]: "à relancer" }, actor());

    expect((await planMerge("company", kept.id, absorbed.id)).moved.find((family) => family.key === "valeurs")).toBeUndefined();

    await mergeRecords("company", kept.id, absorbed.id, []);
    expect(await db.select().from(customFieldValue).where(eq(customFieldValue.definitionId, note.id))).toHaveLength(1);
    expect((await getObjectRecord("company", kept.id))[key]).toBe("à rappeler");
  });

  it("prend la valeur d'un champ personnalisé de l'absorbée quand elle est explicitement choisie", async () => {
    const kept = await newCompany("Charpentes Ollivier");
    const absorbed = await newCompany("Charpentes Ollivier SAS");
    const note = await createDefinition({ objectType: "company", label: "Suivi", type: "text" }, actor());
    const key = customFieldKey(note.id);
    await updateObject("company", kept.id, { [key]: "à rappeler" }, actor());
    await updateObject("company", absorbed.id, { [key]: "à relancer" }, actor());

    await mergeRecords("company", kept.id, absorbed.id, [key]);

    expect(await db.select().from(customFieldValue).where(eq(customFieldValue.definitionId, note.id))).toHaveLength(1);
    expect((await getObjectRecord("company", kept.id))[key]).toBe("à relancer");
  });
});
