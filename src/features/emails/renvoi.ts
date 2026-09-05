/**
 * « Renvoyer » depuis le journal : un geste humain, jamais automatique (D24). Une invitation ou
 * une réinitialisation repart avec un lien neuf ; tout autre email repart à l'identique.
 */
import { eq } from "drizzle-orm";
import { emailLog, user } from "@/db/schema";
import { resendInvitation } from "@/features/auth/invitations";
import { getAuth } from "@/lib/auth";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendRenderedEmail } from "@/lib/mail/send";

async function requireActiveAccount(email: string): Promise<void> {
  const [row] = await db.select({ status: user.status }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  if (!row) throw new HttpError(404, "compte_introuvable", "Aucun compte pour cette adresse.");
  if (row.status === "desactive") throw new HttpError(409, "compte_desactive", "Ce compte est désactivé.");
}

export async function resendFromJournal(logId: string, authorId: string): Promise<void> {
  const [entry] = await db.select().from(emailLog).where(eq(emailLog.id, logId)).limit(1);
  if (!entry) throw new HttpError(404, "envoi_introuvable", "Cet envoi n'existe pas dans le journal.");
  switch (entry.template) {
    case "invitation":
      await resendInvitation(entry.to, authorId);
      return;
    case "reinitialisation":
      /**
       * Better Auth n'envoie rien pour une adresse sans compte ou un compte désactivé et répond
       * quand même 200 : on vérifie le compte d'abord, pour que l'écran dise pourquoi rien ne part.
       */
      await requireActiveAccount(entry.to);
      /** Même chemin que « Mot de passe oublié ? » : jeton neuf, email envoyé par Better Auth. */
      await getAuth().api.requestPasswordReset({ body: { email: entry.to } });
      return;
    default:
      await sendRenderedEmail({
        to: entry.to,
        subject: entry.subject,
        html: entry.body,
        template: entry.template,
        authorId,
        objectRef: entry.objectType && entry.objectId ? { type: entry.objectType, id: entry.objectId } : null,
      });
  }
}
