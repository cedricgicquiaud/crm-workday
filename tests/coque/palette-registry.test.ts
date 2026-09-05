import { describe, expect, it } from "vitest";
import { getPaletteEntries, registerPaletteEntries } from "@/features/shell/palette/registry";

/**
 * Contrat 23 : ce fichier est un « module de test » qui enregistre une entrée auprès de la
 * palette sans toucher aux fichiers de la palette. Une feature suivante fera pareil.
 */
describe("registre de la palette (CRM-28, contrat 23)", () => {
  it("liste une entrée « Test » enregistrée par un module extérieur à la palette", () => {
    registerPaletteEntries([{ id: "test", label: "Test", group: "actions", run: () => {} }]);
    expect(getPaletteEntries().map((e) => e.label)).toContain("Test");
  });
});
