/**
 * Invitations (D7) : un administrateur crée un compte « invité » ; l'invité reçoit un lien
 * de 72 heures, à usage unique, pour choisir son mot de passe. Seul le haché du jeton est
 * conservé : un lecteur de la base ne peut pas se connecter à la place de l'invité.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { invitation, user } from "@/db/schema";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendTemplatedEmail } from "@/lib/mail/send";
import { setPassword, type Role } from "./accounts";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "./password-rule";

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
/** Nom du cabinet dans les emails, en attendant ses paramètres (livraison 1.4). */
const CABINET = "le cabinet";

export type NewInvitation = { email: string; firstName: string; lastName: string; role: Role; authorId: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Nouveau lien pour cet utilisateur ; les liens encore ouverts expirent à l'instant. */
async function issueInvitationLink(target: { id: string; email: string; firstName: string; lastName: string }, authorId: string) {
  await db.update(invitation).set({ expiresAt: new Date() }).where(and(eq(invitation.userId, target.id), isNull(invitation.usedAt)));
  const token = randomBytes(32).toString("base64url");
  await db.insert(invitation).values({
    userId: target.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    createdBy: authorId,
  });
  await sendTemplatedEmail({
    to: target.email,
    template: "invitation",
    variables: { prenom: target.firstName, nom: target.lastName, cabinet: CABINET, lien: `${getEnv().APP_URL}/invitation/${token}` },
    authorId,
    objectRef: { type: "user", id: target.id },
  });
}

export async function createInvitation(input: NewInvitation): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ status: user.status }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    throw new HttpError(409, "email_deja_utilise", "Un compte existe déjà pour cet email.", { status: existing.status });
  }
  const userId = randomUUID();
  await db.insert(user).values({
    id: userId,
    name: `${input.firstName} ${input.lastName}`.trim(),
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    status: "invite",
  });
  await issueInvitationLink({ id: userId, email, firstName: input.firstName, lastName: input.lastName }, input.authorId);
  return { userId };
}

/** « Renvoyer l'invitation » d'un compte encore invité (D7). */
export async function resendInvitation(email: string, authorId: string): Promise<{ userId: string }> {
  const [target] = await db
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, status: user.status })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);
  if (!target || target.status !== "invite") throw new HttpError(404, "invitation_introuvable", "Aucun compte invité pour cet email.");
  await issueInvitationLink(target, authorId);
  return { userId: target.id };
}

/** Invitation encore valable pour ce jeton : ni utilisée, ni expirée. */
export async function findValidInvitation(token: string) {
  const [row] = await db
    .select({ id: invitation.id, userId: invitation.userId, email: user.email })
    .from(invitation)
    .innerJoin(user, eq(user.id, invitation.userId))
    .where(and(eq(invitation.tokenHash, hashToken(token)), isNull(invitation.usedAt), gt(invitation.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** L'invité choisit son mot de passe : le lien est consommé, le compte devient actif. */
export async function acceptInvitation(token: string, password: string): Promise<{ email: string }> {
  const valid = await findValidInvitation(token);
  if (!valid) throw new HttpError(410, "lien_invalide", "Ce lien est invalide : déjà utilisé ou expiré.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, "mot_de_passe_trop_court", PASSWORD_RULE);
  await setPassword(valid.userId, password);
  await db.update(user).set({ status: "actif", emailVerified: true, updatedAt: new Date() }).where(eq(user.id, valid.userId));
  await db.update(invitation).set({ usedAt: new Date() }).where(eq(invitation.id, valid.id));
  return { email: valid.email };
}
