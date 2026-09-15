/**
 * Libellés et formats communs des objets (D2 : français, Europe/Paris) : dates courtes,
 * valeur affichée d'un champ selon son descripteur, libellé du bouton de création.
 */
import { setLabels } from "@/features/objects/fields";
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

/** Les entrées d'un ensemble écrit en texte (« hcm,integration ») ; rien pour une valeur absente. */
const splitSet = (value: unknown): string[] =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

/**
 * Valeur lisible d'un champ : libellé d'une liste, nom d'un utilisateur, texte tel quel, « — » si
 * vide. Une valeur retirée d'une liste (2.4) se lit toujours, marquée : la fiche qui la porte dit
 * ce qu'elle porte, elle ne l'oublie pas parce que la liste a changé.
 */
export function displayValue(field: FieldDescriptor, value: unknown, users: readonly UserOption[]): string {
  /*
   * Un ensemble s'écrit par ses libellés joints ; vide, il porte l'étiquette déclarée (« Aucun », D8).
   * Il arrive en tableau depuis une fiche, et en clés jointes par des virgules depuis l'historique,
   * qui n'enregistre que du texte ; une entrée qu'aucune valeur ne nomme se lit telle quelle.
   */
  if (field.type === "multilist") {
    const entries = Array.isArray(value) ? value : splitSet(value);
    return entries.length === 0 ? field.emptyLabel ?? EMPTY : setLabels(field, entries).join(", ");
  }
  if (value === null || value === undefined || value === "") return EMPTY;
  const text = String(value);
  if (field.type === "list") {
    const retired = field.retiredValues?.find((v) => v.value === text);
    if (retired) return `${retired.label} (retirée)`;
    return field.values?.find((v) => v.value === text)?.label ?? text;
  }
  if (field.type === "user") return users.find((u) => u.id === text)?.name ?? text;
  if (field.type === "date") return formatDate(text);
  /* Un nombre s'écrit avec ses décimales et son unité (« 650,00 € ») : la même valeur se lit pareil en liste, sur la fiche et dans l'historique. */
  if (field.type === "number") return formatNumber(field, Number(text));
  return text;
}

/** « 650,00 € », « 6 » : décimales fixes quand le champ en déclare, unité après la valeur. */
export function formatNumber(field: FieldDescriptor, value: number): string {
  if (!Number.isFinite(value)) return EMPTY;
  const digits = field.decimals ?? 0;
  const text = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 3), useGrouping: false }).format(value);
  return field.unit ? `${text} ${field.unit}` : text;
}

/** « Nouvelle entreprise », « Nouveau contact » : le genre vient de l'article déclaré. */
export function createLabel(labels: ObjectLabels): string {
  return `${labels.article === "une" ? "Nouvelle" : "Nouveau"} ${labels.singular.toLowerCase()}`;
}

/** Nom affiché d'un utilisateur (prénom puis nom). */
export const userName = (user: { firstName: string; lastName: string }) => `${user.firstName} ${user.lastName}`.trim();
