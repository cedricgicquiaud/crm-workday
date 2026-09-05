/**
 * Modèles d'emails en base (D22). Sujet et corps portent des variables `{{prenom}}`, `{{nom}}`,
 * `{{cabinet}}`, `{{lien}}`. Les deux modèles système sont amorcés au premier besoin avec les
 * textes historiques de `src/emails/`.
 */
import { asc, eq } from "drizzle-orm";
import { emailTemplate } from "@/db/schema";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Les seules variables qu'un modèle peut porter (D22). */
export const ALLOWED_VARIABLES = ["prenom", "nom", "cabinet", "lien"] as const;

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

export async function getTemplate(key: string): Promise<EmailTemplate | null> {
  await ensureSystemTemplates();
  const [row] = await db.select().from(emailTemplate).where(eq(emailTemplate.key, key)).limit(1);
  return row ?? null;
}

export type TemplateText = { subject: string; body: string };

const VARIABLE_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Noms des variables `{{…}}` présentes dans un texte, dans l'ordre, sans doublon. */
export function variablesOf(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(VARIABLE_RE), (m) => m[1])));
}

/**
 * Refuse toute variable hors de la liste autorisée, en la nommant (contrat 31), puis l'absence
 * d'une variable obligatoire du modèle (contrat 32).
 */
export function validateTemplateText(text: TemplateText, requiredVariables: readonly string[]): void {
  const present = variablesOf(`${text.subject}\n${text.body}`);
  const unknown = present.find((name) => !(ALLOWED_VARIABLES as readonly string[]).includes(name));
  if (unknown !== undefined) {
    throw new HttpError(400, "variable_inconnue", `La variable {{${unknown}}} n'existe pas. Variables disponibles : ${ALLOWED_VARIABLES.map((v) => `{{${v}}}`).join(", ")}.`, {
      variable: unknown,
    });
  }
  const missing = requiredVariables.find((name) => !present.includes(name));
  if (missing !== undefined) {
    throw new HttpError(400, "variable_obligatoire_absente", `Ce modèle doit contenir la variable {{${missing}}}.`, { variable: missing });
  }
}

export async function updateTemplate(key: string, text: TemplateText): Promise<void> {
  const found = await getTemplate(key);
  if (!found) throw new HttpError(404, "modele_introuvable", "Ce modèle n'existe pas.");
  validateTemplateText(text, found.requiredVariables);
  await db.update(emailTemplate).set({ subject: text.subject, body: text.body, updatedAt: new Date() }).where(eq(emailTemplate.key, key));
}

/** Remplace chaque `{{variable}}` par sa valeur ; une variable absente des valeurs reste telle quelle. */
export function renderVariables(text: string, variables: Record<string, string>): string {
  return text.replace(VARIABLE_RE, (whole, name: string) => (name in variables ? variables[name] : whole));
}
