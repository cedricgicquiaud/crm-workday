import { describe, expect, it } from "vitest";
import { customFieldKey, setCustomFields, type CustomFieldDefinition } from "@/features/custom-fields/fields-source";
import { fieldsOf } from "@/features/objects/fields";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

registerTestObject();

const EFFECTIF: CustomFieldDefinition = { id: "11111111-1111-4111-8111-111111111111", objectType: TEST_TYPE, label: "Effectif", type: "number", values: [], retiredValues: [], required: false, position: 10, archived: false };

/**
 * Les définitions posées par un administrateur deviennent des descripteurs de champs : `fieldsOf`
 * les rend à côté des champs déclarés par l'objet, et les dix lecteurs des descripteurs (fiche,
 * colonnes, filtres, tri) les voient sans une ligne de plus (CRM-56, contrat 18).
 */
describe("les définitions deviennent des descripteurs de champs (CRM-56)", () => {
  it("rend un champ personnalisé parmi les champs de son objet, après les champs déclarés", () => {
    setCustomFields([EFFECTIF]);
    const fields = fieldsOf(TEST_TYPE);
    const custom = fields.find((field) => field.key === customFieldKey(EFFECTIF.id));
    expect(custom).toMatchObject({ label: "Effectif", type: "number", sortable: true, section: "Autres champs" });
    expect(fields.at(-1)).toBe(custom);
    expect(fields.filter((field) => field.key === "name")).toHaveLength(1);
  });
});
