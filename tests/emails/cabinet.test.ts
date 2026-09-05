import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cabinetSettings } from "@/db/schema";
import { closeDb, db } from "@/lib/db";
import { getCabinetSettings, saveCabinetSettings } from "@/lib/mail/settings";

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
});
