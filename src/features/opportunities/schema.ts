/**
 * Règles de l'opportunité (D31 à D33) et listes fermées de toute la feature 4.2 : étapes, probabilités,
 * motifs de perte, résultats d'une proposition. Seule source de ces règles, appliquée par le service
 * (API) et par les formulaires ; les livraisons 4.2b à 4.2d les lisent sans y toucher.
 * Ce fichier est importable côté client : aucune table, aucune base.
 */
import { MODULES, RETIRED_MODULES } from "@/features/consultants/schema";
import type { FieldDescriptor, ListValue } from "@/features/objects/registry";

/**
 * Étapes du pipeline (D32), dans leur ordre : le rang d'une étape est sa place ici. Gagnée et perdue
 * sont des fins posées par leur geste (4.2d), jamais à la main.
 */
export const STAGES: readonly ListValue[] = [
  { value: "nouveau_besoin", label: "Nouveau besoin" },
  { value: "qualifie", label: "Qualifié" },
  { value: "profils_proposes", label: "Profils proposés" },
  { value: "entretien_client", label: "Entretien client" },
  { value: "proposition_envoyee", label: "Proposition envoyée" },
  { value: "negociation", label: "Négociation" },
  { value: "gagnee", label: "Gagnée", reserved: true },
  { value: "perdue", label: "Perdue", reserved: true },
];

/** Probabilité de gagner, en pourcentage, déduite de l'étape (D33) ; elle ne se saisit pas. */
const PROBABILITIES: Readonly<Record<string, number>> = {
  nouveau_besoin: 10,
  qualifie: 20,
  profils_proposes: 30,
  entretien_client: 50,
  proposition_envoyee: 70,
  negociation: 80,
  gagnee: 100,
  perdue: 0,
};

/** Rang d'une étape dans le pipeline, de 0 (« Nouveau besoin ») à 7 (« Perdue ») ; `-1` pour une valeur inconnue. */
export const stageRank = (stage: string): number => STAGES.findIndex((entry) => entry.value === stage);

/** Probabilité d'une étape, ou `null` pour une valeur inconnue. */
export const stageProbability = (stage: string): number | null => PROBABILITIES[stage] ?? null;

/** Motifs de perte, choisis au geste « Marquer perdue » (4.2d). */
export const LOSS_REASONS: readonly ListValue[] = [
  { value: "prix", label: "Prix" },
  { value: "profil_non_retenu", label: "Profil non retenu" },
  { value: "concurrent", label: "Concurrent" },
  { value: "projet_abandonne", label: "Projet abandonné ou reporté" },
  { value: "pas_de_reponse", label: "Pas de réponse" },
  { value: "autre", label: "Autre" },
];

/** Résultat d'une proposition (4.2b), dans l'ordre où il se choisit. */
export const PROPOSAL_RESULTS: readonly ListValue[] = [
  { value: "propose", label: "Proposé" },
  { value: "entretien", label: "Entretien" },
  { value: "retenu", label: "Retenu" },
  { value: "refuse", label: "Refusé" },
];

/** Rang d'un résultat, du plus avancé au moins avancé : Retenu > Entretien > Proposé > Refusé. */
const RESULT_RANKS: Readonly<Record<string, number>> = { retenu: 3, entretien: 2, propose: 1, refuse: 0 };

/** Rang d'un résultat, `-1` pour une valeur inconnue. */
export const resultRank = (result: string): number => RESULT_RANKS[result] ?? -1;

/** TJM de vente cible (D31) : plus de 0, 5 000 € par jour au plus. */
export const TARGET_DAILY_RATE_MAX = 5_000;

/** Durée estimée (D31) : un nombre entier de jours, de 1 à 1 000. */
export const ESTIMATED_DAYS_MAX = 1_000;

const absent = (value: unknown): boolean => value === null || value === undefined || value === "";

/**
 * Montant estimé (D31) : le TJM de vente cible multiplié par la durée estimée, arrondi au centime ;
 * `null` quand l'un des deux manque. Le TJM arrive de la base en décimal écrit (« 650.00 »).
 */
export function estimatedAmount(record: Record<string, unknown>): number | null {
  if (absent(record.targetDailyRate) || absent(record.estimatedDays)) return null;
  return Math.round(Number(record.targetDailyRate) * Number(record.estimatedDays) * 100) / 100;
}

/**
 * Champs de l'opportunité (D31). L'entreprise est une fiche liée (D60) ; les modules sont un
 * ensemble rangé dans `opportunity_module`, pris dans la liste des modules des consultants.
 */
export const OPPORTUNITY_FIELDS: readonly FieldDescriptor[] = [
  { key: "title", label: "Titre", type: "text", required: true, maxLength: 120, sortable: true, wide: true, order: 10 },
  { key: "companyId", label: "Entreprise", type: "relation", required: true, order: 20 },
  { key: "contactPersonId", label: "Contact", type: "relation", order: 30 },
  { key: "modules", label: "Modules Workday", type: "multilist", required: true, values: MODULES, retiredValues: RETIRED_MODULES, sortable: true, order: 40 },
  { key: "targetDailyRate", label: "TJM de vente cible", type: "number", unit: "€", decimals: 2, min: 0, minExclusive: true, max: TARGET_DAILY_RATE_MAX, sortable: true, order: 60 },
  { key: "estimatedDays", label: "Durée estimée", type: "number", unit: "jours", integer: true, min: 1, max: ESTIMATED_DAYS_MAX, sortable: true, order: 70 },
  /* Calculé à la lecture (TJM × durée), jamais saisi : colonne, filtre et tri de la liste. */
  { key: "estimatedAmount", label: "Montant estimé", type: "number", unit: "€", decimals: 2, editable: false, sortable: true, order: 80 },
  { key: "desiredStart", label: "Démarrage souhaité", type: "date", sortable: true, order: 90 },
  { key: "expectedClose", label: "Clôture prévue", type: "date", required: true, sortable: true, order: 100 },
  { key: "ownerId", label: "Responsable", type: "user", required: true, default: "actor", sortable: true, order: 130 },
  { key: "need", label: "Besoin", type: "text", maxLength: 2000, multiline: true, wide: true, order: 200 },
];
