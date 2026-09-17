/**
 * Part serveur de la déclaration de l'opportunité : sa table Drizzle et l'ensemble de ses modules,
 * rangé dans sa table fille (D53). Importé par le manifeste serveur.
 */
import { opportunity, opportunityModule } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";

registerServerObject({
  key: "opportunity",
  table: opportunity,
  search: async () => [],
  duplicateKey: () => null,
  sets: [{ field: "modules", table: opportunityModule, fkColumn: "opportunityId", valueColumn: "module" }],
});
