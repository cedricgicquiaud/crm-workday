/** Part serveur de la déclaration de l'entreprise : sa table Drizzle. Importé par le manifeste serveur. */
import { company } from "@/db/schema";
import { registerServerObject } from "@/features/objects/registry.server";

registerServerObject({ key: "company", table: company });
