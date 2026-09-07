/**
 * Règles des activités (D10), source unique partagée par l'API, le service et l'écran : les types
 * déclarés avec leur rang d'affichage, et la validation d'une activité reçue (champs obligatoires
 * d'une tâche compris, contrat 16).
 */
import { z } from "zod";

/** Un type d'activité : sa clé enregistrée, son libellé et son rang (l'ordre ne dépend jamais de l'ordre des imports). */
export type ActivityType = { key: string; label: string; order: number };

/** Clé du type « tâche » : le seul qui porte une échéance, un responsable et un état « faite ». */
export const TASK = "tache";

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  { key: "note", label: "Note", order: 10 },
  { key: "appel", label: "Appel", order: 20 },
  { key: "reunion", label: "Réunion", order: 30 },
  { key: TASK, label: "Tâche", order: 40 },
];

/** Types d'activité par rang croissant. */
export const activityTypes = (): readonly ActivityType[] => [...ACTIVITY_TYPES].sort((a, b) => a.order - b.order);

const ACTIVITY_TYPE_KEYS = activityTypes().map((type) => type.key) as [string, ...string[]];

export const BODY_MAX = 2_000;
export const TITLE_MAX = 120;

const LABELS: Record<string, string> = { type: "Type", body: "Texte", title: "Titre", occurredOn: "Date", dueDate: "Échéance", assigneeId: "Responsable" };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = () => z.string().trim().regex(ISO_DAY);
const optional = <T extends z.ZodType>(schema: T) => schema.nullish();

const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPE_KEYS),
  body: optional(z.string().trim().max(BODY_MAX)),
  title: optional(z.string().trim().max(TITLE_MAX)),
  occurredOn: optional(day()),
  dueDate: optional(day()),
  assigneeId: optional(z.string().trim().min(1)),
});

/** Valeurs d'une activité prêtes pour la base : les champs absents sont nuls. */
export type ActivityValues = { type: string; body: string | null; title: string | null; occurredOn: string | null; dueDate: string | null; assigneeId: string | null };

export type ActivityErrors = Record<string, string>;

const required = (key: string) => `« ${LABELS[key]} » est obligatoire.`;
const invalid = (key: string) => `Valeur invalide pour « ${LABELS[key] ?? key} ».`;

const empty = (value: string | null | undefined): value is null | undefined | "" => value === null || value === undefined || value === "";

/**
 * Valide une activité reçue : type dans la liste déclarée, longueurs, jours au format `AAAA-MM-JJ`,
 * et, pour une tâche, titre et responsable obligatoires (contrat 16). Rend soit les valeurs, soit
 * une erreur par champ — l'API en fait un 400 dont le message nomme le premier champ fautif.
 */
export function parseActivity(input: unknown): { values: ActivityValues } | { errors: ActivityErrors } {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) {
    const errors: ActivityErrors = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "type");
      errors[key] ??= invalid(key);
    }
    return { errors: Object.keys(errors).length > 0 ? errors : { type: invalid("type") } };
  }
  const values: ActivityValues = {
    type: parsed.data.type,
    body: parsed.data.body || null,
    title: parsed.data.title || null,
    occurredOn: parsed.data.occurredOn || null,
    dueDate: parsed.data.dueDate || null,
    assigneeId: parsed.data.assigneeId || null,
  };
  const errors: ActivityErrors = {};
  if (values.type === TASK) {
    if (empty(values.title)) errors.title = required("title");
    if (empty(values.assigneeId)) errors.assigneeId = required("assigneeId");
  }
  return Object.keys(errors).length > 0 ? { errors } : { values };
}
