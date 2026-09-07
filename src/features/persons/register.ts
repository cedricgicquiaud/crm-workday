/**
 * Déclaration de la personne auprès du registre d'objets (D4). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client. La relation contact → entreprise est
 * déclarée ici : la colonne des liens d'une entreprise en lit l'inverse (« Contacts »).
 */
import { UsersIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { CONTACT_PROFILE_HISTORY_FIELDS, PERSON_FIELDS } from "./schema";

registerObject({
  key: "person",
  order: 20,
  labels: { singular: "Personne", plural: "Personnes", article: "une" },
  icon: UsersIcon,
  href: (id) => `/personnes/${id}`,
  listHref: "/personnes",
  apiBase: "/api/personnes",
  titleField: "name",
  fields: PERSON_FIELDS,
  /** Entreprise et rôle s'éditent dans « Profil contact » : l'historique de la personne les nomme quand même. */
  historyFields: CONTACT_PROFILE_HISTORY_FIELDS,
  /** D7 : cinq champs ; `companyId` est le `prefill` de la relation, rendu par le dialogue comme un sélecteur ; le rôle se règle sur la fiche. */
  quickCreate: ["firstName", "lastName", "email", "companyId", "jobTitle"],
  /** colonnes minimales ; l'entreprise attend une colonne de relation (2.5a) */
  listColumns: ["profiles", "ownerId"],
  relations: [{ to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Contacts", prefill: "companyId" }],
  feedParent: "company",
});
