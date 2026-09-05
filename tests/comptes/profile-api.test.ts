import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as readProfile } from "@/app/api/profile/route";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

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
