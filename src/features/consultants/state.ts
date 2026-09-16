/**
 * État d'un consultant (D6) : dérivé de « Disponible à partir du » et de « Indisponible », jamais
 * saisi. Seule source de la règle, lue par la fiche, la liste, le filtre et le tri. Ce fichier est
 * importable côté client : aucune base, aucune horloge — le jour courant se passe en paramètre.
 */
import { formatDate } from "@/features/objects/labels";

export type ConsultantState = "disponible" | "en_mission" | "indisponible";

/** Ce que l'état lit d'un profil : la case et la date, telles que l'API du profil les rend. */
export type AvailabilityInput = { unavailable: string | null; availableFrom: string | null };

/**
 * « Indisponible » prime sur la date ; sinon « En mission » tant que la date est après aujourd'hui ;
 * sinon « Disponible ». `today` est le jour civil Europe/Paris en `AAAA-MM-JJ`, la forme même de la
 * date enregistrée : l'ordre alphabétique est l'ordre chronologique, jamais minuit UTC.
 */
export function consultantState(profile: AvailabilityInput, today: string): ConsultantState {
  if (profile.unavailable === "oui") return "indisponible";
  if (profile.availableFrom !== null && profile.availableFrom > today) return "en_mission";
  return "disponible";
}

/** Ce que le libellé lit d'une fiche : l'état déjà calculé, la date qu'il cite, et le statut. */
export type StateRecord = { state: string | null; availableFrom: string | null; status: string | null };

const LABELS: Readonly<Record<ConsultantState, string>> = { disponible: "Disponible", en_mission: "En mission", indisponible: "Indisponible" };

/** « En mission · disponible le 5 oct. 2026 » : l'état se lit avec la date qui le fera changer. */
export function stateLabel(record: StateRecord): string {
  const state = record.state as ConsultantState;
  if (state === "en_mission" && record.availableFrom) return `${LABELS.en_mission} · disponible le ${formatDate(record.availableFrom)}`;
  return LABELS[state];
}
