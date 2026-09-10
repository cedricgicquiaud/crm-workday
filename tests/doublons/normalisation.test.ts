import { describe, expect, it } from "vitest";
import { normalizeCompanyName, normalizeName } from "@/features/duplicates/normalize";

/**
 * Normalisation des noms rapprochés (D19, contrat 28). Deux fiches sont des doublons probables
 * quand leurs noms se réduisent à la même forme : ni la casse, ni les accents, ni la ponctuation,
 * ni la forme juridique ne distinguent deux fiches de la même entreprise.
 */
describe("normalisation d'une raison sociale (CRM-58, D19)", () => {
  it("réduit à la même forme la casse, les accents, la ponctuation et les espaces", () => {
    expect(normalizeCompanyName("  ACME   Conseil ")).toBe("acme conseil");
    expect(normalizeCompanyName("Acmé Conseil")).toBe("acme conseil");
    expect(normalizeCompanyName("Acme-Conseil")).toBe("acme conseil");
    expect(normalizeCompanyName("L'Oréal")).toBe("loreal");
  });

  it("retire les formes juridiques de la liste fermée et les mots « société » et « groupe »", () => {
    expect(normalizeCompanyName("ACME SAS")).toBe("acme");
    expect(normalizeCompanyName("ACME SASU")).toBe("acme");
    expect(normalizeCompanyName("Société Acme")).toBe("acme");
    expect(normalizeCompanyName("Groupe Acme")).toBe("acme");
    expect(normalizeCompanyName("Acme S.A.S.")).toBe("acme");
    for (const forme of ["SA", "SARL", "EURL", "SNC", "SCI", "SEL", "SCOP", "GmbH", "Ltd", "Inc", "BV"]) {
      expect(normalizeCompanyName(`Acme ${forme}`)).toBe("acme");
    }
  });

  it("distingue « Acmé Conseil » d'« Acme » : le retrait ne va jamais jusqu'à confondre deux noms différents", () => {
    expect(normalizeCompanyName("Acmé Conseil")).not.toBe(normalizeCompanyName("ACME SAS"));
    /* Une forme juridique collée à un mot n'en est pas une : « Sanofi » commence par « SA ». */
    expect(normalizeCompanyName("Sanofi")).toBe("sanofi");
  });

  it("garde le nom entier quand il n'est fait que de mots retirés : sans lui, deux fiches sans nom se ressembleraient", () => {
    expect(normalizeCompanyName("Groupe")).toBe("groupe");
    expect(normalizeCompanyName("SAS")).toBe("sas");
    expect(normalizeCompanyName("   ")).toBe("");
  });
});

describe("normalisation d'un nom de personne (CRM-58, D19)", () => {
  it("réduit la casse, les accents, la ponctuation et les espaces, sans retirer aucun mot", () => {
    expect(normalizeName("Jean-Pierre  Léger")).toBe("jean pierre leger");
    expect(normalizeName("jean pierre leger")).toBe("jean pierre leger");
    /* Un patronyme n'est pas une raison sociale : « Sacha Inc » garde son second mot. */
    expect(normalizeName("Sacha Inc")).toBe("sacha inc");
  });
});
