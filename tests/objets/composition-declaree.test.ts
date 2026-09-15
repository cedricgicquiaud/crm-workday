import { readFileSync } from "node:fs";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldControl, type FieldControlProps } from "@/features/objects/field-control";
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

/**
 * Une page de fiche est mince parce que la composition est déclarée, pas parce qu'elle a déménagé :
 * la page personne ne sait rien de la personne, comme la page entreprise ne sait rien de
 * l'entreprise. Chaque page qui recopierait la fiche rouvrirait à la livraison suivante (2.2, 2.6a).
 */
describe("page d'une fiche (CRM-73, D20)", () => {
  const source = (path: string) => readFileSync(path, "utf8");

  it("ne fait qu'appeler la fiche générique avec la clé de l'objet, sans rien importer de l'objet lui-même", () => {
    const page = source("src/app/(app)/personnes/[id]/page.tsx");
    expect(page).toContain('<ObjectSheet type="person"');
    expect(page).not.toMatch(/@\/features\/persons\//);
    /* Même forme que la page entreprise : à la ligne d'import et à la clé près, les deux pages sont le même fichier. */
    expect(page.split("\n").length).toBeLessThanOrEqual(source("src/app/(app)/entreprises/[id]/page.tsx").split("\n").length + 2);
  });
});

/**
 * Un champ se rend au même endroit pour tout le monde (CRM-78) : la section « Champs », le dialogue
 * de création rapide et « Profil contact » appelaient chacun leur copie, d'où un contrôle sorti à
 * 32 px sur la fiche (défaut de la repasse 2.2, parent de CRM-31).
 */
describe("un seul composant rend un champ (CRM-78)", () => {
  const rendered = (props: Partial<FieldControlProps> = {}) => renderToString(createElement(FieldControl, { id: "champ-test", label: "Poste", placement: "sheet", kind: "text", value: "DSI", ...props }));

  it("porte le libellé au-dessus du contrôle, lié à lui, et montre la valeur enregistrée", () => {
    const html = rendered();
    expect(html).toMatch(/<label[^>]*for="champ-test"[^>]*>Poste<\/label>/);
    expect(html).toContain('value="DSI"');
  });

  it("affiche un refus sous le champ, en alerte, et le fait désigner par le contrôle", () => {
    const html = rendered({ error: "Valeur invalide." });
    expect(html).toMatch(/id="champ-test-error"[^>]*role="alert"/);
    expect(html).toContain("Valeur invalide.");
    expect(html).toContain('aria-describedby="champ-test-error"');
    expect(html).toContain('aria-invalid="true"');
  });

  /* La hauteur d'un champ vient des tokens de densité : 28 px sur une fiche, 32 px dans un dialogue, jamais d'un « h-7 » ou d'un « h-8 » écrit à la main. */
  it("prend sa hauteur des tokens de densité, celle de la fiche ou celle du dialogue", () => {
    expect(rendered({ placement: "sheet" })).toContain("h-(--control-h)");
    expect(rendered({ placement: "sheet" })).not.toMatch(/\bh-7\b/);
    expect(rendered({ placement: "dialog" })).toContain("h-(--control-h-lg)");
    expect(rendered({ placement: "dialog" })).not.toMatch(/\bh-8\b/);
  });

  it("rend une valeur en lecture seule en texte lié à son libellé, jamais par un contrôle éteint", () => {
    const html = rendered({ readOnly: true, value: "contact", display: "Contact" });
    expect(html).toMatch(/aria-labelledby="champ-test-label"[^>]*>Contact</);
    expect(html).not.toContain("<input");
    expect(html).not.toContain("disabled");
  });
});
