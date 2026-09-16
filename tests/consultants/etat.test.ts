import { describe, expect, it } from "vitest";
import { consultantState } from "@/features/consultants/state";

/**
 * D6 : l'état d'un consultant se déduit de deux champs saisis, jamais saisi lui-même. « Indisponible »
 * prime ; sinon « En mission » si la date de disponibilité est après aujourd'hui (jour civil Europe/Paris) ;
 * sinon « Disponible ». Le jour courant est un paramètre : la règle se teste sans horloge.
 */
describe("état dérivé d'un consultant (CRM-85, D6)", () => {
  it("rend « indisponible » quand la case est cochée, quelle que soit la date", () => {
    expect(consultantState({ unavailable: "oui", availableFrom: "2026-10-01" }, "2026-09-16")).toBe("indisponible");
    expect(consultantState({ unavailable: "oui", availableFrom: "2026-09-01" }, "2026-09-16")).toBe("indisponible");
    expect(consultantState({ unavailable: "oui", availableFrom: null }, "2026-09-16")).toBe("indisponible");
  });

  it("rend « en mission » pour une date après aujourd'hui, « disponible » pour une date vide, passée ou du jour", () => {
    expect(consultantState({ unavailable: "non", availableFrom: "2026-10-01" }, "2026-09-16")).toBe("en_mission");
    expect(consultantState({ unavailable: "non", availableFrom: "2026-09-15" }, "2026-09-16")).toBe("disponible");
    expect(consultantState({ unavailable: "non", availableFrom: "2026-09-16" }, "2026-09-16")).toBe("disponible");
    expect(consultantState({ unavailable: "non", availableFrom: null }, "2026-09-16")).toBe("disponible");
  });
});
