import { describe, expect, it } from "vitest";
import { isOverdue, parisDay } from "@/features/activities/overdue";
import { feedFilters } from "@/features/activities/schema";

describe("puces de filtre du fil (CRM-44, contrat 14)", () => {
  it("range les puces par rang déclaré, « Tout » en tête avec le total, et donne à chaque type le nombre d'entrées qu'il porte", () => {
    const items = [{ kind: "note" }, { kind: "note" }, { kind: "tache" }, { kind: "changement" }, { kind: "email" }];
    expect(feedFilters(items)).toEqual([
      { key: "tout", label: "Tout", count: 5 },
      { key: "note", label: "Notes", count: 2 },
      { key: "appel", label: "Appels", count: 0 },
      { key: "reunion", label: "Réunions", count: 0 },
      { key: "tache", label: "Tâches", count: 1 },
      { key: "changement", label: "Changements", count: 1 },
      { key: "email", label: "Emails", count: 1 },
    ]);
  });
});

describe("échéance d'une tâche (CRM-45, D13, contrat 12)", () => {
  it("tient une tâche pour échue à partir du lendemain 00:00 à Paris : l'échéance de la veille est échue, celle du jour ne l'est pas", () => {
    /* 7 septembre 2026, 10:00 à Paris. */
    const at = new Date("2026-09-07T08:00:00Z");
    expect(parisDay(at)).toBe("2026-09-07");
    expect(isOverdue("2026-09-06", at)).toBe(true);
    expect(isOverdue("2026-09-07", at)).toBe(false);
    expect(isOverdue("2026-09-08", at)).toBe(false);
    expect(isOverdue(null, at)).toBe(false);
  });

  it("bascule à minuit heure de Paris, pas à minuit UTC : à 23:30 à Paris l'échéance du jour tient encore, à 00:30 le lendemain elle est échue", () => {
    expect(isOverdue("2026-09-07", new Date("2026-09-07T21:30:00Z"))).toBe(false);
    expect(isOverdue("2026-09-07", new Date("2026-09-07T22:30:00Z"))).toBe(true);
  });
});
