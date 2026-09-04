import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedAdmin } from "../../scripts/seed-admin";
import { loginAttempt, session, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { HttpError, requireSession } from "@/lib/auth/session";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ce que le navigateur renvoie ensuite : le cookie de session tel que posé par la connexion. */
function cookieHeader(setCookie: string | null): string {
  return (setCookie ?? "").split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).join("; ");
}

async function getSession(cookie: string) {
  const res = await getAuth().handler(new Request("http://localhost:3000/api/auth/get-session", { headers: { cookie } }));
  return res.json();
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

  it("accepte de nouveau le bon mot de passe une fois le délai de 15 minutes écoulé (contrat 15)", async () => {
    const target = { email: "cible-deverrouillage@exemple.fr", firstName: "Bob", lastName: "Martin", password: "MotDePasse-Cible-2" };
    await db.delete(user);
    await seedAdmin(target);
    for (let i = 0; i < 5; i++) await signIn(target.email, "MotDePasse-Faux-1");
    expect((await signIn(target.email, target.password)).status).toBe(401);

    // Seize minutes plus tard : les échecs sont sortis de la fenêtre, le verrou est levé.
    const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
    await db.update(loginAttempt).set({ createdAt: sixteenMinutesAgo }).where(eq(loginAttempt.email, target.email));
    const unlocked = await signIn(target.email, target.password);
    expect(unlocked.status).toBe(200);
    expect(unlocked.setCookie).toMatch(/session_token/);
  });

  it("refuse un compte désactivé avec le même message qu'un mot de passe faux (D12, contrat 14)", async () => {
    const disabled = { email: "desactive@exemple.fr", firstName: "Dan", lastName: "Petit", password: "MotDePasse-Desactive-1" };
    await db.delete(user);
    await seedAdmin(disabled);
    await db.update(user).set({ status: "desactive" }).where(eq(user.email, disabled.email));
    const refused = await signIn("inconnu@exemple.fr", "MotDePasse-Faux-1");
    const attempt = await signIn(disabled.email, disabled.password);
    expect(attempt.status).toBe(401);
    expect(attempt.body).toEqual(refused.body);
    expect(attempt.setCookie).toBeNull();
  });

  it("refuse un compte désactivé dont la session est encore ouverte : requireSession() répond 401 (D12)", async () => {
    const target = { email: "desactive-session@exemple.fr", firstName: "Eve", lastName: "Morel", password: "MotDePasse-Session-1" };
    await db.delete(user);
    await seedAdmin(target);
    const login = await signIn(target.email, target.password);
    expect(login.status).toBe(200);
    const cookie = cookieHeader(login.setCookie);
    const request = () => new Request("http://localhost:3000/api/invitations", { headers: { cookie } });
    expect((await requireSession(request())).user.email).toBe(target.email);

    await db.update(user).set({ status: "desactive" }).where(eq(user.email, target.email));
    const refused = await requireSession(request()).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(HttpError);
    expect((refused as HttpError).status).toBe(401);
  });

  it("garde connecté un membre actif au jour 29 jusqu'au jour 45, et déconnecte un membre inactif 31 jours (contrat 8)", async () => {
    await db.delete(user);
    await seedAdmin(ADMIN);
    const login = await signIn(ADMIN.email, ADMIN.password);
    expect(login.status).toBe(200);
    const cookie = cookieHeader(login.setCookie);
    const [created] = await db.select().from(session);

    // Jour 29 : session ouverte il y a 29 jours, il lui reste 1 jour ; une activité la repousse de 30 jours.
    const day29 = new Date(Date.now() - 29 * DAY_MS);
    await db.update(session).set({ createdAt: day29, updatedAt: day29, expiresAt: new Date(Date.now() + 1 * DAY_MS) }).where(eq(session.id, created.id));
    const active = await getSession(cookie);
    expect(active?.user?.email).toBe(ADMIN.email);
    const [refreshed] = await db.select().from(session).where(eq(session.id, created.id));
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(Date.now() + 16 * DAY_MS);

    // Inactif 31 jours : la session a expiré hier, il faut se reconnecter.
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1 * DAY_MS) }).where(eq(session.id, created.id));
    expect(await getSession(cookie)).toBeNull();
  });
});
