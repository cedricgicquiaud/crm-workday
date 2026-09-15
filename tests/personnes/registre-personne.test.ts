import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { eq } from "drizzle-orm";
import { auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { fieldsOf, historyFieldsOf } from "@/features/objects/fields";
import { getObject, listObjects } from "@/features/objects/registry";
import { getServerObject, sectionsOf } from "@/features/objects/registry.server";
import { createObject } from "@/features/objects/service";
import { createPerson, updatePerson } from "@/features/persons/persons";
import { closeDb, db } from "@/lib/db";

const ACTOR = { email: "acteur-registre-personne@exemple.fr", firstName: "Léa", lastName: "Morel", password: "MotDePasse-Registre-2", role: "membre" as const };
let actorId: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ACTOR.email));
  actorId = (await createUserWithPassword(ACTOR)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** Ce que les mécanismes lisent dans la déclaration de la personne (D4) : barre latérale, liste, colonne des liens, palette, 2.3 (`feedParent`). */
describe("déclaration de la personne dans le registre (CRM-41, D4)", () => {
  it("déclare la clé « person » au rang 20 après l'entreprise, ses libellés, l'adresse de sa fiche, la relation contact → entreprise avec son pré-remplissage, et le champ dérivé Profils en colonne de liste", () => {
    const definition = getObject("person");
    expect(listObjects().map((o) => o.key)).toEqual(expect.arrayContaining(["company", "person"]));
    expect(listObjects().findIndex((o) => o.key === "company")).toBeLessThan(listObjects().findIndex((o) => o.key === "person"));
    expect(definition.order).toBe(20);
    expect(definition.labels).toEqual({ singular: "Personne", plural: "Personnes", article: "une" });
    expect(definition.href("abc")).toBe("/personnes/abc");
    expect(definition.listHref).toBe("/personnes");
    expect(definition.apiBase).toBe("/api/personnes");
    expect(definition.titleField).toBe("name");
    expect(definition.relations).toEqual([
      { to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Contacts", prefill: "companyId" },
      /* La société de facturation du profil consultant (3.1, D4) : la fiche de l'entreprise liste ses consultants facturés, et on n'en crée pas un depuis là (aucun `prefill`). */
      { to: "company", fkColumn: "billingCompanyId", label: "Société de facturation", inverseLabel: "Consultants facturés" },
    ]);
    expect(definition.feedParent).toBe("company");
    expect(definition.listColumns).toContain("profiles");
    /* D7 : cinq champs, l'entreprise est la relation déclarée (son `prefill`), le rôle se règle sur la fiche. */
    expect(definition.quickCreate).toEqual(["firstName", "lastName", "email", "companyId", "jobTitle"]);
    expect(definition.fields.find((f) => f.key === "jobTitle")).toMatchObject({ label: "Poste", type: "text", maxLength: 120 });
    expect(definition.fields.find((f) => f.key === "profiles")).toMatchObject({ type: "multilist", editable: false });
    expect(definition.fields.find((f) => f.key === "name")).toMatchObject({ editable: false });
  });
});

/** L'historique nomme un champ par son libellé ; ceux du profil contact s'éditent hors de la section « Champs » et doivent être déclarés quand même. */
describe("libellés des champs édités hors de la section « Champs » (CRM-42, D12)", () => {
  it("déclare « Entreprise » et « Rôle dans la décision » pour l'historique, sans les ajouter à la section « Champs » de la fiche", () => {
    const labels = new Map(historyFieldsOf("person").map((field) => [field.key, field.label]));
    expect(labels.get("companyId")).toBe("Entreprise");
    expect(labels.get("decisionRole")).toBe("Rôle dans la décision");
    /* Les champs de la fiche restent lisibles par le même chemin. */
    expect(labels.get("profiles")).toBe("Profils");
    expect(labels.get("jobTitle")).toBe("Poste");
    expect(fieldsOf("person").map((field) => field.key)).not.toContain("companyId");
    expect(fieldsOf("person").map((field) => field.key)).not.toContain("decisionRole");
  });
});

/**
 * D20 : ce que la fiche générique montre d'une personne vient de sa déclaration — le badge de tête,
 * le chargeur de la fiche (le poste et les autres adresses viennent d'ailleurs que de ses colonnes)
 * et ses sections avec leur chargeur.
 */
describe("composition déclarée de la fiche personne (CRM-73, D20)", () => {
  it("déclare le badge de tête « Profils », un chargeur de fiche qui rend le poste et les autres adresses, et la section « Profil contact » au rang 10 dont le chargeur rend le profil et les entreprises proposées", async () => {
    const acme = await createObject("company", { name: "Cabinet Acme", type: "client" }, { id: actorId });
    const claire = await createPerson({ firstName: "Claire", lastName: "Noël", email: "claire.noel@acme.fr", otherEmails: "c.noel@perso.fr", companyId: acme.id, jobTitle: "DSI" }, { id: actorId });

    expect(getObject("person").headerFields).toEqual(["profiles"]);

    const record = await getServerObject("person").loadRecord!(claire.id);
    expect(record).toMatchObject({ id: claire.id, jobTitle: "DSI", otherEmails: "c.noel@perso.fr" });

    const sections = sectionsOf("person");
    /* « Profil consultant » prend le rang suivant (3.1, D9) : il se rend sous « Profil contact ». */
    expect(sections.map((section) => [section.key, section.order])).toEqual([
      ["profil-contact", 10],
      ["profil-consultant", 20],
    ]);
    const data = (await sections[0].load(claire.id)) as { profile: { companyId: string; companyName: string; jobTitle: string | null } | null; companies: readonly { id: string; name: string }[] };
    expect(data.profile).toMatchObject({ companyId: acme.id, companyName: "Cabinet Acme", jobTitle: "DSI" });
    expect(data.companies).toContainEqual({ id: acme.id, name: "Cabinet Acme" });
  });
});

/**
 * Une ouverture de fiche lit le profil contact une fois, pas deux : le chargeur de la fiche
 * (`loadRecord`, pour le poste) et celui de la section « Profil contact » le demandent chacun, et
 * `cache` de React les réunit en une lecture pour la durée de la requête. La mémorisation elle-même
 * ne s'observe pas ici — hors requête Next, `cache` relit à chaque appel — d'où une garde sur la
 * déclaration, comme pour la page mince. L'écriture, elle, relit sans mémoire : mémorisée, elle
 * rendrait le profil d'avant l'enregistrement à qui vient de l'enregistrer.
 */
describe("lecture du profil contact par ouverture de fiche (CRM-73, D20)", () => {
  it("mémorise la lecture du profil par requête et laisse l'écriture relire sans mémoire", () => {
    const code = readFileSync("src/features/persons/contact-profile.ts", "utf8");
    expect(code).toMatch(/export const getContactProfile = cache\(readContactProfile\)/);
    expect(code).not.toMatch(/\bgetContactProfile\(/);
  });
});

describe("recherche d'une personne (CRM-41, D8, contrat 8)", () => {
  it("retrouve une personne par une sous-chaîne de « prénom nom », par son adresse principale ou par chacune de ses autres adresses, avec son entreprise en sous-titre ; jamais une archivée", async () => {
    const solveige = await createObject("company", { name: "Banque Solveige", type: "client" }, { id: actorId });
    const jean = await createPerson({ firstName: "Jean", lastName: "Dupont", email: "jean.dupont@solveige.fr", otherEmails: "jdupont@perso.fr", companyId: solveige.id }, { id: actorId });
    const archived = await createPerson({ firstName: "Jean", lastName: "Durand", email: "jean.durand@ailleurs.fr" }, { id: actorId });
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, archived.id));
    const { search } = getServerObject("person");

    expect((await search("an dup")).map((hit) => hit.id)).toEqual([jean.id]);
    expect(await search("dupont")).toEqual([{ id: jean.id, title: "Jean Dupont", subtitle: "Banque Solveige" }]);
    expect((await search("Jean.Dupont@solveige.fr")).map((hit) => hit.id)).toEqual([jean.id]);
    expect((await search("jdupont@perso")).map((hit) => hit.id)).toEqual([jean.id]);
    expect(await search("durand")).toEqual([]);
    expect(await search("zzz")).toEqual([]);

    /* Une adresse retirée ne retrouve plus la personne ; une personne sans entreprise a son adresse en sous-titre. */
    await updatePerson(jean.id, { otherEmails: "" }, { id: actorId });
    expect(await search("jdupont@perso")).toEqual([]);
    const solo = await createPerson({ firstName: "Marie", lastName: "Solo", email: "marie@solo.fr" }, { id: actorId });
    expect(await search("solo")).toEqual([{ id: solo.id, title: "Marie Solo", subtitle: "marie@solo.fr" }]);
  });
});

describe("clé de doublon (D19, préparée pour 2.6a)", () => {
  it("donne la même clé à deux « prénom nom » qui ne diffèrent que par la casse et les espaces", () => {
    const { duplicateKey } = getServerObject("person");
    expect(duplicateKey({ firstName: "  Jean ", lastName: "DUPONT" })).toBe(duplicateKey({ firstName: "jean", lastName: "dupont" }));
    expect(duplicateKey({ firstName: "Jean", lastName: "Dupont" })).not.toBe(duplicateKey({ firstName: "Jeanne", lastName: "Dupont" }));
    expect(duplicateKey({})).toBeNull();
  });
});
