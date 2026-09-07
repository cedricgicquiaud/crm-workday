/**
 * Déclaration de la personne auprès du registre d'objets (D4). Importé par le manifeste ; ce
 * fichier est la seule description de l'objet côté client. La relation contact → entreprise est
 * déclarée ici : la colonne des liens d'une entreprise en lit l'inverse (« Contacts »).
 */
import { UsersIcon } from "lucide-react";
import { registerObject } from "@/features/objects/registry";
import { PERSON_FIELDS } from "./schema";

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
  /** D7 prévoit aussi l'entreprise et le poste : le dialogue générique n'a pas de sélecteur d'entreprise, ils se règlent sur la fiche (section « Profil contact »). */
  quickCreate: ["firstName", "lastName", "email", "ownerId"],
  /** colonnes minimales ; l'entreprise attend une colonne de relation (2.5a) */
  listColumns: ["profiles", "ownerId"],
  relations: [{ to: "company", fkColumn: "companyId", label: "Entreprise", inverseLabel: "Contacts", prefill: "companyId" }],
  feedParent: "company",
});
