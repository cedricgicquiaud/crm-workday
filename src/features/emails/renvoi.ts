/**
 * « Renvoyer » depuis le journal : un geste humain, jamais automatique (D24). Une invitation ou
 * une réinitialisation repart avec un lien neuf ; tout autre email repart à l'identique.
 */
import { eq } from "drizzle-orm";
import { emailLog } from "@/db/schema";
import { resendInvitation } from "@/features/auth/invitations";
import { getAuth } from "@/lib/auth";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendRenderedEmail } from "@/lib/mail/send";

export async function resendFromJournal(logId: string, authorId: string): Promise<void> {
  const [entry] = await db.select().from(emailLog).where(eq(emailLog.id, logId)).limit(1);
  if (!entry) throw new HttpError(404, "envoi_introuvable", "Cet envoi n'existe pas dans le journal.");
  switch (entry.template) {
    case "invitation":
      await resendInvitation(entry.to, authorId);
      return;
    case "reinitialisation":
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
