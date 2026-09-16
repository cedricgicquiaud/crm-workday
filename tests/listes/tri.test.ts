import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SORT, isSortable, sortRecords } from "@/features/lists/sort";
import { parseListState } from "@/features/lists/url-state";
import type { ObjectRecord } from "@/features/objects/service";
import { registerTestObject, TEST_TYPE } from "./objet-de-test";

beforeAll(registerTestObject);

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

const record = (name: string, updatedAt: Date, values: Record<string, unknown> = {}): ObjectRecord =>
  ({ id: name, name, createdAt: updatedAt, updatedAt, createdBy: "u1", ownerId: "u1", archivedAt: null, ...values }) as ObjectRecord;

const RECORDS = [record("Bravo", day("2026-09-03")), record("Élan", day("2026-09-01")), record("alpha", day("2026-09-02"))];

const names = (records: readonly ObjectRecord[]) => records.map((entry) => entry.name);

/** Tri par défaut : dernière modification décroissante (D6) ; une fiche modifiée remonte en tête. */
describe("tri d'une liste (CRM-48, D6)", () => {
  it("trie par dernière modification décroissante par défaut, et par un champ triable dans les deux sens", () => {
    expect(names(sortRecords(TEST_TYPE, RECORDS, DEFAULT_SORT))).toEqual(["Bravo", "alpha", "Élan"]);
    expect(names(sortRecords(TEST_TYPE, RECORDS, { field: "name", direction: "asc" }))).toEqual(["alpha", "Bravo", "Élan"]);
    expect(names(sortRecords(TEST_TYPE, RECORDS, { field: "name", direction: "desc" }))).toEqual(["Élan", "Bravo", "alpha"]);

    expect(isSortable(TEST_TYPE, "name")).toBe(true);
    /* Seul un champ déclaré `sortable` se trie : cliquer un autre en-tête ne propose rien. */
    expect(isSortable(TEST_TYPE, "amount")).toBe(false);
    expect(isSortable(TEST_TYPE, "inconnu")).toBe(false);
    expect(isSortable(TEST_TYPE, DEFAULT_SORT.field)).toBe(true);
  });

  it("trie un champ de liste et un champ responsable sur la valeur affichée, pas sur la clé enregistrée", () => {
    const users = [
      { id: "u1", name: "Zoé Alard" },
      { id: "u2", name: "Ana Bello" },
    ];
    const records = [record("Première", day("2026-09-02"), { kind: "zzz", ownerId: "u1" }), record("Seconde", day("2026-09-01"), { kind: "client", ownerId: "u2" })];

    /* « Alerte » avant « Client » alors que la clé « zzz » vient après « client ». */
    expect(names(sortRecords(TEST_TYPE, records, { field: "kind", direction: "asc" }, users))).toEqual(["Première", "Seconde"]);
    /* « Ana Bello » avant « Zoé Alard » alors que l'identifiant « u1 » vient avant « u2 ». */
    expect(names(sortRecords(TEST_TYPE, records, { field: "ownerId", direction: "asc" }, users))).toEqual(["Seconde", "Première"]);
  });
});

/** Un champ dérivé se trie sur le rang qu'il déclare (`sortKey`, D19), jamais sur l'alphabet de ses libellés (CRM-86). */
describe("tri d'une liste sur un champ dérivé (CRM-86, D19)", () => {
  const PHASES = [
    record("Close", day("2026-09-03"), { phase: "close" }),
    record("Sans phase", day("2026-09-02"), { phase: null }),
    record("Ouverte", day("2026-09-01"), { phase: "ouverte" }),
  ];

  it("trie sur la clé de rang déclarée, et laisse une fiche sans rang en dernier", () => {
    /* Sur le libellé, « Abeille » (close) passerait avant « Zèbre » (ouverte). */
    expect(names(sortRecords(TEST_TYPE, PHASES, { field: "phase", direction: "asc" }))).toEqual(["Ouverte", "Close", "Sans phase"]);
    expect(names(sortRecords(TEST_TYPE, PHASES, { field: "phase", direction: "desc" }))).toEqual(["Close", "Ouverte", "Sans phase"]);
  });

  it("ne trie pas sur un rang déclaré sans `sortable` : l'URL qui le demande retombe sur le tri par défaut", () => {
    expect(isSortable(TEST_TYPE, "phase")).toBe(true);
    expect(isSortable(TEST_TYPE, "rank")).toBe(false);
    expect(parseListState(TEST_TYPE, new URLSearchParams("tri=rank:asc")).sort).toEqual(DEFAULT_SORT);
  });
});

/** Un ensemble se trie sur ses libellés joints (D11) ; sans valeur, la fiche passe en dernier. */
describe("tri d'une liste sur un champ à plusieurs valeurs (CRM-80, D11)", () => {
  const SETS = [
    record("Alpha", day("2026-09-03"), { tags: ["vip"] }),
    record("Bravo", day("2026-09-02"), { tags: [] }),
    record("Charlie", day("2026-09-01"), { tags: ["zzz"] }),
  ];

  it("trie sur les libellés joints, pas sur les clés enregistrées, et laisse un ensemble vide en dernier", () => {
    expect(isSortable(TEST_TYPE, "tags")).toBe(true);
    /* « zzz » porte le libellé « Alerte » : trié sur la clé, Charlie serait dernier. */
    expect(names(sortRecords(TEST_TYPE, SETS, { field: "tags", direction: "asc" }))).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(names(sortRecords(TEST_TYPE, SETS, { field: "tags", direction: "desc" }))).toEqual(["Alpha", "Charlie", "Bravo"]);
  });
});
