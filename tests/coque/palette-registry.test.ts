import { describe, expect, it } from "vitest";
import { getPaletteEntries, registerPaletteEntries, subscribePalette } from "@/features/shell/palette/registry";

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

describe("abonnement au registre", () => {
  it("prévient ses abonnés à chaque enregistrement et à chaque retrait", () => {
    let notified = 0;
    const unsubscribe = subscribePalette(() => notified++);
    const unregister = registerPaletteEntries([{ id: "test-abonnement", label: "Test abonnement", group: "actions", run: () => {} }]);
    expect(notified).toBe(1);
    unregister();
    expect(notified).toBe(2);
    expect(getPaletteEntries().map((e) => e.id)).not.toContain("test-abonnement");
    unsubscribe();
    registerPaletteEntries([{ id: "test-silencieux", label: "Test silencieux", group: "actions", run: () => {} }]);
    expect(notified).toBe(2);
  });
});

describe("ordre des entrées", () => {
  it("trie par « order » croissant, puis par libellé quand « order » manque", () => {
    const unregister = registerPaletteEntries([
      { id: "ordre-b", label: "Ordre B", group: "actions", order: 20, run: () => {} },
      { id: "ordre-sans-2", label: "Ordre sans z", group: "actions", run: () => {} },
      { id: "ordre-a", label: "Ordre A", group: "actions", order: 10, run: () => {} },
      { id: "ordre-sans-1", label: "Ordre sans a", group: "actions", run: () => {} },
    ]);
    const labels = getPaletteEntries()
      .filter((e) => e.id.startsWith("ordre-"))
      .map((e) => e.label);
    expect(labels).toEqual(["Ordre A", "Ordre B", "Ordre sans a", "Ordre sans z"]);
    unregister();
  });
});
