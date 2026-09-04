import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-admin";
import { user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-connexion@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Connexion-1" };

/** Tentative de connexion telle que le navigateur l'envoie : POST /api/auth/sign-in/email. */
async function signIn(email: string, password: string) {
  const res = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
  return { status: res.status, body: await res.json(), setCookie: res.headers.get("set-cookie") };
}

beforeAll(async () => {
  await db.delete(user);
  await seedAdmin(ADMIN);
});
afterAll(closeDb);

describe("connexion (CRM-14)", () => {
  it("refuse un email inconnu et un mot de passe faux avec exactement le même message (contrat 14)", async () => {
    const unknown = await signIn("inconnu@exemple.fr", "MotDePasse-Faux-1");
    const wrong = await signIn(ADMIN.email, "MotDePasse-Faux-1");
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.setCookie).toBeNull();
  });

  it("refuse la sixième tentative en 15 minutes sur une adresse, même avec le bon mot de passe, avec le même message (contrat 15)", async () => {
    const target = { email: "cible-limitation@exemple.fr", firstName: "Bob", lastName: "Martin", password: "MotDePasse-Cible-1" };
    await db.delete(user);
    await seedAdmin(target);
    const refused = await signIn("inconnu@exemple.fr", "MotDePasse-Faux-1");
    for (let i = 0; i < 5; i++) await signIn(target.email, "MotDePasse-Faux-1");
    const sixth = await signIn(target.email, target.password);
    expect(sixth.status).toBe(401);
    expect(sixth.body).toEqual(refused.body);
    expect(sixth.setCookie).toBeNull();
  });
});
