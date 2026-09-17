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
  /** Montant estimé, clôture prévue, responsable ; les colonnes de la vue « Opportunités en cours » arrivent avec elle (D38). */
  listColumns: ["estimatedAmount", "expectedClose", "ownerId"],
  relations: [
    { to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Opportunités", prefill: "companyId" },
    { to: "person", fkColumn: "contactPersonId", label: "Contact", inverseLabel: "Opportunités" },
    /* Posé par la conversion d'un lead (4.2c), jamais saisi : la trace d'origine prime, même archivée (D51). */
    { to: "lead", fkColumn: "leadId", label: "Issu du lead", inverseLabel: "Opportunité", keepArchived: true },
  ],
});
