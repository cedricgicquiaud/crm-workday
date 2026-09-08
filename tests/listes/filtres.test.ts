import { beforeAll, describe, expect, it } from "vitest";
import { readFilters } from "@/features/lists/filters";
import { registerTestObject, TEST_TYPE } from "./objet-de-test";

beforeAll(registerTestObject);

/**
 * Lecture des filtres d'une URL contre les champs déclarés (D16, D18). Un filtre qu'on ne saurait
 * pas appliquer n'est jamais une erreur d'écran : il est écarté et signalé « filtre inactif ».
 */
describe("lecture des filtres d'une liste (CRM-47, D16, D18)", () => {
  it("garde les filtres applicables et écarte les autres avec un avertissement « filtre inactif »", () => {
    const { filters, inactive } = readFilters(TEST_TYPE, [
      { field: "kind", operator: "est", value: "client" },
      { field: "city", operator: "contient", value: "Paris" },
      { field: "amount", operator: "est_vide", value: "" },
      { field: "inconnu", operator: "est", value: "x" },
      { field: "kind", operator: "contient", value: "cli" },
      { field: "city", operator: "contient", value: "  " },
    ]);

    expect(filters).toEqual([
      { field: "kind", operator: "est", value: "client" },
      { field: "city", operator: "contient", value: "Paris" },
      { field: "amount", operator: "est_vide", value: "" },
    ]);
    expect(inactive.map((entry) => entry.message)).toEqual([
      "Filtre inactif : « inconnu » n'est pas un champ de cette liste.",
      "Filtre inactif : « contient » ne s'applique pas au champ « Genre ».",
      "Filtre inactif : « Ville contient » attend une valeur.",
    ]);
  });
});
