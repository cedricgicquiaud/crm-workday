/** Libellés d'interface des emails (D2 : une seule langue, en français, dates en Europe/Paris). */
import type { EmailStatus } from "@/lib/mail/send";

export const STATUS_LABELS: Record<EmailStatus, string> = { capture: "Capturé", envoye: "Envoyé", echec: "Échec" };

const TEMPLATE_LABELS: Record<string, string> = { invitation: "Invitation", reinitialisation: "Réinitialisation", test: "Email de test" };

export function templateLabel(key: string): string {
  return TEMPLATE_LABELS[key] ?? key;
}

/** Ce que chaque variable d'un modèle deviendra dans l'email envoyé. */
export const VARIABLE_HELP: { name: string; help: string }[] = [
  { name: "prenom", help: "Prénom du destinataire" },
  { name: "nom", help: "Nom du destinataire" },
  { name: "cabinet", help: "Nom du cabinet (Paramètres → Cabinet)" },
  { name: "lien", help: "Lien à ouvrir (invitation, réinitialisation)" },
];

const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** `4 sept. 2026, 14:32` */
export function formatDateTime(value: Date | string): string {
  return DATE_TIME.format(typeof value === "string" ? new Date(value) : value);
}
