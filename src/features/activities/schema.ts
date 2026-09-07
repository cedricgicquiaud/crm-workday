/**
 * Règles des activités (D10), source unique partagée par l'API, le service et l'écran : les types
 * déclarés avec leur rang d'affichage, et la validation d'une activité reçue.
 */
import { z } from "zod";

/** Un type d'activité : sa clé enregistrée, son libellé et son rang (l'ordre ne dépend jamais de l'ordre des imports). */
export type ActivityType = { key: string; label: string; order: number };

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  { key: "note", label: "Note", order: 10 },
  { key: "appel", label: "Appel", order: 20 },
  { key: "reunion", label: "Réunion", order: 30 },
  { key: "tache", label: "Tâche", order: 40 },
];

/** Types d'activité par rang croissant. */
export const activityTypes = (): readonly ActivityType[] => [...ACTIVITY_TYPES].sort((a, b) => a.order - b.order);

export const ACTIVITY_TYPE_KEYS = activityTypes().map((type) => type.key);

export const BODY_MAX = 2_000;

const trimmed = (max: number) => z.string().trim().max(max);

export const newActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPE_KEYS as [string, ...string[]]),
  body: trimmed(BODY_MAX).optional(),
});

export type NewActivity = z.infer<typeof newActivitySchema>;
