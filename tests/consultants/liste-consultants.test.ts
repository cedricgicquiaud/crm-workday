import { describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { columnsOf } from "@/features/lists/columns";
import { parseListState } from "@/features/lists/url-state";
import { getObject } from "@/features/objects/registry";

const LIST = "consultants";

/** Libellés des colonnes d'un état de liste, la colonne titre en tête, comme l'en-tête du tableau les montre. */
function headers(query: string): string[] {
  const columns = columnsOf(LIST);
  const title = columns.find((column) => column.key === getObject("person").titleField)!;
  return [title.label, ...parseListState(LIST, new URLSearchParams(query)).columns.map((key) => columns.find((column) => column.key === key)!.label)];
}

/** Contrat 14 (D10) : ce que la liste « Consultants » montre sans rien régler. */
describe("colonnes par défaut de la liste « Consultants » (CRM-86, contrat 14)", () => {
  it("montre Nom, Statut, Modules, Coût journalier, État, Responsable et Modifiée le", () => {
    expect(headers("")).toEqual(["Nom complet", "Statut", "Modules", "Coût journalier", "État", "Responsable", "Modifiée le"]);
  });
});
