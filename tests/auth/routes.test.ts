import { describe, expect, it } from "vitest";
import { safeNext } from "@/features/auth/routes";

const ORIGIN = "http://localhost:3000";

describe("safeNext : la page suivie après connexion reste sur le site (contrat 19)", () => {
  it("suit une page interne demandée avant la redirection", () => {
    expect(safeNext("/parametres/journal", ORIGIN)).toBe("/parametres/journal");
    expect(safeNext("/accueil?onglet=missions", ORIGIN)).toBe("/accueil?onglet=missions");
  });

  it("revient à l'Accueil sans page demandée", () => {
    expect(safeNext(undefined, ORIGIN)).toBe("/accueil");
    expect(safeNext("", ORIGIN)).toBe("/accueil");
  });

  it("refuse toute adresse qui résout hors du site", () => {
    for (const next of ["//evil.com", "/\\evil.com", "\\evil.com", "/\\/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/accueil\\..\\x"]) {
      expect(safeNext(next, ORIGIN), next).toBe("/accueil");
    }
  });
});
