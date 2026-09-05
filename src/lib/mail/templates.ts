/**
 * Modèles d'emails en base (D22). Sujet et corps portent des variables `{{prenom}}`, `{{nom}}`,
 * `{{cabinet}}`, `{{lien}}`. Les deux modèles système sont amorcés au premier besoin avec les
 * textes historiques de `src/emails/`.
 */
import { asc } from "drizzle-orm";
import { emailTemplate } from "@/db/schema";
import { db } from "@/lib/db";

export type EmailTemplate = {
  key: string;
  subject: string;
  body: string;
  isSystem: boolean;
  requiredVariables: string[];
  updatedAt: Date;
};

/**
 * Textes par défaut des modèles système. Un paragraphe réduit à `[libellé]({{lien}})` devient
 * un bouton dans le cadre React Email ; le reste est du texte.
 */
const SYSTEM_TEMPLATES: Record<"invitation" | "reinitialisation", { subject: string; body: string; requiredVariables: string[] }> = {
  invitation: {
    subject: "Votre accès au CRM de {{cabinet}}",
    body: [
      "Bonjour {{prenom}},",
      "Un compte vient d'être créé pour vous sur le CRM de {{cabinet}}. Choisissez votre mot de passe pour y entrer.",
      "[Choisir mon mot de passe]({{lien}})",
      "Ce lien est valable 72 heures et ne sert qu'une fois.",
    ].join("\n\n"),
    requiredVariables: ["lien"],
  },
  reinitialisation: {
    subject: "Réinitialisation de votre mot de passe",
    body: [
      "Bonjour {{prenom}},",
      "Vous avez demandé un nouveau mot de passe pour le CRM de {{cabinet}}.",
      "[Choisir un nouveau mot de passe]({{lien}})",
      "Ce lien est valable 1 heure et ne sert qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    ].join("\n\n"),
    requiredVariables: ["lien"],
  },
};

/** Pose les modèles système absents ; ne touche pas à ceux qui existent (textes modifiés compris). */
export async function ensureSystemTemplates(): Promise<void> {
  await db
    .insert(emailTemplate)
    .values(Object.entries(SYSTEM_TEMPLATES).map(([key, t]) => ({ key, ...t, isSystem: true })))
    .onConflictDoNothing({ target: emailTemplate.key });
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  await ensureSystemTemplates();
  return db.select().from(emailTemplate).orderBy(asc(emailTemplate.key));
}
