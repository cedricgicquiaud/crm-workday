import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyViewParams, listStateToParams, listUrl, parseListState, readViewId } from "@/features/lists/url-state";
import { defaultView, listStateWithView } from "@/features/views/views";
import { closeDb } from "@/lib/db";
import { registerTestObject, TEST_RECENT_LIST, TEST_TYPE } from "../listes/objet-de-test";

beforeAll(registerTestObject);
afterAll(closeDb);

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

/**
 * D10, D21 : une vue par défaut peut porter des puces et un tri (« Leads en cours »). L'adresse nue
 * l'ouvre ; retirer toutes ses puces montre toutes les fiches, et l'adresse le dit par un marqueur,
 * sans quoi elle redeviendrait l'adresse nue et les puces reviendraient.
 */
describe("vue par défaut déclarée avec filtres et tri (CRM-92, D10)", () => {
  const WITHOUT_ALERT = { field: "kind", operator: "n_est_pas", value: "zzz" };

  it("s'ouvre filtrée et triée à l'adresse nue, et s'écrit sans paramètre", async () => {
    expect(defaultView(TEST_RECENT_LIST)).toMatchObject({ id: "default", name: "Fiches récentes", query: "f=kind:n_est_pas:zzz&tri=createdAt:desc" });
    const bare = await listStateWithView(TEST_RECENT_LIST, new URLSearchParams());
    expect(bare.view).toBe(null);
    expect(bare.filters).toEqual([WITHOUT_ALERT]);
    expect(bare.sort).toEqual({ field: "createdAt", direction: "desc" });
    expect(listUrl(TEST_RECENT_LIST, bare)).toBe("/fiches-recentes");
  });

  it("montre toutes les fiches quand on retire ses puces, et l'adresse le garde au rechargement", async () => {
    const bare = await listStateWithView(TEST_RECENT_LIST, new URLSearchParams());
    const url = listUrl(TEST_RECENT_LIST, { ...bare, filters: [] });
    expect(url).toBe("/fiches-recentes?filtres=aucun");
    const reloaded = await listStateWithView(TEST_RECENT_LIST, new URLSearchParams(url.split("?")[1]));
    expect(reloaded.filters).toEqual([]);
    expect(reloaded.inactive).toEqual([]);
    expect(reloaded.sort).toEqual({ field: "createdAt", direction: "desc" });
  });

  it("garde une puce ajoutée et un autre tri dans l'adresse, et les relit à l'identique", async () => {
    const bare = await listStateWithView(TEST_RECENT_LIST, new URLSearchParams());
    const refined = { ...bare, filters: [...bare.filters, { field: "city", operator: "contient" as const, value: "Paris" }], sort: { field: "updatedAt", direction: "desc" as const } };
    const url = listUrl(TEST_RECENT_LIST, refined);
    expect(await listStateWithView(TEST_RECENT_LIST, new URLSearchParams(url.split("?")[1]))).toEqual(refined);
  });

  it("laisse la vue par défaut d'une liste qui ne déclare rien sans puce ni tri", async () => {
    expect(defaultView(TEST_TYPE).query).toBe("");
    const bare = await listStateWithView(TEST_TYPE, new URLSearchParams());
    expect(bare.filters).toEqual([]);
    expect(listUrl(TEST_TYPE, { ...bare, filters: [] })).toBe("/fiches-de-test");
  });
});
