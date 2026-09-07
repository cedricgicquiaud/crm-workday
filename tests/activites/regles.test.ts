import { describe, expect, it } from "vitest";
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
