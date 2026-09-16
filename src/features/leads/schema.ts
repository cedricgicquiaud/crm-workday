/**
 * Règles du lead (D2 à D7) : listes fermées, descripteurs de champs. Seule source de ces règles,
 * appliquée par le service (API) et par les formulaires. Les bornes sont celles de la personne, dont
 * les règles d'adresse et de LinkedIn sont reprises telles quelles : rien de ce qu'un lead accepte
 * n'est refusé à sa conversion. Ce fichier est importable côté client : aucune base.
 */
import type { FieldDescriptor, ListValue } from "@/features/objects/registry";
import { EMAIL_REGEX, EMAIL_RULE, LINKEDIN_RULE, normalizeEmail } from "@/features/persons/schema";

/** Origine (D5) : le canal par lequel le lead est arrivé ; liste fermée, extensible par migration. */
export const LEAD_ORIGINS: readonly ListValue[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "recommandation", label: "Recommandation" },
  { value: "appel_d_offres", label: "Appel d'offres" },
  { value: "partenaire", label: "Partenaire" },
  { value: "autre", label: "Autre" },
];

/** Avancement (D7) : « converti » et « écarté » sont des fins, posées par leur geste et jamais à la main. */
export const LEAD_STAGES: readonly ListValue[] = [
  { value: "nouveau", label: "Nouveau" },
  { value: "contacte", label: "Contacté" },
  { value: "qualifie", label: "Qualifié" },
  { value: "converti", label: "Converti", reserved: true },
  { value: "ecarte", label: "Écarté", reserved: true },
];

/** Les avancements d'un lead en cours : ceux d'où l'on écarte, entre lesquels on passe librement (D7). */
export const OPEN_STAGES: readonly string[] = ["nouveau", "contacte", "qualifie"];

export const DISCARDED_STAGE = "ecarte";

/** « Rouvrir » remet un lead écarté à « contacté » (D7). */
export const REOPENED_STAGE = "contacte";

export const DISCARDED_RULE = "Lead écarté : rouvrir d'abord pour changer son avancement.";

/** D4 : un lead nomme quelqu'un ou une entreprise — au moins un de ces trois champs, en création comme en modification. */
export const LEAD_NAME_FIELDS: readonly string[] = ["firstName", "lastName", "companyName"];

/** Le refus de la règle, écrit une fois sous le groupe des trois champs. */
export const LEAD_NAME_RULE = "Renseignez un prénom, un nom ou une entreprise";

/** Le champ sous lequel le refus s'affiche : le dernier du groupe, pour qu'il se lise sous les trois. */
export const LEAD_NAME_ERROR_FIELD = "companyName";

export const TITLE_RULE = "« Titre » se calcule depuis le prénom, le nom et le nom de l'entreprise, et ne se saisit pas.";

const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** Vrai quand aucun des trois champs du nom ne porte de valeur une fois les espaces retirés. */
export const lacksName = (values: Record<string, unknown>): boolean => LEAD_NAME_FIELDS.every((key) => blank(values[key]));

export const LEAD_FIELDS: readonly FieldDescriptor[] = [
  /* Calculé par la base : titre de la fiche et première colonne de la liste, jamais saisi (D3). */
  { key: "title", label: "Titre", type: "text", editable: false, sortable: true, order: 5 },
  { key: "firstName", label: "Prénom", type: "text", maxLength: 120, sortable: true, order: 10 },
  { key: "lastName", label: "Nom", type: "text", maxLength: 120, sortable: true, order: 20 },
  { key: "companyName", label: "Nom de l'entreprise", type: "text", maxLength: 120, sortable: true, order: 30 },
  { key: "jobTitle", label: "Poste", type: "text", maxLength: 120, sortable: true, order: 40 },
  { key: "email", label: "Email", type: "text", maxLength: 200, normalize: normalizeEmail, pattern: { regex: EMAIL_REGEX, message: EMAIL_RULE }, wide: true, order: 50 },
  { key: "phone", label: "Téléphone", type: "text", maxLength: 40, order: 60 },
  { key: "linkedin", label: "LinkedIn", type: "text", maxLength: 200, pattern: { regex: /^https?:\/\/\S+$/, message: LINKEDIN_RULE }, order: 70 },
  { key: "origin", label: "Origine", type: "list", required: true, values: LEAD_ORIGINS, sortable: true, order: 80 },
  { key: "score", label: "Score", type: "number", integer: true, min: 1, max: 3, sortable: true, order: 90 },
  {
    key: "stage",
    label: "Avancement",
    type: "list",
    required: true,
    default: "nouveau",
    values: LEAD_STAGES,
    /* Écarté, l'avancement se lit en texte à côté de « Rouvrir » ; les autres champs restent modifiables (D7). */
    lockedWhen: { test: (record) => record.stage === DISCARDED_STAGE, message: DISCARDED_RULE },
    sortable: true,
    order: 100,
  },
  { key: "ownerId", label: "Responsable", type: "user", required: true, default: "actor", sortable: true, order: 110 },
  { key: "need", label: "Besoin", type: "text", maxLength: 2000, multiline: true, wide: true, order: 200 },
];
