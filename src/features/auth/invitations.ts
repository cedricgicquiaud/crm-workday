/**
 * Invitations (D7) : un administrateur crée un compte « invité » ; l'invité reçoit un lien
 * de 72 heures, à usage unique, pour choisir son mot de passe. Seul le haché du jeton est
 * conservé : un lecteur de la base ne peut pas se connecter à la place de l'invité.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { invitation, user } from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendTemplatedEmail } from "@/lib/mail/send";
import type { Role } from "./accounts";

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
/** Nom du cabinet dans les emails, en attendant ses paramètres (livraison 1.4). */
const CABINET = "le cabinet";

export type NewInvitation = { email: string; firstName: string; lastName: string; role: Role; authorId: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(input: NewInvitation): Promise<{ userId: string }> {
  const userId = randomUUID();
  await db.insert(user).values({
    id: userId,
    name: `${input.firstName} ${input.lastName}`.trim(),
    email: input.email.trim().toLowerCase(),
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    status: "invite",
  });
  const token = randomBytes(32).toString("base64url");
  await db.insert(invitation).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    createdBy: input.authorId,
  });
  await sendTemplatedEmail({
    to: input.email,
    template: "invitation",
    variables: { prenom: input.firstName, nom: input.lastName, cabinet: CABINET, lien: `${getEnv().APP_URL}/invitation/${token}` },
    authorId: input.authorId,
    objectRef: { type: "user", id: userId },
  });
  return { userId };
}
