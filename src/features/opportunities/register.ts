/**
 * Déclaration de l'opportunité auprès du registre d'objets (D31, D54). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client.
 */
import { HandshakeIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { OPPORTUNITY_FIELDS } from "./schema";

registerObject({
  key: "opportunity",
  order: 50,
  labels: { singular: "Opportunité", plural: "Opportunités", article: "une" },
  icon: HandshakeIcon,
  href: (id) => `/opportunites/${id}`,
  listHref: "/opportunites",
  apiBase: "/api/opportunites",
  titleField: "title",
  fields: OPPORTUNITY_FIELDS,
  relations: [],
});
