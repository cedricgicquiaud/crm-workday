/**
 * Comptes utilisateurs côté serveur : création avec mot de passe (amorce, invitation acceptée).
 * Un compte à mot de passe est, pour Better Auth 1.7, une ligne `account` d'émetteur
 * `local:credential` dont `accountId` est l'identifiant de l'utilisateur.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { account, user } from "@/db/schema";
import { db } from "@/lib/db";

export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_RULE = `Le mot de passe doit contenir ${MIN_PASSWORD_LENGTH} caractères au moins.`;
const CREDENTIAL = { issuer: "local:credential", providerId: "credential" } as const;

export type Role = "administrateur" | "membre";

export type NewUserWithPassword = { email: string; firstName: string; lastName: string; password: string; role: Role };

export async function createUserWithPassword(input: NewUserWithPassword): Promise<{ id: string }> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id,
      name: `${input.firstName} ${input.lastName}`.trim(),
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: "actif",
    });
    await tx.insert(account).values({ id: randomUUID(), ...CREDENTIAL, accountId: id, userId: id, password: await hashPassword(input.password) });
  });
  return { id };
}

/** Pose ou remplace le mot de passe d'un utilisateur (invitation acceptée). */
export async function setPassword(userId: string, password: string): Promise<void> {
  const hashed = await hashPassword(password);
  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL.providerId)))
    .limit(1);
  if (existing) await db.update(account).set({ password: hashed, updatedAt: new Date() }).where(eq(account.id, existing.id));
  else await db.insert(account).values({ id: randomUUID(), ...CREDENTIAL, accountId: userId, userId, password: hashed });
}
