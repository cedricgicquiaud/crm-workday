import { beforeAll, describe, expect, it } from "vitest";
import { applyFilters } from "@/features/lists/apply-filters";
import type { ObjectRecord } from "@/features/objects/service";
import { registerTestObject, TEST_TYPE } from "./objet-de-test";

beforeAll(registerTestObject);

const record = (values: Record<string, unknown>): ObjectRecord =>
  ({ id: String(values.name), createdAt: new Date(), updatedAt: new Date(), createdBy: "u1", ownerId: "u1", archivedAt: null, ...values }) as ObjectRecord;

const RECORDS = [
  record({ name: "Alpha", kind: "client", city: "Paris", signedOn: "2026-01-10", amount: 100 }),
  record({ name: "Bravo", kind: "prospect", city: "PARIS 15e", signedOn: "2026-06-01", amount: 250 }),
  record({ name: "Charlie", kind: "client", city: "Pariş-Orly", signedOn: null, amount: null }),
  record({ name: "Delta", kind: "client", city: null, signedOn: "2026-03-02", amount: 250 }),
];

const names = (records: readonly ObjectRecord[]) => records.map((entry) => entry.name);

/** Sous 500 lignes il n'y a pas de pagination (D6) : on lit puis on filtre en mémoire. */
describe("filtrage d'une liste sur les champs texte (CRM-47, D16)", () => {
  it("combine les filtres en « et » et compare le texte sans tenir compte de la casse ni des accents", () => {
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "city", operator: "contient", value: "paris" }]))).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "city", operator: "ne_contient_pas", value: "paris" }]))).toEqual(["Delta"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "city", operator: "est", value: "paris" }]))).toEqual(["Alpha"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "city", operator: "est_vide", value: "" }]))).toEqual(["Delta"]);

    expect(
      names(
        applyFilters(TEST_TYPE, RECORDS, [
          { field: "city", operator: "contient", value: "paris" },
          { field: "name", operator: "contient", value: "a" },
        ]),
      ),
    ).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(
      names(
        applyFilters(TEST_TYPE, RECORDS, [
          { field: "city", operator: "contient", value: "paris" },
          { field: "name", operator: "est", value: "alpha" },
        ]),
      ),
    ).toEqual(["Alpha"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, []))).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });
});

describe("filtrage d'une liste sur les autres types de champ (CRM-47, D16)", () => {
  it("applique les opérateurs de liste, de date et de nombre", () => {
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "kind", operator: "est", value: "client" }]))).toEqual(["Alpha", "Charlie", "Delta"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "kind", operator: "n_est_pas", value: "client" }]))).toEqual(["Bravo"]);

    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "signedOn", operator: "avant", value: "2026-03-02" }]))).toEqual(["Alpha"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "signedOn", operator: "apres", value: "2026-03-02" }]))).toEqual(["Bravo"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "signedOn", operator: "est_vide", value: "" }]))).toEqual(["Charlie"]);

    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "amount", operator: "egal", value: "250" }]))).toEqual(["Bravo", "Delta"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "amount", operator: "plus_grand", value: "100" }]))).toEqual(["Bravo", "Delta"]);
    expect(names(applyFilters(TEST_TYPE, RECORDS, [{ field: "amount", operator: "plus_petit", value: "250" }]))).toEqual(["Alpha"]);
  });
});
