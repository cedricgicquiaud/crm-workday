/**
 * Email de test (CRM-25) : un administrateur vérifie que la configuration envoie vraiment.
 * Par défaut vers sa propre adresse ; le destinataire est vérifié avant tout envoi (contrat 35).
 */
import { HttpError } from "@/lib/auth/session";
import { isValidEmail, renderText, sendRenderedEmail, type SendTemplatedEmailResult } from "@/lib/mail/send";
import { getCabinetSettings } from "@/lib/mail/settings";

export const TEST_TEMPLATE_KEY = "test";

const TEST_TEXT = {
  subject: "Email de test du CRM de {{cabinet}}",
  body: [
    "Bonjour {{prenom}},",
    "Cet email de test confirme que l'envoi depuis le CRM de {{cabinet}} fonctionne.",
    "Il a été demandé par {{prenom}} {{nom}} depuis Paramètres → Envoi de test.",
  ].join("\n\n"),
};

export type TestSender = { id: string; email: string; firstName: string; lastName: string };

export async function sendTestEmail(sender: TestSender, to?: string): Promise<SendTemplatedEmailResult & { to: string }> {
  const recipient = (to ?? sender.email).trim();
  if (!isValidEmail(recipient)) throw new HttpError(400, "destinataire_invalide", `« ${recipient} » n'est pas une adresse email valide.`);
  const settings = await getCabinetSettings();
  const rendered = await renderText(TEST_TEXT, { prenom: sender.firstName, nom: sender.lastName, cabinet: settings?.name ?? "votre cabinet", lien: "" });
  const result = await sendRenderedEmail({ to: recipient, template: TEST_TEMPLATE_KEY, authorId: sender.id, ...rendered });
  return { ...result, to: recipient };
}
