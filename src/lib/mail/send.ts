/**
 * Envoi d'email à partir d'un modèle. Signature stable : la livraison 1.2a l'appelle,
 * la livraison 1.4 en devient propriétaire (modèles en base, expéditeur du cabinet).
 *
 * - développement et test : aucun appel réseau, l'email est capturé et journalisé « capture » ;
 * - production : envoi par Resend, journalisé « envoye » ou « echec » avec le motif.
 * Rien ne part sans ligne de journal.
 */
import { render } from "@react-email/render";
import { Resend } from "resend";
import { emailLog } from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv, isProduction } from "@/lib/env";
import { getCabinetSettings } from "@/lib/mail/settings";
import { getTemplate, renderVariables } from "@/lib/mail/templates";
import { TemplateEmail } from "@/emails/template";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Sujet et HTML d'un modèle en base, variables remplacées, dans le cadre React Email. */
export async function renderTemplate(template: TemplateName, variables: TemplateVariables) {
  const found = await getTemplate(template);
  if (!found) throw new Error(`Modèle inconnu : « ${template} »`);
  const subject = renderVariables(found.subject, variables);
  const body = renderVariables(found.body, variables);
  return { subject, html: await render(TemplateEmail({ preview: subject, cabinet: variables.cabinet, body })) };
}

/** Le nom du cabinet enregistré prime sur la valeur passée par l'appelant (contrat 27). */
async function withCabinetName(variables: TemplateVariables): Promise<TemplateVariables> {
  const settings = await getCabinetSettings();
  return settings ? { ...variables, cabinet: settings.name } : variables;
}

export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<SendTemplatedEmailResult> {
  if (!isValidEmail(input.to)) {
    throw new Error(`Destinataire invalide : « ${input.to} »`);
  }
  const { subject, html } = await renderTemplate(input.template, await withCabinetName(input.variables));
  const base = {
    to: input.to.trim(),
    subject,
    body: html,
    template: input.template,
    authorId: input.authorId ?? null,
    objectType: input.objectRef?.type ?? null,
    objectId: input.objectRef?.id ?? null,
  };

  if (!isProduction()) {
    const [row] = await db.insert(emailLog).values({ ...base, status: "capture" }).returning({ id: emailLog.id });
    return { id: row.id, status: "capture" };
  }

  const env = getEnv();
  const from = env.MAIL_FROM;
  if (!from) {
    const [row] = await db
      .insert(emailLog)
      .values({ ...base, status: "echec", errorReason: "expéditeur non configuré" })
      .returning({ id: emailLog.id });
    return { id: row.id, status: "echec", errorReason: "expéditeur non configuré" };
  }
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from, to: base.to, subject, html });
    if (error) throw new Error(error.message);
    const [row] = await db
      .insert(emailLog)
      .values({ ...base, status: "envoye", providerId: data?.id ?? null })
      .returning({ id: emailLog.id });
    return { id: row.id, status: "envoye" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const [row] = await db.insert(emailLog).values({ ...base, status: "echec", errorReason: reason }).returning({ id: emailLog.id });
    return { id: row.id, status: "echec", errorReason: reason };
  }
}
