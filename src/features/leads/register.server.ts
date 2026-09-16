/**
 * Part serveur de la déclaration du lead : sa table Drizzle, sa recherche et sa clé de doublon.
 * Importé par le manifeste serveur.
 */
import { lead } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";

registerServerObject({
  key: "lead",
  table: lead,
  search: async () => [],
  /* Pas de « doublon probable » sur les leads (D8) : deux leads homonymes sont deux pistes. */
  duplicateKey: () => null,
});
