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

});
