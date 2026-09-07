import { describe, expect, it } from "vitest";
import { getPaletteSources, registerPaletteSource, searchPaletteSources, type PaletteResult } from "@/features/shell/palette/registry";

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

describe("seuil de trois caractères (CRM-37, D8)", () => {
  it("n'appelle aucune source sous trois caractères et rend une liste vide ; à trois caractères, la source est appelée avec la saisie", async () => {
    const calls: string[] = [];
    const unregister = registerPaletteSource({
      id: "source-seuil",
      search: async (query) => {
        calls.push(query);
        return [{ id: "seuil:1", label: "Trouvé", href: "/x/1" }];
      },
    });
    expect(await searchPaletteSources("")).toEqual([]);
    expect(await searchPaletteSources("ac")).toEqual([]);
    expect(await searchPaletteSources("  ac ")).toEqual([]);
    expect(calls).toEqual([]);

    const results = await searchPaletteSources("acm");
    expect(calls).toEqual(["acm"]);
    expect(results.map((r) => r.label)).toEqual(["Trouvé"]);
    unregister();
  });
});
