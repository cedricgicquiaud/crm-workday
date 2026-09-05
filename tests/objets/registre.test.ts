import { CircleDashedIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { fieldsOf } from "@/features/objects/fields";
import { getObject, registerObject } from "@/features/objects/registry";

/**
 * D4 (règle de branchement), CRM-33 : ce fichier est un « module de test » qui déclare un objet
 * auprès du registre sans toucher aux fichiers des mécanismes. Les objets des features suivantes
 * feront pareil.
 */
describe("registre d'objets (CRM-33, D4)", () => {
  it("rend à un module de test qui enregistre un objet ses champs typés (fieldsOf) et l'adresse de sa fiche (href)", () => {
    registerObject({
      key: "test_object",
      order: 900,
      labels: { singular: "Objet de test", plural: "Objets de test", article: "un" },
      icon: CircleDashedIcon,
      href: (id) => `/objets-de-test/${id}`,
      apiBase: "/api/objets-de-test",
      titleField: "name",
      fields: [
        { key: "name", label: "Nom", type: "text", required: true, maxLength: 120, order: 10 },
        { key: "kind", label: "Genre", type: "list", values: [{ value: "a", label: "A" }], order: 20 },
      ],
      relations: [],
    });

    expect(fieldsOf("test_object").map((f) => [f.key, f.type])).toEqual([
      ["name", "text"],
      ["kind", "list"],
    ]);
    expect(getObject("test_object").href("42")).toBe("/objets-de-test/42");
  });
});
