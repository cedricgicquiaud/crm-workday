import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as createInvitation } from "@/app/api/invitations/route";
import { POST as acceptInvitation } from "@/app/api/invitations/[token]/route";
import { POST as resendInvitation } from "@/app/api/invitations/renvoyer/route";
import { invitation, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { hashToken } from "@/features/auth/invitations";
import { getAuth } from "@/lib/auth";
import { closeDb, db } from "@/lib/db";
import { lastEmailTo } from "../helpers/mailbox";

const HOUR_MS = 60 * 60 * 1000;

const ADMIN = { email: "admin-invitations@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Invit-1", role: "administrateur" as const };
const MEMBER = { email: "membre-invitations@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Membre-1", role: "membre" as const };

/** Connexion par l'API, puis cookie de session tel que le navigateur le renverrait. */
async function sessionCookie(email: string, password: string): Promise<string> {
  const res = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).join("; ");
}

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** Invite une adresse en tant qu'administrateur et rend le jeton du lien reçu. */
async function inviteAndReadToken(email: string, firstName = "Inès"): Promise<string> {
  const res = await createInvitation(post("/api/invitations", { email, firstName, lastName: "Roux", role: "membre" }, adminCookie));
  expect(res.status).toBe(201);
  const mail = await lastEmailTo(email);
  return mail!.links.find((l) => l.includes("/invitation/"))!.split("/invitation/")[1];
}

const accept = (token: string, password: string) =>
  acceptInvitation(post(`/api/invitations/${token}`, { password }), { params: Promise.resolve({ token }) });

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

describe("API des invitations (CRM-15)", () => {
  it("refuse la création à un membre (403) et sans session (401) : requireAdmin() (contrat 16)", async () => {
    const invitee = { email: "invite@exemple.fr", firstName: "Inès", lastName: "Roux", role: "membre" };
    const asMember = await createInvitation(post("/api/invitations", invitee, memberCookie));
    expect(asMember.status).toBe(403);
    const anonymous = await createInvitation(post("/api/invitations", invitee));
    expect(anonymous.status).toBe(401);
    expect(await db.select().from(user).where(eq(user.email, invitee.email))).toHaveLength(0);
  });

  it("crée un compte « invité » et envoie un lien d'invitation valable 72 heures, jeton haché en base (D7)", async () => {
    const invitee = { email: "invitee-ok@exemple.fr", firstName: "Inès", lastName: "Roux", role: "membre" };
    const res = await createInvitation(post("/api/invitations", invitee, adminCookie));
    expect(res.status).toBe(201);
    const [created] = await db.select().from(user).where(eq(user.email, invitee.email));
    expect(created.status).toBe("invite");
    expect(created.role).toBe("membre");
    expect(created.firstName).toBe("Inès");
    const mail = await lastEmailTo(invitee.email);
    expect(mail?.template).toBe("invitation");
    const link = mail?.links.find((l) => l.includes("/invitation/"));
    expect(link).toBeDefined();
    const token = link!.split("/invitation/")[1];
    const [row] = await db.select().from(invitation).where(eq(invitation.userId, created.id));
    expect(row.tokenHash).not.toBe(token);
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * HOUR_MS);
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThan(73 * HOUR_MS);
  });

  it("connecte l'invité qui choisit son mot de passe et active son compte ; il peut ensuite se reconnecter (contrat 6)", async () => {
    const email = "invitee-accepte@exemple.fr";
    const token = await inviteAndReadToken(email);
    const res = await accept(token, "MotDePasse-Invite-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/session_token/);
    const [activated] = await db.select().from(user).where(eq(user.email, email));
    expect(activated.status).toBe("actif");
    const [row] = await db.select().from(invitation).where(eq(invitation.userId, activated.id));
    expect(row.usedAt).not.toBeNull();
    await sessionCookie(email, "MotDePasse-Invite-1");
  });

  it("refuse un lien déjà utilisé ou expiré avec « lien invalide » sans rien changer (contrat 12)", async () => {
    const used = await inviteAndReadToken("invitee-utilise@exemple.fr");
    expect((await accept(used, "MotDePasse-Invite-1")).status).toBe(200);
    const again = await accept(used, "MotDePasse-Autre-1");
    expect(again.status).toBe(410);
    expect(await again.json()).toMatchObject({ error: "lien_invalide" });
    expect(again.headers.get("set-cookie")).toBeNull();

    const expiredEmail = "invitee-expire@exemple.fr";
    const expired = await inviteAndReadToken(expiredEmail);
    await db.update(invitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitation.tokenHash, hashToken(expired)));
    const late = await accept(expired, "MotDePasse-Invite-1");
    expect(late.status).toBe(410);
    const [stillInvited] = await db.select().from(user).where(eq(user.email, expiredEmail));
    expect(stillInvited.status).toBe("invite");
  });

  it("rejette un mot de passe de 11 caractères avec le message de la règle, le lien reste valable (contrat 13)", async () => {
    const token = await inviteAndReadToken("invitee-court@exemple.fr");
    const short = await accept(token, "Court-Mdp-1");
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ message: "Le mot de passe doit contenir 12 caractères au moins." });
    expect((await accept(token, "MotDePasse-Invite-1")).status).toBe(200);
  });

  it("refuse d'inviter un email qui a déjà un compte (409) et dit s'il est désactivé (D12)", async () => {
    const body = { email: MEMBER.email, firstName: "X", lastName: "Y", role: "membre" };
    const active = await createInvitation(post("/api/invitations", body, adminCookie));
    expect(active.status).toBe(409);
    expect(await active.json()).toMatchObject({ error: "email_deja_utilise", status: "actif" });
    await db.update(user).set({ status: "desactive" }).where(eq(user.email, MEMBER.email));
    const disabled = await createInvitation(post("/api/invitations", body, adminCookie));
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toMatchObject({ error: "email_deja_utilise", status: "desactive" });
    await db.update(user).set({ status: "actif" }).where(eq(user.email, MEMBER.email));
  });

  it("« Renvoyer l'invitation » envoie un lien neuf et invalide l'ancien (D7)", async () => {
    const email = "invitee-renvoi@exemple.fr";
    const first = await inviteAndReadToken(email);
    const res = await resendInvitation(post("/api/invitations/renvoyer", { email }, adminCookie));
    expect(res.status).toBe(200);
    const second = (await lastEmailTo(email))!.links.find((l) => l.includes("/invitation/"))!.split("/invitation/")[1];
    expect(second).not.toBe(first);
    expect((await accept(first, "MotDePasse-Invite-1")).status).toBe(410);
    expect((await accept(second, "MotDePasse-Invite-1")).status).toBe(200);
    const asMember = await resendInvitation(post("/api/invitations/renvoyer", { email }, memberCookie));
    expect(asMember.status).toBe(403);
  });
});
