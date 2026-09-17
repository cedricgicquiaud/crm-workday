/**
 * Déclaration de l'opportunité auprès du registre d'objets (D31, D54). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client.
 */
import { HandshakeIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { LOST_STAGE, OPPORTUNITY_FIELDS, WON_STAGE } from "./schema";

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
  /** D34 : les quatre champs de la création rapide ; tout le reste se règle sur la fiche. */
  quickCreate: ["title", "companyId", "modules", "expectedClose"],
  /** Montant estimé, clôture prévue, responsable ; les colonnes de la vue « Opportunités en cours » arrivent avec elle (D38). */
  listColumns: ["estimatedAmount", "expectedClose", "ownerId"],
  /** D38 : « Opportunités en cours » — ni gagnée ni perdue, de la clôture prévue la plus proche à la plus lointaine ; ses puces se retirent. */
  defaultView: { name: "Opportunités en cours", query: `f=stage:n_est_pas:${WON_STAGE}&f=stage:n_est_pas:${LOST_STAGE}&tri=expectedClose:asc` },
  relations: [
    { to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Opportunités", prefill: "companyId" },
    { to: "person", fkColumn: "contactPersonId", label: "Contact", inverseLabel: "Opportunités" },
    /* Posé par la conversion d'un lead (4.2c), jamais saisi : la trace d'origine prime, même archivée (D51). */
    { to: "lead", fkColumn: "leadId", label: "Issu du lead", inverseLabel: "Opportunité", keepArchived: true },
  ],
});
