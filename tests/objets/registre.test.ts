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
    const base = { labels: { singular: "x", plural: "x", article: "un" }, icon: CircleDashedIcon, href: (id: string) => id, listHref: "/x", apiBase: "/api/x", titleField: "name", fields: [{ key: "name", label: "Nom", type: "text" as const, order: 10 }], relations: [] };
    registerObject({ ...base, key: "test_ordre_b", order: 920 });
    registerObject({ ...base, key: "test_ordre_a", order: 910 });
    const keys = listObjects()
      .map((o) => o.key)
      .filter((k) => k.startsWith("test_ordre_"));
    expect(keys).toEqual(["test_ordre_a", "test_ordre_b"]);
  });
});

describe("objet mal déclaré (CRM-33, D4)", () => {
  const base = { order: 940, labels: { singular: "x", plural: "x", article: "un" }, icon: CircleDashedIcon, href: (id: string) => id, listHref: "/x", apiBase: "/api/x", relations: [], fields: [{ key: "name", label: "Nom", type: "text" as const, order: 10 }] };

  it("refuse à l'enregistrement, avec un message explicite, un champ titre qui ne correspond à aucun champ déclaré", () => {
    expect(() => registerObject({ ...base, key: "test_titre_absent", titleField: "libelle" })).toThrow("Objet « test_titre_absent » : le champ titre « libelle » n'est pas déclaré dans ses champs.");
    expect(() => getObject("test_titre_absent")).toThrow("Objet inconnu");
  });

  it("refuse à l'enregistrement une colonne de liste qui ne correspond à aucun champ déclaré", () => {
    expect(() => registerObject({ ...base, key: "test_colonne_absente", titleField: "name", listColumns: ["name", "ville"] })).toThrow("Objet « test_colonne_absente » : la colonne de liste « ville » n'est pas déclarée dans ses champs.");
    expect(() => getObject("test_colonne_absente")).toThrow("Objet inconnu");
  });
});
