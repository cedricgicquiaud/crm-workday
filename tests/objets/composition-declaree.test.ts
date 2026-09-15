import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { defineSection, getServerObject, registerServerObject, sectionsOf, type ObjectSection } from "@/features/objects/registry.server";

/**
 * Composition déclarée de la fiche (D20, CRM-73) : ce qu'une fiche montre sous « Champs » vient de
 * l'objet, jamais d'une condition dans un mécanisme. Comme `registre.test.ts`, ce fichier déclare
 * des objets de test : il n'a besoin ni de table ni de base, seule la déclaration est en jeu.
 */
const table = pgTable("test_composition", { id: uuid("id").primaryKey(), name: text("name").notNull() });
const base = { table, search: async () => [], duplicateKey: () => null };

describe("sections déclarées par un objet (CRM-73, D20)", () => {
  it("rend les sections d'un objet par rang croissant, quel que soit l'ordre de déclaration", () => {
    registerServerObject({
      ...base,
      key: "test_sections",
      sections: [
        defineSection({ key: "profil-consultant", order: 20, load: async () => null, render: () => null }),
        defineSection({ key: "profil-contact", order: 10, load: async () => null, render: () => null }),
      ],
    });
    expect(sectionsOf("test_sections").map((section) => section.key)).toEqual(["profil-contact", "profil-consultant"]);
  });

  it("rend aucune section pour un objet qui n'en déclare pas", () => {
    registerServerObject({ ...base, key: "test_sans_section" });
    expect(sectionsOf("test_sans_section")).toEqual([]);
  });
});

describe("section mal déclarée (CRM-73, D20)", () => {
  const withoutLoader = { key: "profil-contact", order: 10, render: () => null } as unknown as ObjectSection;
  const withoutRender = { key: "profil-contact", order: 10, load: async () => null } as unknown as ObjectSection;

  it("refuse à l'enregistrement, en la nommant, une section sans chargeur", () => {
    expect(() => registerServerObject({ ...base, key: "test_section_sans_chargeur", sections: [withoutLoader] })).toThrow("Objet « test_section_sans_chargeur » : la section « profil-contact » n'a pas de chargeur.");
    expect(() => getServerObject("test_section_sans_chargeur")).toThrow("Aucun objet");
  });

  it("refuse à l'enregistrement, en la nommant, une section sans rendu", () => {
    expect(() => registerServerObject({ ...base, key: "test_section_sans_rendu", sections: [withoutRender] })).toThrow("Objet « test_section_sans_rendu » : la section « profil-contact » n'a pas de rendu.");
    expect(() => getServerObject("test_section_sans_rendu")).toThrow("Aucun objet");
  });
});
