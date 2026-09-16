/**
 * Déclaration du lead auprès du registre d'objets (D2, D21). Importé par le manifeste ; ce fichier
 * est la seule description de l'objet côté client. Un lead n'est relié à aucune fiche avant sa
 * conversion (4.1b) : il ne déclare encore aucune relation.
 */
import { TargetIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { CONVERSION_ACTION, CONVERTED_RULE, CONVERTED_STAGE, LEAD_FIELDS } from "./schema";

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
  /** D10 : Titre, puis Avancement, Origine, Score, Responsable, Créé le ; « Modifiée le » ne s'ajoute pas, « Créé le » étant cité. */
  listColumns: ["stage", "origin", "score", "ownerId", "createdAt"],
  /** D10 : « Leads en cours » — ni converti ni écarté, du plus récemment créé au plus ancien ; ses puces se retirent. */
  defaultView: { name: "Leads en cours", query: "f=stage:n_est_pas:converti&f=stage:n_est_pas:ecarte&tri=createdAt:desc" },
  /** D9 : pas de fusion de leads — l'API répond 405 et le menu ne propose pas « Fusionner… ». */
  mergeable: false,
  /** D21 : la conversion lie le lead à sa personne et à son entreprise ; elles le montrent « Issu du lead », même archivé (D18). */
  relations: [
    { to: "person", fkColumn: "convertedPersonId", label: "Personne", inverseLabel: "Issu du lead", keepArchived: true },
    { to: "company", fkColumn: "convertedCompanyId", label: "Entreprise", inverseLabel: "Issu du lead", keepArchived: true },
  ],
  /** D18 : converti, le lead ne change plus — champs, champs personnalisés, avancement, responsable ; son fil reste vivant. */
  frozen: { test: (record) => record.stage === CONVERTED_STAGE, message: CONVERTED_RULE },
  /** D16 : « Converti en Julie Martin · Banque X ». */
  historyActions: { [CONVERSION_ACTION]: (entry) => `Converti en ${entry.newValue ?? ""}` },
});
