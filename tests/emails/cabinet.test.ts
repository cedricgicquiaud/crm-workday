import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cabinetSettings } from "@/db/schema";
import { closeDb, db } from "@/lib/db";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { getCabinetSettings, saveCabinetSettings } from "@/lib/mail/settings";
import { lastEmailTo } from "../helpers/mailbox";

beforeAll(async () => {
  await db.delete(cabinetSettings);
});
afterAll(async () => {
  await db.delete(cabinetSettings);
  await closeDb();
});

describe("paramètres du cabinet (CRM-22, D20)", () => {
  it("enregistre le nom du cabinet, le nom d'affichage et l'adresse d'expédition, puis les relit", async () => {
    expect(await getCabinetSettings()).toBeNull();
    await saveCabinetSettings({ name: "Cabinet Martin", senderName: "Cabinet Martin", senderEmail: "contact@cabinet-martin.fr" });
    expect(await getCabinetSettings()).toMatchObject({ name: "Cabinet Martin", senderName: "Cabinet Martin", senderEmail: "contact@cabinet-martin.fr" });
    /* Une seule ligne : enregistrer de nouveau remplace, n'ajoute pas. */
    await saveCabinetSettings({ name: "Cabinet Martin & Fils", senderName: "Martin & Fils", senderEmail: "bonjour@cabinet-martin.fr" });
    expect(await getCabinetSettings()).toMatchObject({ name: "Cabinet Martin & Fils", senderEmail: "bonjour@cabinet-martin.fr" });
    expect(await db.select().from(cabinetSettings)).toHaveLength(1);
  });

  it("remplace {{cabinet}} par le nom enregistré dans la prochaine invitation, même si l'appelant passe « votre cabinet » (contrat 27)", async () => {
    await saveCabinetSettings({ name: "Cabinet Martin", senderName: "Cabinet Martin", senderEmail: "contact@cabinet-martin.fr" });
    const to = `cabinet-${Date.now()}@exemple.fr`;
    await sendTemplatedEmail({
      to,
      template: "invitation",
      variables: { prenom: "Ana", nom: "Martin", cabinet: "votre cabinet", lien: "http://localhost:3000/invitation/abc" },
    });
    const mail = await lastEmailTo(to);
    expect(mail?.subject).toBe("Votre accès au CRM de Cabinet Martin");
    expect(mail?.body).toContain("CRM de Cabinet Martin");
    expect(mail?.body).not.toContain("votre cabinet");
  });
});
