import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/lib/db";
import { isValidEmail, sendTemplatedEmail } from "@/lib/mail/send";
import { lastEmailTo } from "../helpers/mailbox";

afterAll(closeDb);

describe("envoi d'email capturé (décision D25, contrat 34)", () => {
  it("journalise l'email « capturé » sans appel réseau et le rend lisible par lastEmailTo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const to = `test-${Date.now()}@exemple.fr`;
    const result = await sendTemplatedEmail({
      to,
      template: "invitation",
      variables: { prenom: "Ana", nom: "Martin", cabinet: "Cabinet Test", lien: "http://localhost:3000/invitation/abc" },
    });
    expect(result.status).toBe("capture");
    expect(fetchSpy).not.toHaveBeenCalled();
    const mail = await lastEmailTo(to);
    expect(mail?.subject).toBe("Votre accès au CRM de Cabinet Test");
    expect(mail?.body).toContain("Bonjour Ana");
    expect(mail?.links).toContain("http://localhost:3000/invitation/abc");
    fetchSpy.mockRestore();
  });

  it("refuse un destinataire invalide avant tout envoi (contrat 35)", async () => {
    expect(isValidEmail("pas-un-email")).toBe(false);
    await expect(
      sendTemplatedEmail({ to: "pas-un-email", template: "reinitialisation", variables: { prenom: "", nom: "", cabinet: "", lien: "" } }),
    ).rejects.toThrowError(/Destinataire invalide/);
  });
});
