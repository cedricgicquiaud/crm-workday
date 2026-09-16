/**
 * Déclaration du lead auprès du registre d'objets (D2, D21). Importé par le manifeste ; ce fichier
 * est la seule description de l'objet côté client. Un lead n'est relié à aucune fiche avant sa
 * conversion (4.1b) : il ne déclare encore aucune relation.
 */
import { TargetIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { LEAD_FIELDS } from "./schema";

registerObject({
  key: "lead",
  order: 40,
  labels: { singular: "Lead", plural: "Leads", article: "un" },
  icon: TargetIcon,
  href: (id) => `/leads/${id}`,
  listHref: "/leads",
  apiBase: "/api/leads",
  titleField: "title",
  fields: LEAD_FIELDS,
  /** D11 : cinq champs ; score, besoin, poste, téléphone et LinkedIn se règlent sur la fiche. */
  quickCreate: ["firstName", "lastName", "companyName", "email", "origin"],
  /** « Avancement : Écarté » en badge de tête : il se lit à côté de « Rouvrir » sans descendre dans les champs (D7). */
  headerFields: ["stage"],
  relations: [],
});
