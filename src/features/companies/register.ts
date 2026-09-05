/**
 * Déclaration de l'entreprise auprès du registre d'objets (D4). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client.
 */
import { Building2Icon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { COMPANY_FIELDS } from "./schema";

registerObject({
  key: "company",
  order: 10,
  labels: { singular: "Entreprise", plural: "Entreprises", article: "une" },
  icon: Building2Icon,
  href: (id) => `/entreprises/${id}`,
  apiBase: "/api/entreprises",
  titleField: "name",
  fields: COMPANY_FIELDS,
  quickCreate: ["name", "type", "siren", "website", "ownerId"],
  /** aucune relation en 2.1a : la personne déclarera la sienne (contact → entreprise) en 2.2 */
  relations: [],
});
