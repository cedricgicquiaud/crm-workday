/**
 * Libellés et formats communs des objets (D2 : français, Europe/Paris) : dates courtes,
 * valeur affichée d'un champ selon son descripteur, libellé du bouton de création.
 */
import { setLabels } from "@/features/objects/fields";
import type { FieldDescriptor, ObjectLabels } from "@/features/objects/registry";

export type UserOption = { id: string; name: string };

/** Options d'un sélecteur de fiche liée : les fiches proposées, et combien d'autres au-delà de la borne (« et N autres »). */
export type RelationOptions = { options: { id: string; name: string }[]; more: number };

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
 * Clé sous laquelle une fiche porte ce qu'on lit d'une fiche liée (D60) : son titre, et sa marque quand
 * le lien a changé depuis (« Julie Martin (a quitté Banque X) », « Banque X (archivée) »). Le champ garde
 * l'identifiant, que l'écriture renvoie ; la fiche, la liste et le tri lisent ce texte.
 */
export const linkedLabelKey = (key: string): string => `${key}Label`;

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
export function displayValue(field: FieldDescriptor, value: unknown, users: readonly UserOption[], marked?: unknown): string {
  /*
   * Un ensemble s'écrit par ses libellés joints ; vide, il porte l'étiquette déclarée (« Aucun », D8).
   * Il arrive en tableau depuis une fiche, et en clés jointes par des virgules depuis l'historique,
   * qui n'enregistre que du texte ; une entrée qu'aucune valeur ne nomme se lit telle quelle.
   */
  if (field.type === "multilist") {
    const entries = Array.isArray(value) ? value : splitSet(value);
    if (entries.length === 0) return field.emptyLabel ?? EMPTY;
    const flagged = new Set(Array.isArray(marked) ? marked.map(String) : splitSet(marked));
    const mark = field.markedBy?.mark ?? "";
    return setLabels(field, entries)
      .map((label, index) => `${label}${flagged.has(String(entries[index])) ? ` ${mark}` : ""}`)
      .join(", ");
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

/**
 * Ce qu'une cellule ou une carte de liste écrit pour un champ d'une fiche : un champ dérivé par son
 * `display`, lu depuis la fiche entière (D19) ; une fiche liée par son titre ; tout autre champ par sa valeur, avec la marque de son
 * champ compagnon (« HCM ✔ », D10). Le tableau et les cartes lisent la même phrase.
 */
export function cellText(field: FieldDescriptor, record: Record<string, unknown>, users: readonly UserOption[]): string {
  if (field.display) return field.display(record);
  /* Une fiche liée se lit par ce que la fiche porte d'elle, son titre marqué (D60), jamais par son identifiant. */
  if (field.type === "relation") return typeof record[linkedLabelKey(field.key)] === "string" ? String(record[linkedLabelKey(field.key)]) : EMPTY;
  return displayValue(field, record[field.key], users, field.markedBy ? record[field.markedBy.field] : undefined);
}

/** Une valeur qu'un sélecteur montre ; `disabled` : lisible sur la fiche qui la porte, jamais à choisir. */
export type SelectableValue = { value: string; label: string; disabled?: boolean };

/**
 * Valeurs qu'un sélecteur de liste propose pour une fiche (fiche, cellule) : celles de la liste, sans
 * les valeurs réservées à un geste de l'objet (D21). La valeur enregistrée, si elle est réservée ou
 * retirée (2.4), s'ajoute éteinte et marquée : le sélecteur dit ce que la fiche porte sans le proposer.
 */
export function selectableValues(field: FieldDescriptor, saved: string): SelectableValue[] {
  const choosable = (field.values ?? []).filter((entry) => !entry.reserved).map(({ value, label }) => ({ value, label }));
  const carried = choosable.some((entry) => entry.value === saved) || saved === "" ? null : [...(field.values ?? []), ...(field.retiredValues ?? [])].find((entry) => entry.value === saved);
  return carried ? [...choosable, { value: saved, label: displayValue(field, saved, []), disabled: true }] : choosable;
}

/** « 39 000,00 € », « 6 » : milliers séparés par l'espace fine insécable du français, décimales fixes quand le champ en déclare, unité après la valeur. */
export function formatNumber(field: FieldDescriptor, value: number): string {
  if (!Number.isFinite(value)) return EMPTY;
  const digits = field.decimals ?? 0;
  const text = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 3) }).format(value);
  return field.unit ? `${text} ${field.unit}` : text;
}

/** « Nouvelle entreprise », « Nouveau contact » : le genre vient de l'article déclaré. */
export function createLabel(labels: ObjectLabels): string {
  return `${labels.article === "une" ? "Nouvelle" : "Nouveau"} ${labels.singular.toLowerCase()}`;
}

/** Nom affiché d'un utilisateur (prénom puis nom). */
export const userName = (user: { firstName: string; lastName: string }) => `${user.firstName} ${user.lastName}`.trim();
