import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SORT } from "@/features/lists/sort";
import { listStateToParams, parseListState } from "@/features/lists/url-state";
import { registerTestObject, TEST_TYPE } from "./objet-de-test";

beforeAll(registerTestObject);

/**
 * L'URL porte l'état de la liste (D18) : on la partage, on l'ouvre au même état dans un autre
 * onglet. Une URL nue rend la liste par défaut, sans paramètre à écrire.
 */
describe("état d'une liste dans son URL (CRM-47, CRM-48, D18)", () => {
  it("relit filtres, tri, colonnes et bascule « archivées » depuis l'URL, et les réécrit à l'identique", () => {
    const state = parseListState(TEST_TYPE, new URLSearchParams("f=kind:est:client&f=city:contient:Paris&tri=name:asc&colonnes=city,kind&archivees=1"));

    expect(state.filters).toEqual([
      { field: "kind", operator: "est", value: "client" },
      { field: "city", operator: "contient", value: "Paris" },
    ]);
    expect(state.sort).toEqual({ field: "name", direction: "asc" });
    expect(state.columns).toEqual(["city", "kind"]);
    expect(state.includeArchived).toBe(true);
    expect(state.inactive).toEqual([]);

    /* Aller-retour : ce que l'écran écrit dans l'URL se relit tel quel (contrat 23). */
    expect(parseListState(TEST_TYPE, listStateToParams(TEST_TYPE, state))).toEqual(state);

    /* Une URL nue rend la liste par défaut et ne s'écrit avec aucun paramètre. */
    const bare = parseListState(TEST_TYPE, new URLSearchParams());
    expect(bare.filters).toEqual([]);
    expect(bare.inactive).toEqual([]);
    expect(bare.sort).toEqual(DEFAULT_SORT);
    /* Les colonnes visibles par défaut restent celles du registre. */
    expect(bare.columns).toEqual(["kind", "city"]);
    expect(bare.includeArchived).toBe(false);
    expect(listStateToParams(TEST_TYPE, bare).toString()).toBe("");
  });

  it("ouvre une URL bricolée sans erreur : tri impossible ramené au défaut, colonne inconnue ignorée, première colonne jamais masquée, filtre signalé inactif", () => {
    const state = parseListState(TEST_TYPE, new URLSearchParams("tri=amount:asc&colonnes=name,inconnue,city,city&f=inconnu:est:x&f=signedOn:avant:2026-01-01"));

    /* « Montant » n'est pas déclaré triable : la liste retombe sur son tri par défaut. */
    expect(state.sort).toEqual(DEFAULT_SORT);
    /* La colonne titre ne se masque pas : elle n'est jamais dans la liste des colonnes suivantes ; une colonne inconnue ou répétée disparaît. */
    expect(state.columns).toEqual(["city"]);
    expect(state.filters).toEqual([{ field: "signedOn", operator: "avant", value: "2026-01-01" }]);
    expect(state.inactive.map((entry) => entry.message)).toEqual(["Filtre inactif : « inconnu » n'est pas un champ de cette liste."]);
  });
});
