import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as listAccounts } from "@/app/api/accounts/route";
import { user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createInvitation } from "@/features/auth/invitations";
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
  });
});

describe("liste des comptes (CRM-18)", () => {
  it("rend chaque compte avec email, prénom, nom, rôle et état invité / actif / désactivé", async () => {
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, ADMIN.email));
    await createInvitation({ email: "invite-liste@exemple.fr", firstName: "Inès", lastName: "Roux", role: "membre", authorId: admin.id });
    const disabled = { email: "desactive-liste@exemple.fr", firstName: "Dan", lastName: "Petit", password: "MotDePasse-Desactive-1", role: "membre" as const };
    await createUserWithPassword(disabled);
    await db.update(user).set({ status: "desactive" }).where(eq(user.email, disabled.email));

    const res = await listAccounts(jsonRequest("GET", "/api/accounts", undefined, adminCookie));
    expect(res.status).toBe(200);
    const { accounts } = (await res.json()) as { accounts: { email: string; firstName: string; lastName: string; role: string; status: string }[] };
    const byEmail = Object.fromEntries(accounts.map((a) => [a.email, a]));
    expect(byEmail[ADMIN.email]).toMatchObject({ firstName: "Alice", lastName: "Durand", role: "administrateur", status: "actif" });
    expect(byEmail[MEMBER.email]).toMatchObject({ role: "membre", status: "actif" });
    expect(byEmail["invite-liste@exemple.fr"]).toMatchObject({ firstName: "Inès", status: "invite" });
    expect(byEmail[disabled.email]).toMatchObject({ status: "desactive" });
    expect(accounts.every((a) => typeof (a as { id?: string }).id === "string")).toBe(true);
  });
});
