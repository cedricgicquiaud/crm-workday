import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { eq } from "drizzle-orm";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const ACTOR = { email: "acteur-registre@exemple.fr", firstName: "Léa", lastName: "Morel", password: "MotDePasse-Registre-1", role: "membre" as const };
let actorId: string;

beforeAll(async () => {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(user).where(eq(user.email, ACTOR.email));
  actorId = (await createUserWithPassword(ACTOR)).id;
});
afterAll(async () => {
  await db.delete(auditLog);
  await db.delete(company);
  await closeDb();
});

/** Ce que les livraisons suivantes liront dans la déclaration de l'entreprise (2.1b recherche, 2.6a doublons, 2.5a colonnes). */
describe("déclaration de l'entreprise dans le registre (CRM-33, D4, D23)", () => {
  it("déclare la clé « company », ses libellés, son icône, l'adresse de sa fiche, cinq champs de création rapide et aucune relation", () => {
    const definition = getObject("company");
    expect(definition.labels).toEqual({ singular: "Entreprise", plural: "Entreprises", article: "une" });
    expect(definition.href("abc")).toBe("/entreprises/abc");
    expect(definition.apiBase).toBe("/api/entreprises");
    expect(definition.icon).toBeDefined();
    expect(definition.quickCreate).toEqual(["name", "type", "siren", "website", "ownerId"]);
    expect(definition.relations).toEqual([]);
  });

  it("retrouve une entreprise par une sous-chaîne de sa raison sociale, insensible à la casse, ou par son SIREN ; jamais une archivée", async () => {
    const acme = await createObject("company", { name: "ACME SAS", type: "client", siren: "123 456 789" }, { id: actorId });
    const archived = await createObject("company", { name: "ACME Archivée", type: "client" }, { id: actorId });
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, archived.id));
    const { search } = getServerObject("company");
    expect((await search("acm")).map((hit) => hit.id)).toEqual([acme.id]);
    expect((await search("123456789")).map((hit) => hit.title)).toEqual(["ACME SAS"]);
    expect(await search("zzz")).toEqual([]);
  });
});

describe("clé de doublon (D19, préparée pour 2.6a)", () => {
  it("donne la même clé à deux raisons sociales qui ne diffèrent que par la casse et les espaces", () => {
    const { duplicateKey } = getServerObject("company");
    expect(duplicateKey({ name: "  ACME   SAS " })).toBe(duplicateKey({ name: "acme sas" }));
    expect(duplicateKey({ name: "ACME SAS" })).not.toBe(duplicateKey({ name: "Acmé Conseil" }));
  });
});
