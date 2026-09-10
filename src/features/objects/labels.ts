/**
 * Libellés et formats communs des objets (D2 : français, Europe/Paris) : dates courtes,
 * valeur affichée d'un champ selon son descripteur, libellé du bouton de création.
 */
import type { FieldDescriptor, ObjectLabels } from "@/features/objects/registry";

export type UserOption = { id: string; name: string };

/** Une fiche telle que l'API la sérialise : les dates sont des chaînes ISO. */
export type SerializedRecord = { id: string; createdAt: string; updatedAt: string; createdBy: string; ownerId: string; archivedAt: string | null } & Record<string, string | number | null>;

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** « 5 sept. 2026 » */
export const formatDate = (value: Date | string): string => DATE.format(typeof value === "string" ? new Date(value) : value);
/** « 5 sept. 2026, 14:32 » */
export const formatDateTime = (value: Date | string): string => DATE_TIME.format(typeof value === "string" ? new Date(value) : value);

export const EMPTY = "—";

/**
 * Valeur lisible d'un champ : libellé d'une liste, nom d'un utilisateur, texte tel quel, « — » si
 * vide. Une valeur retirée d'une liste (2.4) se lit toujours, marquée : la fiche qui la porte dit
 * ce qu'elle porte, elle ne l'oublie pas parce que la liste a changé.
 */
export function displayValue(field: FieldDescriptor, value: unknown, users: readonly UserOption[]): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  const text = String(value);
  if (field.type === "list") {
    const retired = field.retiredValues?.find((v) => v.value === text);
    if (retired) return `${retired.label} (retirée)`;
    return field.values?.find((v) => v.value === text)?.label ?? text;
  }
  if (field.type === "user") return users.find((u) => u.id === text)?.name ?? text;
  if (field.type === "date") return formatDate(text);
  return text;
}

/** « Nouvelle entreprise », « Nouveau contact » : le genre vient de l'article déclaré. */
export function createLabel(labels: ObjectLabels): string {
  return `${labels.article === "une" ? "Nouvelle" : "Nouveau"} ${labels.singular.toLowerCase()}`;
}

/** Nom affiché d'un utilisateur (prénom puis nom). */
export const userName = (user: { firstName: string; lastName: string }) => `${user.firstName} ${user.lastName}`.trim();
