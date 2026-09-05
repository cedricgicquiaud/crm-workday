import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as readCabinet, PUT as writeCabinet } from "@/app/api/cabinet/route";
import { cabinetSettings, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { getCabinetSettings, saveCabinetSettings } from "@/lib/mail/settings";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import { lastEmailTo } from "../helpers/mailbox";

const ADMIN = { email: "admin-cabinet@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Cabinet-1", role: "administrateur" as const };
const MEMBER = { email: "membre-cabinet@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  await db.delete(cabinetSettings);
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
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

describe("API des paramètres du cabinet (CRM-22, contrat 16)", () => {
  it("répond 403 à un membre, 400 à une adresse d'expédition mal formée, et enregistre pour un administrateur", async () => {
    const settings = { name: "Cabinet Martin", senderName: "Cabinet Martin", senderEmail: "contact@cabinet-martin.fr" };
    const asMember = await writeCabinet(jsonRequest("PUT", "/api/cabinet", settings, memberCookie));
    expect(asMember.status).toBe(403);
    expect((await readCabinet(jsonRequest("GET", "/api/cabinet", undefined, memberCookie))).status).toBe(403);
    expect((await readCabinet(jsonRequest("GET", "/api/cabinet"))).status).toBe(401);

    const invalid = await writeCabinet(jsonRequest("PUT", "/api/cabinet", { ...settings, senderEmail: "pas-une-adresse" }, adminCookie));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "donnees_invalides" });
    const empty = await writeCabinet(jsonRequest("PUT", "/api/cabinet", { ...settings, name: "  " }, adminCookie));
    expect(empty.status).toBe(400);

    const saved = await writeCabinet(jsonRequest("PUT", "/api/cabinet", settings, adminCookie));
    expect(saved.status).toBe(200);
    const read = await readCabinet(jsonRequest("GET", "/api/cabinet", undefined, adminCookie));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ settings });
  });
});
