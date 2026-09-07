/**
 * Part serveur de la déclaration de la personne : sa table Drizzle, sa recherche et sa clé de
 * doublon. Importé par le manifeste serveur.
 */
import { person } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";

async function search(): Promise<never[]> {
  return [];
}

/** Prénom et nom en minuscules, espaces réduits (D19, 2.6a). */
function duplicateKey(record: Record<string, unknown>): string | null {
  const name = `${String(record.firstName ?? "")} ${String(record.lastName ?? "")}`.trim().toLowerCase().replace(/\s+/g, " ");
  return name || null;
}

registerServerObject({ key: "person", table: person, search, duplicateKey });
