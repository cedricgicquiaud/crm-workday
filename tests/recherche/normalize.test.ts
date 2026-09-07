import { describe, expect, it } from "vitest";
import { normalizeQuery } from "@/features/search/normalize";

describe("normalisation d'une saisie de recherche (CRM-38, D8)", () => {
  it("met en minuscules, retire les accents et réduit les espaces (bords et répétitions)", () => {
    expect(normalizeQuery("  ACMÉ   Sàs ")).toBe("acme sas");
    expect(normalizeQuery("Ça\tva")).toBe("ca va");
    expect(normalizeQuery("552 081 317")).toBe("552 081 317");
    expect(normalizeQuery("   ")).toBe("");
  });
});
