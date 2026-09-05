import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { PATCH as updateAccount } from "@/app/api/accounts/[id]/route";
import { POST as createAccount } from "@/app/api/accounts/route";
import { POST as acceptInvitation } from "@/app/api/invitations/[token]/route";
import { POST as resendInvitation } from "@/app/api/invitations/renvoyer/route";
import { invitation, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import { lastEmailTo } from "../helpers/mailbox";

const ADMIN = { email: "admin-invites@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Invites-1", role: "administrateur" as const };

let adminCookie: string;

const patch = (id: string, body: unknown) => updateAccount(jsonRequest("PATCH", `/api/accounts/${id}`, body, adminCookie), { params: Promise.resolve({ id }) });

const accept = (token: string, password: string) =>
  acceptInvitation(jsonRequest("POST", `/api/invitations/${token}`, { password }), { params: Promise.resolve({ token }) });

/** Crée un compte invité depuis l'écran des comptes et rend son identifiant et le jeton du lien reçu. */
async function inviteAndReadToken(email: string): Promise<{ userId: string; token: string }> {
  const res = await createAccount(jsonRequest("POST", "/api/accounts", { email, firstName: "Inès", lastName: "Roux", role: "membre" }, adminCookie));
  expect(res.status).toBe(201);
  const { userId } = (await res.json()) as { userId: string };
  const mail = await lastEmailTo(email);
  const token = mail!.links.find((l) => l.includes("/invitation/"))!.split("/invitation/")[1];
  return { userId, token };
}

const statusOf = async (id: string) => (await db.select({ status: user.status }).from(user).where(eq(user.id, id)))[0].status;

beforeAll(async () => {
  await db.delete(user);
  await createUserWithPassword(ADMIN);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
});
afterAll(closeDb);

describe("désactivation d'un compte encore invité (CRM-19, D12, contrat 7)", () => {
  it("expire ses invitations ouvertes : le lien reçu avant la désactivation répond 410 et le compte reste désactivé", async () => {
    const { userId, token } = await inviteAndReadToken("invite-desactive@exemple.fr");
    expect((await patch(userId, { status: "desactive" })).status).toBe(200);
    expect(await statusOf(userId)).toBe("desactive");

    const open = await db
      .select({ expiresAt: invitation.expiresAt })
      .from(invitation)
      .where(and(eq(invitation.userId, userId), isNull(invitation.usedAt)));
    expect(open).toHaveLength(1);
    expect(open[0].expiresAt.getTime()).toBeLessThanOrEqual(Date.now());

    const accepted = await accept(token, "MotDePasse-Ines-1");
    expect(accepted.status).toBe(410);
    expect(await accepted.json()).toMatchObject({ error: "lien_invalide" });
    expect(await statusOf(userId)).toBe("desactive");
  });
});

describe("réactivation d'un compte (CRM-19, D12)", () => {
  it("rend un compte « invité puis désactivé » à l'état invité, ce qui permet « Renvoyer l'invitation »", async () => {
    const { userId } = await inviteAndReadToken("invite-reactive@exemple.fr");
    expect((await patch(userId, { status: "desactive" })).status).toBe(200);
    expect((await patch(userId, { status: "actif" })).status).toBe(200);
    expect(await statusOf(userId)).toBe("invite");

    const resent = await resendInvitation(jsonRequest("POST", "/api/invitations/renvoyer", { email: "invite-reactive@exemple.fr" }, adminCookie));
    expect(resent.status).toBe(200);
  });

  it("rend un compte avec mot de passe à l'état actif", async () => {
    const member = { email: "membre-reactive@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };
    const { id } = await createUserWithPassword(member);
    expect((await patch(id, { status: "desactive" })).status).toBe(200);
    expect((await patch(id, { status: "actif" })).status).toBe(200);
    expect(await statusOf(id)).toBe("actif");
  });
});
