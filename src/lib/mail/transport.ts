/**
 * Transport d'envoi réel. En production, Resend ; en test, un faux injecté dans
 * `sendTemplatedEmail` pour exercer le même chemin sans réseau (contrat 34).
 */
import { Resend } from "resend";

export type OutgoingMessage = { from: string; to: string; subject: string; html: string };

export type MailTransport = {
  /** Rend l'identifiant du fournisseur ; lève une erreur portant le motif du refus. */
  send(message: OutgoingMessage): Promise<{ id: string }>;
};

export function resendTransport(apiKey: string): MailTransport {
  const resend = new Resend(apiKey);
  return {
    async send(message) {
      const { data, error } = await resend.emails.send(message);
      if (error) throw new Error(error.message);
      return { id: data?.id ?? "" };
    },
  };
}
