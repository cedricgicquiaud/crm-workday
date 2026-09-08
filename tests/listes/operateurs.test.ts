import { describe, expect, it } from "vitest";
import { operatorsFor, findOperator, isOperatorAllowed } from "@/features/lists/operators";

/**
 * Source unique des opérateurs de filtre par type de champ (D16). L'écran, l'URL et le filtrage
 * la lisent : un opérateur proposé par la puce est toujours un opérateur que le filtrage applique.
 */
describe("opérateurs de filtre par type de champ (CRM-47, D16)", () => {
  it("propose les opérateurs de D16 pour chaque type, dans un ordre qui ne dépend pas des imports", () => {
    expect(operatorsFor("text").map((operator) => operator.key)).toEqual(["contient", "ne_contient_pas", "est", "est_vide"]);
    expect(operatorsFor("list").map((operator) => operator.key)).toEqual(["est", "n_est_pas", "est_vide"]);
    expect(operatorsFor("user").map((operator) => operator.key)).toEqual(["est", "n_est_pas", "est_vide"]);
    expect(operatorsFor("date").map((operator) => operator.key)).toEqual(["avant", "apres", "est_vide"]);
    expect(operatorsFor("number").map((operator) => operator.key)).toEqual(["egal", "plus_grand", "plus_petit", "est_vide"]);
  });

  it("nomme chaque opérateur en français et dit lequel se passe de valeur", () => {
    expect(operatorsFor("text").map((operator) => operator.label)).toEqual(["contient", "ne contient pas", "est", "est vide"]);
    expect(findOperator("est_vide")?.needsValue).toBe(false);
    expect(findOperator("contient")?.needsValue).toBe(true);
    expect(findOperator("nawak")).toBeUndefined();
  });

  it("refuse un opérateur qui ne s'applique pas au type du champ", () => {
    expect(isOperatorAllowed("text", "contient")).toBe(true);
    expect(isOperatorAllowed("list", "contient")).toBe(false);
    expect(isOperatorAllowed("date", "egal")).toBe(false);
    expect(isOperatorAllowed("number", "nawak")).toBe(false);
  });
});
