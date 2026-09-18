/**
 * Déclaration de l'opportunité auprès du registre d'objets (D31, D54). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client.
 */
import { HandshakeIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { LOST_STAGE, OPPORTUNITY_FIELDS, WON_STAGE } from "./schema";

/** Action d'historique d'un ajout de consultant (D46) : le nom du consultant est dans `newValue`. */
export const PROPOSAL_ADDED_ACTION = "proposition_ajoutee";

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
  /** D38 : Titre, puis Entreprise, Étape, Probabilité, Montant estimé, Clôture prévue et Responsable ; le reste se choisit au menu des colonnes. */
  listColumns: ["companyId", "stage", "probability", "estimatedAmount", "expectedClose", "ownerId"],
  /** D38 : « Opportunités en cours » — ni gagnée ni perdue, de la clôture prévue la plus proche à la plus lointaine ; ses puces se retirent. */
  defaultView: { name: "Opportunités en cours", query: `f=stage:n_est_pas:${WON_STAGE}&f=stage:n_est_pas:${LOST_STAGE}&tri=expectedClose:asc` },
  /** D37 : deux opportunités de même titre sont deux affaires — l'API de fusion répond 405 et le menu ne propose pas « Fusionner… ». */
  mergeable: false,
  /* D46 : les gestes sur les propositions s'écrivent sur l'historique de l'opportunité seulement. */
  historyActions: { [PROPOSAL_ADDED_ACTION]: (entry) => `Consultant proposé : ${entry.newValue ?? ""}` },
  relations: [
    { to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Opportunités", prefill: "companyId" },
    { to: "person", fkColumn: "contactPersonId", label: "Contact", inverseLabel: "Opportunités" },
    /* Posé par la conversion d'un lead (4.2c), jamais saisi : la trace d'origine prime, même archivée (D51). */
    { to: "lead", fkColumn: "leadId", label: "Issu du lead", inverseLabel: "Opportunité", keepArchived: true },
  ],
});
