import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailTemplate } from "@/db/schema";
import { closeDb, db } from "@/lib/db";
import { listTemplates } from "@/lib/mail/templates";

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
