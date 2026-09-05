import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as resendRoute } from "@/app/api/emails/journal/[id]/renvoyer/route";
import { emailLog, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-renvoi-reinit@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Renvoi-1", role: "administrateur" as const };
const DISABLED = { email: "desactive-renvoi@exemple.fr", firstName: "Paul", lastName: "Petit", password: "MotDePasse-Desactive-1", role: "membre" as const };

let adminCookie: string;

beforeAll(async () => {
  await db.delete(emailLog);
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  const disabled = await createUserWithPassword(DISABLED);
  await db.update(user).set({ status: "desactive" }).where(eq(user.id, disabled.id));
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
});
afterAll(async () => {
  await closeDb();
});

/** Une réinitialisation en échec, telle que Resend l'aurait laissée dans le journal. */
async function insertFailedReset(to: string): Promise<string> {
  const [row] = await db
    .insert(emailLog)
    .values({ to, subject: "Réinitialisation de votre mot de passe", body: "<p>Réinitialisation</p>", template: "reinitialisation", status: "echec", errorReason: "Domaine non vérifié chez Resend" })
    .returning({ id: emailLog.id });
  return row.id;
}

const countLog = async () => (await db.select({ id: emailLog.id }).from(emailLog)).length;
const resend = (id: string) => resendRoute(jsonRequest("POST", `/api/emails/journal/${id}/renvoyer`, undefined, adminCookie), { params: Promise.resolve({ id }) });

describe("« Renvoyer » une réinitialisation vérifie le compte avant d'appeler Better Auth (CRM-24, D24)", () => {
  it("vers une adresse qui n'a plus de compte : 404 « compte_introuvable », aucune nouvelle ligne de journal", async () => {
    const id = await insertFailedReset("parti@exemple.fr");
    const before = await countLog();

    const res = await resend(id);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "compte_introuvable", message: "Aucun compte pour cette adresse." });
    expect(await countLog()).toBe(before);
  });

  it("vers un compte désactivé : 409 « compte_desactive », aucune nouvelle ligne de journal", async () => {
    const id = await insertFailedReset(DISABLED.email);
    const before = await countLog();

    const res = await resend(id);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "compte_desactive", message: "Ce compte est désactivé." });
    expect(await countLog()).toBe(before);
  });
});
