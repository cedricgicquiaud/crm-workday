import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { getAuth } from "@/lib/auth";
import { closeDb, db } from "@/lib/db";
import { lastEmailTo } from "../helpers/mailbox";

const ACTIVE = { email: "actif-reset@exemple.fr", firstName: "Nora", lastName: "Simon", password: "MotDePasse-Ancien-1", role: "membre" as const };

function authPost(path: string, body: unknown) {
  return getAuth().handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
}

const signIn = (email: string, password: string) => authPost("/sign-in/email", { email, password });
const forgot = (email: string) => authPost("/request-password-reset", { email });

async function readResetToken(email: string): Promise<string> {
  const mail = await lastEmailTo(email);
  expect(mail?.template).toBe("reinitialisation");
  return mail!.links.find((l) => l.includes("/reinitialisation/"))!.split("/reinitialisation/")[1];
}

beforeAll(async () => {
  await db.delete(user);
  await createUserWithPassword(ACTIVE);
});
afterAll(closeDb);

describe("mot de passe oublié (CRM-16)", () => {
  it("envoie un lien qui permet de choisir un nouveau mot de passe ; l'ancien ne fonctionne plus (contrat 9)", async () => {
    expect((await forgot(ACTIVE.email)).status).toBe(200);
    const token = await readResetToken(ACTIVE.email);
    const reset = await authPost("/reset-password", { token, newPassword: "MotDePasse-Nouveau-1" });
    expect(reset.status).toBe(200);
    expect((await signIn(ACTIVE.email, ACTIVE.password)).status).toBe(401);
    expect((await signIn(ACTIVE.email, "MotDePasse-Nouveau-1")).status).toBe(200);
  });

  it("répond pareil pour un email inconnu ou un compte désactivé, sans rien envoyer (contrat 14)", async () => {
    const disabled = { email: "desactive-reset@exemple.fr", firstName: "Dan", lastName: "Petit", password: "MotDePasse-Desactive-1", role: "membre" as const };
    await createUserWithPassword(disabled);
    await db.update(user).set({ status: "desactive" }).where(eq(user.email, disabled.email));

    const known = await forgot(ACTIVE.email);
    const unknown = await forgot("inconnu-reset@exemple.fr");
    const deactivated = await forgot(disabled.email);
    expect(unknown.status).toBe(200);
    expect(deactivated.status).toBe(200);
    const expected = await known.json();
    expect(await unknown.json()).toEqual(expected);
    expect(await deactivated.json()).toEqual(expected);
    expect(await lastEmailTo("inconnu-reset@exemple.fr")).toBeNull();
    expect(await lastEmailTo(disabled.email)).toBeNull();
  });
});
