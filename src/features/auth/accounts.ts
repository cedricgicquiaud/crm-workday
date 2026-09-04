/**
 * Comptes utilisateurs côté serveur : création avec mot de passe (amorce, invitation acceptée).
 * Un compte à mot de passe est, pour Better Auth 1.7, une ligne `account` d'émetteur
 * `local:credential` dont `accountId` est l'identifiant de l'utilisateur.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "@/db/schema";
import { db } from "@/lib/db";

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
    await tx.insert(account).values({
      id: randomUUID(),
      issuer: "local:credential",
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(input.password),
    });
  });
  return { id };
}
