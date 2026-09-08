import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SORT, isSortable, sortRecords } from "@/features/lists/sort";
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
