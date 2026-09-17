/**
 * Règles de l'opportunité (D31 à D33) et listes fermées de toute la feature 4.2 : étapes, probabilités,
 * motifs de perte, résultats d'une proposition. Seule source de ces règles, appliquée par le service
 * (API) et par les formulaires ; les livraisons 4.2b à 4.2d les lisent sans y toucher.
 * Ce fichier est importable côté client : aucune table, aucune base.
 */
import type { ListValue } from "@/features/objects/registry";

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
