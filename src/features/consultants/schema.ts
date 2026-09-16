/**
 * Règles du profil consultant (D2 à D7) : listes fermées, descripteurs de champs. Seule source de
 * ces règles, appliquée par l'API du profil, par la création composite, par les formulaires et par
 * l'amorce de recette. Les clés des champs sont les noms de colonnes Drizzle en camelCase, sauf
 * `billingCompanyName` — la société de facturation est une entreprise liée : la personne en porte
 * l'identifiant (`billing_company_id`) et la liste en affiche le nom.
 * Ce fichier est importable côté client : aucune table, aucune base.
 */
import type { FieldDescriptor, ListValue } from "@/features/objects/registry";

/**
 * Le profil auquel ces champs appartiennent (D19) : ils se rendent dans sa section, jamais dans
 * « Champs », et l'API de la personne les refuse en nommant ce profil.
 */
export const CONSULTANT_PROFILE = { key: "consultant", label: "profil consultant" } as const;

/** Clé de la liste « Consultants » (D10) : celle sous laquelle se rangent ses vues et ses épingles. */
export const CONSULTANTS_LIST = "consultants";

/** Statut d'un consultant (D2) : la forme du lien entre le cabinet et lui. */
export const STATUSES: readonly ListValue[] = [
  { value: "salarie", label: "Salarié" },
  { value: "freelance", label: "Freelance" },
  { value: "portage", label: "Portage" },
];

/** Modules Workday (D3) : liste fermée dans le code, jamais administrable à l'écran. */
export const MODULES: readonly ListValue[] = [
  { value: "hcm", label: "HCM" },
  { value: "payroll", label: "Payroll" },
  { value: "integration", label: "Integration" },
  { value: "finance", label: "Finance" },
  { value: "absence", label: "Absence" },
  { value: "time_tracking", label: "Time Tracking" },
  { value: "compensation", label: "Compensation" },
  { value: "recruiting", label: "Recruiting" },
  { value: "talent", label: "Talent" },
  { value: "benefits", label: "Benefits" },
  { value: "learning", label: "Learning" },
  { value: "extend", label: "Extend" },
  { value: "prism", label: "Prism" },
  { value: "adaptive_planning", label: "Adaptive Planning" },
  { value: "student", label: "Student" },
  { value: "procurement", label: "Procurement" },
  { value: "expenses", label: "Expenses" },
  { value: "projects", label: "Projects" },
];

/**
 * Modules retirés de la liste (D3) : ils restent lisibles « retiré » sur les fiches qui les portent
 * et ne se choisissent plus. Aucun pour l'instant ; en retirer un revient à le déplacer ici.
 */
export const RETIRED_MODULES: readonly ListValue[] = [];

/** « Indisponible » se saisit en case à cocher, mais s'enregistre comme une liste fermée : le registre n'a pas de booléen (D6, D25). */
export const YES_NO: readonly ListValue[] = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

export const DAILY_COST_MAX = 10_000;
export const YEARS_EXPERIENCE_MAX = 40;

export const CV_RULE = "Le lien du CV doit être une adresse https (https://…).";

/**
 * Type d'entreprise imposé par le statut (D4) : la société d'un freelance est la sienne, celle d'un
 * porté est sa société de portage, un salarié n'en a aucune. Seule source du sélecteur et du refus.
 */
export const BILLING_COMPANY_TYPE: Readonly<Record<string, string | null>> = {
  salarie: null,
  freelance: "societe_de_consultant",
  portage: "societe_de_portage",
};

/** Comment un refus nomme le consultant selon son statut : « Un freelance est facturé par… ». */
export const STATUS_SUBJECT: Readonly<Record<string, string>> = {
  salarie: "Un salarié",
  freelance: "Un freelance",
  portage: "Un consultant porté",
};

/**
 * Champs du profil consultant, déclarés parmi ceux de la personne : ils sont colonnes, filtres et
 * tris de ses listes, et se règlent par l'API du profil (`profile`, D19). Leurs rangs viennent après
 * « Poste » (90) et avant « Notes » (200).
 */
export const CONSULTANT_PROFILE_FIELDS: readonly FieldDescriptor[] = [
  { key: "status", label: "Statut", type: "list", values: STATUSES, required: true, sortable: true, profile: CONSULTANT_PROFILE, order: 100 },
  { key: "modules", label: "Modules", type: "multilist", values: MODULES, retiredValues: RETIRED_MODULES, markedBy: { field: "certifiedModules", mark: "✔" }, profile: CONSULTANT_PROFILE, order: 110 },
  { key: "certifiedModules", label: "Certifié sur", type: "multilist", values: MODULES, retiredValues: RETIRED_MODULES, profile: CONSULTANT_PROFILE, order: 120 },
  /* Le nom de la société de facturation : c'est lui que la liste affiche, trie et filtre ; l'identifiant est écrit par l'API du profil. */
  { key: "billingCompanyName", label: "Société de facturation", type: "text", editable: false, sortable: true, profile: CONSULTANT_PROFILE, order: 130 },
  { key: "dailyCost", label: "Coût journalier", type: "number", unit: "€", decimals: 2, min: 0, max: DAILY_COST_MAX, sortable: true, profile: CONSULTANT_PROFILE, order: 140 },
  { key: "availableFrom", label: "Disponible à partir du", type: "date", sortable: true, profile: CONSULTANT_PROFILE, order: 150 },
  { key: "unavailable", label: "Indisponible", type: "list", values: YES_NO, profile: CONSULTANT_PROFILE, order: 160 },
  { key: "unavailableReason", label: "Motif d'indisponibilité", type: "text", maxLength: 120, profile: CONSULTANT_PROFILE, order: 170 },
  { key: "yearsExperience", label: "Années d'expérience", type: "number", integer: true, min: 0, max: YEARS_EXPERIENCE_MAX, sortable: true, profile: CONSULTANT_PROFILE, order: 180 },
  { key: "languages", label: "Langues", type: "text", maxLength: 120, sortable: true, profile: CONSULTANT_PROFILE, order: 185 },
  { key: "cvUrl", label: "CV", type: "text", maxLength: 200, pattern: { regex: /^https:\/\/\S+$/, message: CV_RULE }, profile: CONSULTANT_PROFILE, order: 190 },
];

/**
 * Société de facturation, côté écriture et historique : portée par `person.billing_company_id`,
 * choisie dans la section du profil et historisée par le nom de l'entreprise (D4, D13). Elle n'est
 * pas une colonne de liste — c'est `billingCompanyName` qui l'est.
 */
export const BILLING_COMPANY_FIELD: FieldDescriptor = { key: "billingCompanyId", label: "Société de facturation", type: "text", profile: CONSULTANT_PROFILE, order: 130 };

/** Clés que l'API du profil consultant accepte : ses champs, plus la société par son identifiant. */
export const CONSULTANT_PROFILE_KEYS: readonly string[] = [...CONSULTANT_PROFILE_FIELDS.filter((field) => field.editable !== false).map((field) => field.key), BILLING_COMPANY_FIELD.key];

/** Descripteurs que l'API du profil valide : ses champs saisissables, la société comprise. */
export const CONSULTANT_INPUT_FIELDS: readonly FieldDescriptor[] = [...CONSULTANT_PROFILE_FIELDS.filter((field) => field.editable !== false), BILLING_COMPANY_FIELD];

/** Champs édités hors de la section « Champs » dont l'historique doit nommer le libellé (sans eux, il écrirait « billingCompanyId »). */
export const CONSULTANT_PROFILE_HISTORY_FIELDS: readonly FieldDescriptor[] = [BILLING_COMPANY_FIELD];
