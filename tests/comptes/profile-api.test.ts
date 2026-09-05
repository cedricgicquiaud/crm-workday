import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as readProfile, PATCH as updateProfile } from "@/app/api/profile/route";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { requireSession } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie, signIn } from "../helpers/auth";

const MEMBER = { email: "membre-profil@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Profil-1", role: "membre" as const };

let cookie: string;

beforeAll(async () => {
  await db.delete(user);
  await createUserWithPassword(MEMBER);
  cookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(closeDb);

describe("Mon profil (CRM-21, D13)", () => {
  it("rend le prénom, le nom et l'email de la personne connectée, et 401 sans session", async () => {
    const res = await readProfile(jsonRequest("GET", "/api/profile", undefined, cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ firstName: "Marc", lastName: "Leroy", email: MEMBER.email });
    expect((await readProfile(jsonRequest("GET", "/api/profile"))).status).toBe(401);
  });
});

describe("identité (CRM-21)", () => {
  it("modifie le prénom et le nom ; la session, d'où vient la salutation d'Accueil, les rend aussitôt", async () => {
    const res = await updateProfile(jsonRequest("PATCH", "/api/profile", { firstName: "  Marco ", lastName: "Leroy-Dupont" }, cookie));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(user).where(eq(user.email, MEMBER.email));
    expect(row).toMatchObject({ firstName: "Marco", lastName: "Leroy-Dupont", name: "Marco Leroy-Dupont" });
    const session = await requireSession(new Request("http://localhost:3000/accueil", { headers: { cookie } }));
    expect(session.user.firstName).toBe("Marco");

    expect((await updateProfile(jsonRequest("PATCH", "/api/profile", { firstName: "", lastName: "Leroy" }, cookie))).status).toBe(400);
    expect((await updateProfile(jsonRequest("PATCH", "/api/profile", { firstName: "Marc", lastName: "Leroy" }))).status).toBe(401);
    await updateProfile(jsonRequest("PATCH", "/api/profile", { firstName: "Marc", lastName: "Leroy" }, cookie));
  });
});

describe("mot de passe (CRM-21, contrat 13, D9)", () => {
  it("rejette un nouveau mot de passe de 11 caractères avec le message de la règle, refuse un ancien mot de passe faux, puis remplace le mot de passe", async () => {
    const body = (currentPassword: string, newPassword: string) => jsonRequest("PATCH", "/api/profile", { currentPassword, newPassword }, cookie);
    const short = await updateProfile(body(MEMBER.password, "Court-Mdp-1"));
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ message: "Le mot de passe doit contenir 12 caractères au moins." });

    const wrong = await updateProfile(body("MotDePasse-Faux-1", "MotDePasse-Profil-2"));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: "mot_de_passe_actuel_incorrect", message: "Le mot de passe actuel est incorrect." });
    expect((await signIn(MEMBER.email, MEMBER.password)).status).toBe(200);

    const changed = await updateProfile(body(MEMBER.password, "MotDePasse-Profil-2"));
    expect(changed.status).toBe(200);
    expect((await signIn(MEMBER.email, MEMBER.password)).status).toBe(401);
    expect((await signIn(MEMBER.email, "MotDePasse-Profil-2")).status).toBe(200);
  });
});
