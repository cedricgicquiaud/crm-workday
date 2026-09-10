import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { customFieldDefinition, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, listDefinitions } from "@/features/custom-fields/definitions";
import { closeDb, db } from "@/lib/db";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

const ADMIN = { email: "admin-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-Champs-1", role: "administrateur" as const };

let actor: { id: string };

beforeAll(async () => {
  registerTestObject();
  await db.delete(customFieldDefinition);
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
});
afterAll(async () => {
  await db.delete(customFieldDefinition);
  await closeDb();
});

/**
 * Définitions de champs personnalisés (CRM-54) : un administrateur les pose par objet, elles se
 * relisent telles quelles. Le rang est enregistré, jamais déduit de l'ordre de création.
 */
describe("définitions de champs personnalisés (CRM-54)", () => {
  it("enregistre un champ nombre et un champ liste sur un objet, et les rend dans l'ordre de leur rang", async () => {
    const effectif = await createDefinition({ objectType: TEST_TYPE, label: "Effectif", type: "number" }, actor);
    const segment = await createDefinition({ objectType: TEST_TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME", "Startup"], required: true }, actor);

    expect(effectif).toMatchObject({ objectType: TEST_TYPE, label: "Effectif", type: "number", values: [], retiredValues: [], required: false, archived: false });
    expect(segment).toMatchObject({ label: "Segment", type: "list", values: ["Grand compte", "PME", "Startup"], required: true });
    expect(segment.position).toBeGreaterThan(effectif.position);

    const stored = await listDefinitions();
    expect(stored.map((definition) => definition.label)).toEqual(["Effectif", "Segment"]);
  });
});
