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

describe("ordre des résultats (CRM-37)", () => {
  it("range les résultats par « order » de source croissant (sans rang en dernier), puis dans l'ordre rendu par chaque source, quel que soit l'ordre d'enregistrement ou de réponse", async () => {
    const hit = (id: string, label: string): PaletteResult => ({ id, label, href: `/x/${id}` });
    const slow = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 20));
    const unregisters = [
      registerPaletteSource({ id: "ordre-sans", search: async () => [hit("sans:1", "Sans rang")] }),
      registerPaletteSource({ id: "ordre-20", order: 20, search: async () => [hit("b:1", "B un"), hit("b:2", "B deux")] }),
      registerPaletteSource({ id: "ordre-10", order: 10, search: () => slow([hit("a:2", "A deux"), hit("a:1", "A un")]) }),
    ];
    const labels = (await searchPaletteSources("abc")).map((r) => r.label);
    for (const unregister of unregisters) unregister();
    expect(labels).toEqual(["A deux", "A un", "B un", "B deux", "Sans rang"]);
  });
});
