import { afterAll, describe, expect, it } from "vitest";
import { parisDay } from "@/features/activities/overdue";
import { closeDb } from "@/lib/db";
import { consultantState, stateLabel, stateSortKey } from "@/features/consultants/state";

/* `parisDay` vit à côté de la règle d'échéance, qui interroge la base : son module ouvre la connexion. */
afterAll(closeDb);

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

  /* Contrat 12 : le 4 octobre 2026 à 23:30 heure de Paris (CEST, UTC+2) est 21:30 UTC ; minuit le 5 est 22:00 UTC. */
  it("bascule de « en mission » à « disponible » à minuit heure de Paris, pas à minuit UTC", () => {
    const tomorrow = { unavailable: "non", availableFrom: "2026-10-05" };
    expect(consultantState(tomorrow, parisDay(new Date("2026-10-04T21:30:00Z")))).toBe("en_mission");
    expect(consultantState(tomorrow, parisDay(new Date("2026-10-04T22:00:00Z")))).toBe("disponible");
  });
});

/** D6, contrats 11 et 13 : l'état se lit avec sa date, et un salarié disponible porte « à replacer » — un freelance non, un salarié en mission non plus. */
describe("libellé de l'état et mention « à replacer » (CRM-85, D6)", () => {
  it("écrit la date de retour d'un consultant en mission en format court", () => {
    expect(stateLabel({ state: "en_mission", availableFrom: "2026-10-05", status: "freelance" })).toBe("En mission · disponible le 5 oct. 2026");
    expect(stateLabel({ state: "indisponible", availableFrom: "2026-10-05", status: "freelance" })).toBe("Indisponible");
  });

  it("ajoute « à replacer » à un salarié disponible seulement", () => {
    expect(stateLabel({ state: "disponible", availableFrom: null, status: "salarie" })).toBe("Disponible · à replacer");
    expect(stateLabel({ state: "disponible", availableFrom: "2026-09-01", status: "freelance" })).toBe("Disponible");
    expect(stateLabel({ state: "en_mission", availableFrom: "2026-10-05", status: "salarie" })).toBe("En mission · disponible le 5 oct. 2026");
  });

  /* Contrat 16, D10 : une personne sans profil consultant n'a pas d'état ; sa cellule s'écrit comme toute cellule vide. */
  it("une fiche sans état s'écrit “—”", () => {
    expect(stateLabel({ state: null, availableFrom: null, status: null })).toBe("—");
  });
});

/** D6, contrat 14 : le tri sur l'état suit un rang, jamais l'alphabet des libellés (qui mettrait « Disponible » avant « Disponible · à replacer »). */
describe("rang de tri de l'état (CRM-86, D6)", () => {
  it("range à replacer, disponible, en mission par date de retour croissante, puis indisponible", () => {
    const records = [
      { name: "Iris", state: "indisponible", availableFrom: "2026-09-01", status: "salarie" },
      { name: "Marc", state: "en_mission", availableFrom: "2026-12-01", status: "freelance" },
      { name: "Dina", state: "disponible", availableFrom: null, status: "freelance" },
      { name: "Léo", state: "en_mission", availableFrom: "2026-10-05", status: "salarie" },
      { name: "Rémi", state: "disponible", availableFrom: null, status: "salarie" },
    ];
    const sorted = [...records].sort((a, b) => (stateSortKey(a) < stateSortKey(b) ? -1 : stateSortKey(a) > stateSortKey(b) ? 1 : 0));
    expect(sorted.map((record) => record.name)).toEqual(["Rémi", "Dina", "Léo", "Marc", "Iris"]);
  });
});
