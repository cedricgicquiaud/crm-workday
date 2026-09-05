import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listAccounts } from "@/app/api/accounts/route";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-comptes@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Comptes-1", role: "administrateur" as const };
const MEMBER = { email: "membre-comptes@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(closeDb);

describe("API des comptes : accès réservé aux administrateurs (CRM-20, contrat 16)", () => {
  it("répond 403 à un membre et 401 sans session sur la liste des comptes", async () => {
    const asMember = await listAccounts(jsonRequest("GET", "/api/accounts", undefined, memberCookie));
    expect(asMember.status).toBe(403);
    expect(await asMember.json()).toMatchObject({ error: "reserve_aux_administrateurs" });
    const anonymous = await listAccounts(jsonRequest("GET", "/api/accounts"));
    expect(anonymous.status).toBe(401);
    void adminCookie;
  });
});
