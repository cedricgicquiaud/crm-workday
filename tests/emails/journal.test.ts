import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as journalRoute } from "@/app/api/emails/journal/route";
import { cabinetSettings, emailLog, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { listEmailLog } from "@/lib/mail/journal";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { saveCabinetSettings } from "@/lib/mail/settings";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-journal@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Journal-1", role: "administrateur" as const };
const MEMBER = { email: "membre-journal@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };
const VARIABLES = { prenom: "Ana", nom: "Martin", cabinet: "votre cabinet", lien: "http://localhost:3000/invitation/abc" };

let adminId: string;
let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  await db.delete(emailLog);
  await db.delete(cabinetSettings);
  await db.delete(user);
  adminId = (await createUserWithPassword(ADMIN)).id;
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await db.delete(cabinetSettings);
  await closeDb();
});

describe("journal des envois (CRM-24, contrat 29, D23)", () => {
  it("rend chaque envoi avec destinataire, sujet, modèle, date, statut, auteur et référence d'objet, et se filtre par statut, date et objet", async () => {
    await sendTemplatedEmail({ to: "capture-journal@exemple.fr", template: "invitation", variables: VARIABLES, authorId: adminId, objectRef: { type: "user", id: "u-1" } });
    await sendTemplatedEmail({ to: "systeme-journal@exemple.fr", template: "reinitialisation", variables: VARIABLES });
    /* Un échec, par le chemin réel sans expéditeur configuré. */
    await sendTemplatedEmail({ to: "echec-journal@exemple.fr", template: "invitation", variables: VARIABLES, authorId: adminId }, { transport: { send: async () => ({ id: "x" }) } });

    const all = await listEmailLog({});
    expect(all.map((e) => e.to)).toEqual(["echec-journal@exemple.fr", "systeme-journal@exemple.fr", "capture-journal@exemple.fr"]);
    const captured = all.find((e) => e.to === "capture-journal@exemple.fr")!;
    expect(captured).toMatchObject({ subject: "Votre accès au CRM de votre cabinet", template: "invitation", status: "capture", errorReason: null, objectType: "user", objectId: "u-1" });
    expect(captured.author).toEqual({ id: adminId, name: "Alice Durand" });
    expect(captured.createdAt).toBeInstanceOf(Date);
    expect(all.find((e) => e.to === "systeme-journal@exemple.fr")?.author).toBeNull();
    expect(all.find((e) => e.to === "echec-journal@exemple.fr")).toMatchObject({ status: "echec", errorReason: "expéditeur non configuré" });

    expect((await listEmailLog({ status: "echec" })).map((e) => e.to)).toEqual(["echec-journal@exemple.fr"]);
    expect((await listEmailLog({ objectType: "user", objectId: "u-1" })).map((e) => e.to)).toEqual(["capture-journal@exemple.fr"]);
    expect((await listEmailLog({ objectType: "user" })).map((e) => e.to)).toEqual(["capture-journal@exemple.fr"]);
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000);
    expect(await listEmailLog({ from: inAnHour })).toEqual([]);
    expect(await listEmailLog({ to: new Date(Date.now() - 60 * 60 * 1000) })).toEqual([]);
    expect(await listEmailLog({ from: new Date(Date.now() - 60 * 60 * 1000), to: inAnHour })).toHaveLength(3);
  });
});

describe("API du journal (CRM-24, contrat 16, D11)", () => {
  it("un membre lit le journal filtré ; sans session, 401 ; un filtre mal formé répond 400", async () => {
    expect((await journalRoute(jsonRequest("GET", "/api/emails/journal"))).status).toBe(401);
    const asMember = await journalRoute(jsonRequest("GET", "/api/emails/journal", undefined, memberCookie));
    expect(asMember.status).toBe(200);
    const { entries } = (await asMember.json()) as { entries: { to: string; status: string; author: { name: string } | null }[] };
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.find((e) => e.to === "capture-journal@exemple.fr")?.author?.name).toBe("Alice Durand");

    const failed = await journalRoute(jsonRequest("GET", "/api/emails/journal?status=echec", undefined, adminCookie));
    const failedEntries = ((await failed.json()) as { entries: { to: string; status: string }[] }).entries;
    expect(failedEntries.length).toBeGreaterThanOrEqual(1);
    expect(failedEntries.every((e) => e.status === "echec")).toBe(true);
    const byObject = await journalRoute(jsonRequest("GET", "/api/emails/journal?objectType=user&objectId=u-1", undefined, memberCookie));
    expect(((await byObject.json()) as { entries: { to: string }[] }).entries.map((e) => e.to)).toEqual(["capture-journal@exemple.fr"]);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const none = await journalRoute(jsonRequest("GET", `/api/emails/journal?from=${encodeURIComponent(future)}`, undefined, memberCookie));
    expect(((await none.json()) as { entries: unknown[] }).entries).toEqual([]);
    expect((await journalRoute(jsonRequest("GET", "/api/emails/journal?status=inconnu", undefined, memberCookie))).status).toBe(400);
    expect((await journalRoute(jsonRequest("GET", "/api/emails/journal?from=hier", undefined, memberCookie))).status).toBe(400);
  });
});
