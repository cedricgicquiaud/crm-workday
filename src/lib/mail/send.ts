/**
 * Envoi d'email à partir d'un modèle. Signature stable : la livraison 1.2a l'appelle,
 * la livraison 1.4 en devient propriétaire (modèles en base, expéditeur du cabinet).
 *
 * - développement et test : aucun appel réseau, l'email est capturé et journalisé « capture » ;
 * - production : envoi par Resend, journalisé « envoye » ou « echec » avec le motif.
 * Rien ne part sans ligne de journal.
 */
import { render } from "@react-email/render";
import { emailLog } from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv, isProduction } from "@/lib/env";
import { getCabinetSettings, type CabinetSettings } from "@/lib/mail/settings";
import { getTemplate, renderVariables, type TemplateText } from "@/lib/mail/templates";
import { resendTransport, type MailTransport } from "@/lib/mail/transport";
import { TemplateEmail } from "@/emails/template";

export type { MailTransport } from "@/lib/mail/transport";

/** Clé d'un modèle en base ; les deux modèles système sont toujours présents. */
export type TemplateName = "invitation" | "reinitialisation" | (string & {});
export type TemplateVariables = { prenom: string; nom: string; cabinet: string; lien: string };
export type EmailStatus = "capture" | "envoye" | "echec";

export type SendTemplatedEmailInput = {
  to: string;
  template: TemplateName;
  variables: TemplateVariables;
  /** utilisateur à l'origine de l'envoi ; absent = système */
  authorId?: string | null;
  /** objet auquel rattacher l'email sur sa fiche (features suivantes) */
  objectRef?: { type: string; id: string } | null;
};

export type SendTemplatedEmailResult = { id: string; status: EmailStatus; errorReason?: string };

/** Un transport injecté force le chemin d'envoi réel (tests) ; sinon il dépend de l'environnement. */
export type SendOptions = { transport?: MailTransport };

export const SENDER_NOT_CONFIGURED = "expéditeur non configuré";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Sujet et HTML d'un texte de modèle, variables remplacées, dans le cadre React Email. */
export async function renderText(text: TemplateText, variables: TemplateVariables): Promise<{ subject: string; html: string }> {
  const subject = renderVariables(text.subject, variables);
  const body = renderVariables(text.body, variables);
  return { subject, html: await render(TemplateEmail({ preview: subject, cabinet: variables.cabinet, body })) };
}

/** Rendu d'un modèle en base. */
export async function renderTemplate(template: TemplateName, variables: TemplateVariables) {
  const found = await getTemplate(template);
  if (!found) throw new Error(`Modèle inconnu : « ${template} »`);
  return renderText(found, variables);
}

/** Valeurs d'exemple de l'aperçu d'un modèle ; le nom du cabinet est le vrai s'il est enregistré. */
export const SAMPLE_VARIABLES: TemplateVariables = { prenom: "Ana", nom: "Martin", cabinet: "Cabinet Exemple", lien: "https://crm.exemple.fr/invitation/exemple" };

export async function previewText(text: TemplateText): Promise<{ subject: string; html: string }> {
  return renderText(text, withCabinetName(SAMPLE_VARIABLES, await getCabinetSettings()));
}

/** Le nom du cabinet enregistré prime sur la valeur passée par l'appelant (contrat 27). */
function withCabinetName(variables: TemplateVariables, settings: CabinetSettings | null): TemplateVariables {
  return settings ? { ...variables, cabinet: settings.name } : variables;
}

/** `Nom d'affichage <adresse>`, ou null tant que le cabinet n'a pas d'expéditeur (D21). */
function senderOf(settings: CabinetSettings | null): string | null {
  if (!settings?.senderEmail) return null;
  return settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail;
}

type LogEntry = Omit<typeof emailLog.$inferInsert, "id" | "createdAt" | "status" | "errorReason" | "providerId">;

async function log(entry: LogEntry, outcome: { status: EmailStatus; errorReason?: string; providerId?: string }): Promise<SendTemplatedEmailResult> {
  const [row] = await db
    .insert(emailLog)
    .values({ ...entry, status: outcome.status, errorReason: outcome.errorReason ?? null, providerId: outcome.providerId ?? null })
    .returning({ id: emailLog.id });
  return { id: row.id, status: outcome.status, ...(outcome.errorReason ? { errorReason: outcome.errorReason } : {}) };
}

/**
 * Envoi réel : une seule tentative, jamais de nouvelle tentative automatique (D24). Le refus
 * de l'expéditeur absent et le motif du fournisseur finissent tous deux dans le journal.
 */
async function deliver(entry: LogEntry, from: string | null, transport: MailTransport): Promise<SendTemplatedEmailResult> {
  if (!from) return log(entry, { status: "echec", errorReason: SENDER_NOT_CONFIGURED });
  try {
    const { id } = await transport.send({ from, to: entry.to, subject: entry.subject, html: entry.body });
    return log(entry, { status: "envoye", providerId: id });
  } catch (error) {
    return log(entry, { status: "echec", errorReason: error instanceof Error ? error.message : String(error) });
  }
}

export async function sendTemplatedEmail(input: SendTemplatedEmailInput, options: SendOptions = {}): Promise<SendTemplatedEmailResult> {
  if (!isValidEmail(input.to)) {
    throw new Error(`Destinataire invalide : « ${input.to} »`);
  }
  const settings = await getCabinetSettings();
  const { subject, html } = await renderTemplate(input.template, withCabinetName(input.variables, settings));
  const entry: LogEntry = {
    to: input.to.trim(),
    subject,
    body: html,
    template: input.template,
    authorId: input.authorId ?? null,
    objectType: input.objectRef?.type ?? null,
    objectId: input.objectRef?.id ?? null,
  };
  const transport = options.transport ?? (isProduction() ? resendTransport(getEnv().RESEND_API_KEY ?? "") : null);
  if (!transport) return log(entry, { status: "capture" });
  return deliver(entry, senderOf(settings), transport);
}
