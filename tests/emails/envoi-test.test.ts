import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as sendTestRoute } from "@/app/api/emails/test/route";
import { cabinetSettings, emailLog, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { saveCabinetSettings } from "@/lib/mail/settings";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import { lastEmailTo } from "../helpers/mailbox";

const ADMIN = { email: "admin-test-envoi@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Test-1", role: "administrateur" as const };
const MEMBER = { email: "membre-test-envoi@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

let adminId: string;
let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  await db.delete(cabinetSettings);
  await db.delete(user);
  adminId = (await createUserWithPassword(ADMIN)).id;
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  await saveCabinetSettings({ name: "Cabinet Martin", senderName: "Cabinet Martin", senderEmail: "contact@cabinet-martin.fr" });
});
afterAll(async () => {
  await db.delete(cabinetSettings);
  await closeDb();
});

describe("envoi de test (CRM-25, contrats 30, 34, 35, 16)", () => {
  it("un administrateur envoie un email de test à sa propre adresse : capturé en test, journalisé à son nom ; un membre reçoit 403", async () => {
    expect((await sendTestRoute(jsonRequest("POST", "/api/emails/test", {}, memberCookie))).status).toBe(403);
    expect((await sendTestRoute(jsonRequest("POST", "/api/emails/test", {}))).status).toBe(401);

    const res = await sendTestRoute(jsonRequest("POST", "/api/emails/test", {}, adminCookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "capture", to: ADMIN.email });
    const mail = await lastEmailTo(ADMIN.email);
    expect(mail).toMatchObject({ template: "test", status: "capture" });
    expect(mail?.subject).toContain("Cabinet Martin");
    expect(mail?.body).toContain("Bonjour Alice");
    const [row] = await db.select().from(emailLog).where(eq(emailLog.id, mail!.id));
    expect(row.authorId).toBe(adminId);
  });

  it("refuse un destinataire qui n'est pas une adresse valide avant tout envoi : 400 et aucune ligne de journal", async () => {
    const res = await sendTestRoute(jsonRequest("POST", "/api/emails/test", { to: "pas-une-adresse" }, adminCookie));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "destinataire_invalide" });
    expect(await db.select().from(emailLog).where(eq(emailLog.to, "pas-une-adresse"))).toEqual([]);
    expect(await lastEmailTo("pas-une-adresse")).toBeNull();
  });
});
