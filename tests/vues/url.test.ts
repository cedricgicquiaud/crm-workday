import { beforeAll, describe, expect, it } from "vitest";
import { applyViewParams, listStateToParams, listUrl, parseListState, readViewId } from "@/features/lists/url-state";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

beforeAll(registerTestObject);

/** État rangé dans la vue « Clients parisiens » : deux familles de paramètres sur trois. */
const VIEW_QUERY = "f=kind:est:client&tri=name:asc&colonnes=city";

/**
 * L'URL d'une liste porte sa vue et ses filtres (D18) : on la partage, on l'ouvre au même état.
 * La vue donne l'état de départ ; ce que l'adresse porte elle-même l'emporte, famille par famille.
 */
describe("la vue courante voyage dans l'URL de la liste (CRM-53, contrat 24)", () => {
  it("ouvre la liste dans l'état de la vue, laisse l'adresse l'emporter famille par famille, et ignore une vue disparue", () => {
    expect(readViewId(new URLSearchParams("vue=abc"))).toBe("abc");
    /* La vue par défaut est l'absence de vue : elle ne s'écrit pas dans l'adresse. */
    expect(readViewId(new URLSearchParams("vue=default"))).toBe(null);
    expect(readViewId(new URLSearchParams())).toBe(null);

    const opened = parseListState(TEST_TYPE, applyViewParams(VIEW_QUERY, new URLSearchParams("vue=abc")));
    expect(opened.view).toBe("abc");
    expect(opened.filters).toEqual([{ field: "kind", operator: "est", value: "client" }]);
    expect(opened.sort).toEqual({ field: "name", direction: "asc" });
    expect(opened.columns).toEqual(["city"]);

    /* Un filtre posé sur une vue ouverte remplace les siens ; le tri et les colonnes de la vue restent. */
    const refined = parseListState(TEST_TYPE, applyViewParams(VIEW_QUERY, new URLSearchParams("vue=abc&f=city:contient:Lyon")));
    expect(refined.filters).toEqual([{ field: "city", operator: "contient", value: "Lyon" }]);
    expect(refined.sort).toEqual({ field: "name", direction: "asc" });
    expect(refined.columns).toEqual(["city"]);

    /* L'adresse écrite porte la vue et l'état affiché : relue avec la même vue, elle rend le même état. */
    expect(listUrl(TEST_TYPE, refined)).toBe("/fiches-de-test?vue=abc&f=city%3Acontient%3ALyon&tri=name%3Aasc&colonnes=city");
    expect(parseListState(TEST_TYPE, applyViewParams(VIEW_QUERY, listStateToParams(TEST_TYPE, refined)))).toEqual(refined);

    /* Une vue supprimée par un collègue rend la liste par défaut, jamais une erreur (contrat 24). */
    const gone = parseListState(TEST_TYPE, applyViewParams(null, new URLSearchParams("vue=disparue&tri=name:asc")));
    expect(gone.view).toBe(null);
    expect(gone.filters).toEqual([]);
    expect(gone.sort).toEqual({ field: "name", direction: "asc" });
    expect(gone.columns).toEqual(["kind", "city", "updatedAt"]);
  });
});
