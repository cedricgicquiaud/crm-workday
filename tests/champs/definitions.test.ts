import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { CircleDashedIcon } from "lucide-react";
import { customFieldDefinition, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, listDefinitions, moveDefinition } from "@/features/custom-fields/definitions";
import { CUSTOM_FIELD_LABEL_MAX } from "@/features/custom-fields/fields-source";
import { HttpError } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db";
import { registerObject } from "@/features/objects/registry";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

/** Un second objet déclaré au registre : un libellé déjà pris sur l'un reste libre sur l'autre. */
const OTHER_TYPE = "test_second_objet";
const OTHER_OBJECT = {
  key: OTHER_TYPE,
  order: 951,
  labels: { singular: "Second", plural: "Seconds", article: "un" as const },
  icon: CircleDashedIcon,
  href: (id: string) => `/seconds/${id}`,
  listHref: "/seconds",
  apiBase: "/api/seconds",
  titleField: "name",
  fields: [{ key: "name", label: "Nom", type: "text" as const, required: true, order: 10 }],
  relations: [],
};

const ADMIN = { email: "admin-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-Champs-1", role: "administrateur" as const };

let actor: { id: string };

beforeAll(async () => {
  registerTestObject();
  registerObject({ ...OTHER_OBJECT });
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

  it("refuse deux champs de même libellé sur le même objet (409), et l'accepte sur un autre objet", async () => {
    await expect(createDefinition({ objectType: TEST_TYPE, label: "Effectif", type: "text" }, actor)).rejects.toMatchObject({ status: 409, code: "libelle_deja_pris" });
    await expect(createDefinition({ objectType: TEST_TYPE, label: "  Effectif  ", type: "text" }, actor)).rejects.toMatchObject({ status: 409 });
    const elsewhere = await createDefinition({ objectType: OTHER_TYPE, label: "Effectif", type: "text" }, actor);
    expect(elsewhere.objectType).toBe(OTHER_TYPE);
  });

  it("refuse un libellé vide, un libellé trop long, un type inconnu et une liste sans valeur (400), en nommant le champ fautif", async () => {
    const refusals: [unknown, string][] = [
      [{ objectType: TEST_TYPE, label: "   ", type: "text" }, "label"],
      [{ objectType: TEST_TYPE, label: "x".repeat(CUSTOM_FIELD_LABEL_MAX + 1), type: "text" }, "label"],
      [{ objectType: TEST_TYPE, label: "Genre", type: "couleur" }, "type"],
      [{ objectType: TEST_TYPE, label: "Genre", type: "list", values: [] }, "values"],
      [{ objectType: TEST_TYPE, label: "Genre", type: "list", values: ["Client", "Client"] }, "values"],
      [{ objectType: "objet_inconnu", label: "Genre", type: "text" }, "objectType"],
    ];
    for (const [input, field] of refusals) {
      const refused = await createDefinition(input, actor).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(HttpError);
      expect(refused).toMatchObject({ status: 400, code: "donnees_invalides" });
      expect((refused as HttpError).details.fields).toHaveProperty(field);
      expect((refused as HttpError).message).not.toBe("");
    }
    expect((await listDefinitions(TEST_TYPE)).map((definition) => definition.label)).toEqual(["Effectif", "Segment"]);
  });

  it("réordonne les champs d'un objet : monter un champ le passe devant son voisin, et le premier ne monte pas plus haut", async () => {
    const [premier, second] = await listDefinitions(TEST_TYPE);

    await moveDefinition(second.id, "up");
    expect((await listDefinitions(TEST_TYPE)).map((definition) => definition.label)).toEqual([second.label, premier.label]);

    /* Le champ en tête reste en tête : rien ne bouge, et rien n'échoue. */
    await moveDefinition(second.id, "up");
    expect((await listDefinitions(TEST_TYPE)).map((definition) => definition.label)).toEqual([second.label, premier.label]);

    await moveDefinition(second.id, "down");
    expect((await listDefinitions(TEST_TYPE)).map((definition) => definition.label)).toEqual([premier.label, second.label]);

    /* Le rang d'un objet ne dépend pas des champs d'un autre. */
    expect((await listDefinitions(OTHER_TYPE)).map((definition) => definition.label)).toEqual(["Effectif"]);
  });
});
