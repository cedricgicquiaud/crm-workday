import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { cabinetSettings, emailLog, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { listEmailLog } from "@/lib/mail/journal";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { saveCabinetSettings } from "@/lib/mail/settings";

const ADMIN = { email: "admin-journal@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Journal-1", role: "administrateur" as const };
const MEMBER = { email: "membre-journal@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };
const VARIABLES = { prenom: "Ana", nom: "Martin", cabinet: "votre cabinet", lien: "http://localhost:3000/invitation/abc" };

let adminId: string;

beforeAll(async () => {
  await db.delete(emailLog);
  await db.delete(cabinetSettings);
  await db.delete(user);
  adminId = (await createUserWithPassword(ADMIN)).id;
  await createUserWithPassword(MEMBER);
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
