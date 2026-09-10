import { describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { getServerObject } from "@/features/objects/registry.server";

/**
 * La clé de rapprochement d'un objet (D19, D4) : le raffinement de la règle vit dans la déclaration
 * de l'objet, jamais dans les mécanismes. Le registre serveur est le seul point d'entrée.
 */
const keyOf = (type: string, record: Record<string, unknown>) => getServerObject(type).duplicateKey(record);

describe("clé de doublon d'une entreprise (CRM-58, contrat 28)", () => {
  it("rapproche « ACME SAS », « ACME SASU », « Société Acme » et « Acme », et laisse « Acmé Conseil » à part", () => {
    const acme = keyOf("company", { name: "Acme" });
    expect(acme).toBe("acme");
    for (const name of ["ACME SAS", "ACME SASU", "Société Acme", "  acme  "]) expect(keyOf("company", { name })).toBe(acme);
    expect(keyOf("company", { name: "Acmé Conseil" })).not.toBe(acme);
  });

  it("n'a pas de clé quand la raison sociale est absente : une fiche sans nom ne ressemble à personne", () => {
    expect(keyOf("company", {})).toBeNull();
    expect(keyOf("company", { name: "   " })).toBeNull();
  });
});

describe("clé de doublon d'une personne (CRM-58, contrat 28)", () => {
  it("rapproche deux personnes de même prénom et nom malgré les accents, la casse et la ponctuation", () => {
    const reference = keyOf("person", { firstName: "Jean-Pierre", lastName: "Léger" });
    expect(reference).toBe("jean pierre leger");
    expect(keyOf("person", { firstName: "jean pierre", lastName: "leger" })).toBe(reference);
    expect(keyOf("person", { firstName: "Jean", lastName: "Léger" })).not.toBe(reference);
  });

  it("n'a pas de clé quand le prénom et le nom sont absents", () => {
    expect(keyOf("person", {})).toBeNull();
  });
});
