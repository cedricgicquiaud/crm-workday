import { describe, expect, it } from "vitest";
import { getPaletteSources, registerPaletteSource, type PaletteResult } from "@/features/shell/palette/registry";

/**
 * CRM-37 : ce fichier est un « module de test » qui enregistre une source de résultats auprès de
 * la palette sans toucher à ses fichiers. Un objet (entreprise, personne…) fera pareil.
 */
const noResults = async (): Promise<PaletteResult[]> => [];

describe("sources de résultats de la palette (CRM-37, D8)", () => {
  it("expose une source enregistrée par un module extérieur à la palette, et la retire par la fonction rendue", () => {
    const unregister = registerPaletteSource({ id: "source-test", search: noResults });
    expect(getPaletteSources().map((s) => s.id)).toContain("source-test");
    unregister();
    expect(getPaletteSources().map((s) => s.id)).not.toContain("source-test");
  });
});
