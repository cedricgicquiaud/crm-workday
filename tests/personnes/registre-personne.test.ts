import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { eq } from "drizzle-orm";
import { auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { getObject, listObjects } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
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
    expect(definition.relations).toEqual([{ to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Contacts", prefill: "companyId" }]);
    expect(definition.feedParent).toBe("company");
    expect(definition.listColumns).toContain("profiles");
    /* D7 : cinq champs, l'entreprise est la relation déclarée (son `prefill`), le rôle se règle sur la fiche. */
    expect(definition.quickCreate).toEqual(["firstName", "lastName", "email", "companyId", "jobTitle"]);
    expect(definition.fields.find((f) => f.key === "jobTitle")).toMatchObject({ label: "Poste", type: "text", maxLength: 120 });
    expect(definition.fields.find((f) => f.key === "profiles")).toMatchObject({ type: "list", editable: false });
    expect(definition.fields.find((f) => f.key === "name")).toMatchObject({ editable: false });
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
