import { CircleDashedIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { fieldsOf } from "@/features/objects/fields";
import { getObject, listObjects, registerObject } from "@/features/objects/registry";

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
      listHref: "/objets-de-test",
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

describe("ordre des objets", () => {
  it("liste les objets par rang « order » croissant, quel que soit l'ordre d'enregistrement", () => {
    const base = { labels: { singular: "x", plural: "x", article: "un" }, icon: CircleDashedIcon, href: (id: string) => id, listHref: "/x", apiBase: "/api/x", titleField: "name", fields: [], relations: [] };
    registerObject({ ...base, key: "test_ordre_b", order: 920 });
    registerObject({ ...base, key: "test_ordre_a", order: 910 });
    const keys = listObjects()
      .map((o) => o.key)
      .filter((k) => k.startsWith("test_ordre_"));
    expect(keys).toEqual(["test_ordre_a", "test_ordre_b"]);
  });
});
