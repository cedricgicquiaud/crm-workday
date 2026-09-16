/**
 * État d'un consultant (D6) : dérivé de « Disponible à partir du » et de « Indisponible », jamais
 * saisi. Seule source de la règle, lue par la fiche, la liste, le filtre et le tri. Ce fichier est
 * importable côté client : aucune base, aucune horloge — le jour courant se passe en paramètre.
 */

export type ConsultantState = "disponible" | "en_mission" | "indisponible";

/** Ce que l'état lit d'un profil : la case et la date, telles que l'API du profil les rend. */
export type AvailabilityInput = { unavailable: string | null; availableFrom: string | null };

/** « Indisponible » prime sur la date. */
export function consultantState(profile: AvailabilityInput, _today: string): ConsultantState {
  if (profile.unavailable === "oui") return "indisponible";
  return "disponible";
}
