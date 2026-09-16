/**
 * Déclaration de la personne auprès du registre d'objets (D4). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client. La relation contact → entreprise est
 * déclarée ici : la colonne des liens d'une entreprise en lit l'inverse (« Contacts »).
 */
import { BriefcaseBusinessIcon, UsersIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { CONSULTANTS_LIST, CONSULTANT_PROFILE_HISTORY_FIELDS } from "@/features/consultants/schema";
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
  /** « Profils : Contact » en badge de tête : la casquette de la personne se lit avant ses champs (D8). */
  headerFields: ["profiles"],
  /** Entreprise et rôle s'éditent dans « Profil contact » : l'historique de la personne les nomme quand même. */
  historyFields: [...CONTACT_PROFILE_HISTORY_FIELDS, ...CONSULTANT_PROFILE_HISTORY_FIELDS],
  /** D7 : cinq champs ; `companyId` est le `prefill` de la relation, rendu par le dialogue comme un sélecteur ; le rôle se règle sur la fiche. */
  quickCreate: ["firstName", "lastName", "email", "companyId", "jobTitle"],
  /** colonnes minimales ; l'entreprise attend une colonne de relation (2.5a) */
  listColumns: ["profiles", "ownerId"],
  relations: [
    { to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Contacts", prefill: "companyId" },
    /* La société de facturation est une entreprise liée (D4) : sa fiche liste ses consultants, et la fusion comme la suppression suivent la relation d'elles-mêmes. Aucun `prefill` : on n'ajoute pas un consultant depuis une entreprise. */
    { to: "company", fkColumn: "billingCompanyId", label: "Société de facturation", inverseLabel: "Consultants facturés" },
  ],
  feedParent: "company",
  /**
   * « Consultants » (D10) : les personnes qui portent un profil consultant, sous leur propre entrée de
   * barre latérale, avec leurs colonnes, leur vue par défaut et leur création. Le filtre de base est
   * appliqué côté serveur et ne se retire pas par l'URL. « État », dérivé, se lit entre le coût et le
   * responsable (D6).
   */
  lists: [
    {
      key: CONSULTANTS_LIST,
      label: "Consultants",
      singular: "Consultant",
      icon: BriefcaseBusinessIcon,
      href: "/consultants",
      order: 30,
      baseFilters: [{ field: "profiles", operator: "contient", value: "consultant" }],
      columns: ["status", "modules", "dailyCost", "state", "ownerId"],
      defaultViewName: "Tous les consultants",
      /* Cinq champs, et une API à elle : elle crée la personne et son profil d'un seul geste (D12). */
      create: { apiBase: "/api/consultants", fields: ["firstName", "lastName", "email", "status", "dailyCost"], label: "Nouveau consultant" },
    },
  ],
});
