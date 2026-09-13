import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, company, contactProfile, customFieldDefinition, emailLog, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { planMerge } from "@/features/merge/merge";
import { createObject, updateObject } from "@/features/objects/service";
import { upsertContactProfile } from "@/features/persons/contact-profile";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-apercu-fusion@exemple.fr", firstName: "Théo", lastName: "Vidal", password: "MotDePasse-Apercu-Fusion-1", role: "membre" as const };

const UNKNOWN = "11111111-1111-1111-1111-111111111111";

let memberId: string;

async function cleanup() {
  await db.delete(emailLog);
  await db.delete(activity);
  await db.delete(auditLog);
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
const newCompany = (name: string) => createObject("company", { name, type: "client" }, actor());

describe("aperçu d'une fusion (CRM-59, contrat 29)", () => {
  it("compte exactement ce qui sera déplacé, famille par famille, et tait les familles vides", async () => {
    const kept = await newCompany("Acme");
    const absorbed = await newCompany("ACME SAS");
    /* Rien n'est encore rattaché à l'absorbée, sauf son entrée de création. */
    expect(await planMerge("company", kept.id, absorbed.id)).toEqual({ keptId: kept.id, absorbedId: absorbed.id, moved: [{ key: "historique", label: "Historique", count: 1 }], fields: [{ key: "name", label: "Raison sociale", kept: "Acme", absorbed: "ACME SAS" }] });

    const contact = await createObject("person", { firstName: "Claire", lastName: "Bonnet" }, actor());
    await upsertContactProfile(contact.id, { companyId: absorbed.id }, actor());
    await createActivity("company", absorbed.id, { type: "note", body: "Premier rendez-vous" }, actor());
    await createActivity("company", absorbed.id, { type: "note", body: "Relance" }, actor());
    await db.insert(emailLog).values({ to: "compta@acme.fr", subject: "Devis", body: "<p>Devis</p>", template: "test", status: "envoye", objectType: "company", objectId: absorbed.id });
    const segment = await createDefinition({ objectType: "company", label: "Segment", type: "text" }, actor());
    await updateObject("company", absorbed.id, { [customFieldKey(segment.id)]: "PME" }, actor());

    expect((await planMerge("company", kept.id, absorbed.id)).moved).toEqual([
      { key: "person-companyId", label: "Contacts", count: 1 },
      { key: "activites", label: "Activités", count: 2 },
      { key: "emails", label: "Emails", count: 1 },
      { key: "historique", label: "Historique", count: 2 },
      { key: "valeurs", label: "Valeurs de champs personnalisés", count: 1 },
    ]);
  });

  it("compte ce que porte l'absorbée, jamais ce que porte la fiche conservée", async () => {
    const kept = await newCompany("Fonderie Bertin");
    const absorbed = await newCompany("Fonderie Bertin SARL");
    await createActivity("company", kept.id, { type: "note", body: "Sur la fiche gardée" }, actor());

    const moved = (await planMerge("company", kept.id, absorbed.id)).moved;
    expect(moved.find((family) => family.key === "activites")).toBeUndefined();
  });
});

describe("champs à trancher dans une fusion (CRM-59, contrat 29, D20)", () => {
  it("nomme les champs dont les deux fiches portent des valeurs différentes, avec ce que chacune porte, et tait ceux qui se ressemblent", async () => {
    const kept = await newCompany("Papeterie Vidal");
    const absorbed = await createObject("company", { name: "Papeterie Vidal SAS", type: "prospect", city: "Lyon" }, actor());

    expect((await planMerge("company", kept.id, absorbed.id)).fields).toEqual([
      { key: "name", label: "Raison sociale", kept: "Papeterie Vidal", absorbed: "Papeterie Vidal SAS" },
      { key: "type", label: "Type", kept: "Client", absorbed: "Prospect" },
      { key: "city", label: "Ville", kept: "\u2014", absorbed: "Lyon" },
    ]);
  });

  it("ne propose aucun champ à trancher quand les deux fiches portent les mêmes valeurs", async () => {
    const kept = await newCompany("Presses Jumelles");
    const absorbed = await newCompany("Presses Jumelles");
    expect((await planMerge("company", kept.id, absorbed.id)).fields).toEqual([]);
  });
});

describe("refus d'une fusion impossible (CRM-59, contrats 29 et 32)", () => {
  it("refuse 400 de fusionner une fiche avec elle-même", async () => {
    const alone = await newCompany("Presses Aubry");
    await expect(planMerge("company", alone.id, alone.id)).rejects.toMatchObject({ status: 400, code: "meme_fiche" });
  });

  it("refuse 404 quand la fiche conservée ou l'absorbée est inconnue", async () => {
    const known = await newCompany("Papeterie Vidal");
    await expect(planMerge("company", known.id, UNKNOWN)).rejects.toMatchObject({ status: 404 });
    await expect(planMerge("company", UNKNOWN, known.id)).rejects.toMatchObject({ status: 404 });
  });

  it("refuse 409 quand l'une des deux fiches est archivée : une fiche rangée n'entre pas dans une fusion (D21)", async () => {
    const kept = await newCompany("Charpentes Ollivier");
    const absorbed = await newCompany("Charpentes Ollivier SAS");
    await archiveRecord("company", absorbed.id, actor());
    await expect(planMerge("company", kept.id, absorbed.id)).rejects.toMatchObject({ status: 409, code: "fiche_archivee" });

    await archiveRecord("company", kept.id, actor());
    await expect(planMerge("company", kept.id, absorbed.id)).rejects.toMatchObject({ status: 409, code: "fiche_archivee" });
  });
});
