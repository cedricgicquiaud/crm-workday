import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailTemplate } from "@/db/schema";
import { closeDb, db } from "@/lib/db";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { listTemplates, updateTemplate } from "@/lib/mail/templates";
import { lastEmailTo } from "../helpers/mailbox";

beforeAll(async () => {
  await db.delete(emailTemplate);
});
afterAll(async () => {
  await db.delete(emailTemplate);
  await closeDb();
});

describe("modèles système (CRM-23, D22)", () => {
  it("amorce « Invitation » et « Réinitialisation » à la première lecture, avec {{lien}} obligatoire, sans doublon à la lecture suivante", async () => {
    const templates = await listTemplates();
    const byKey = Object.fromEntries(templates.map((t) => [t.key, t]));
    expect(Object.keys(byKey).sort()).toEqual(["invitation", "reinitialisation"]);
    expect(byKey.invitation).toMatchObject({ isSystem: true, requiredVariables: ["lien"], subject: "Votre accès au CRM de {{cabinet}}" });
    expect(byKey.invitation.body).toContain("Bonjour {{prenom}},");
    expect(byKey.invitation.body).toContain("{{lien}}");
    expect(byKey.reinitialisation).toMatchObject({ isSystem: true, requiredVariables: ["lien"], subject: "Réinitialisation de votre mot de passe" });
    expect(byKey.reinitialisation.body).toContain("{{lien}}");
    expect(await listTemplates()).toHaveLength(2);
  });
});

describe("modèle modifié (CRM-23, contrat 28)", () => {
  it("la prochaine invitation part avec le sujet et le texte enregistrés, variables remplacées, le lien en bouton", async () => {
    await updateTemplate("invitation", {
      subject: "Bienvenue chez {{cabinet}}, {{prenom}}",
      body: "Bonjour {{prenom}} {{nom}},\n\nVotre accès au CRM de {{cabinet}} est prêt.\n\n[Ouvrir mon accès]({{lien}})\n\nÀ bientôt.",
    });
    const to = `modele-${Date.now()}@exemple.fr`;
    await sendTemplatedEmail({
      to,
      template: "invitation",
      variables: { prenom: "Ana", nom: "Martin", cabinet: "Cabinet Test", lien: "http://localhost:3000/invitation/xyz" },
    });
    const mail = await lastEmailTo(to);
    expect(mail?.subject).toBe("Bienvenue chez Cabinet Test, Ana");
    expect(mail?.body).toContain("Bonjour Ana Martin,");
    expect(mail?.body).toContain("Votre accès au CRM de Cabinet Test est prêt.");
    expect(mail?.body).toContain("Ouvrir mon accès");
    expect(mail?.body).not.toContain("{{");
    expect(mail?.links).toContain("http://localhost:3000/invitation/xyz");
    expect((await listTemplates()).find((t) => t.key === "invitation")?.subject).toBe("Bienvenue chez {{cabinet}}, {{prenom}}");
  });
});
