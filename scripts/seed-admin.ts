/**
 * Crée le premier administrateur (décision D8, tâche CRM-17).
 *   npm run seed:admin -- --email admin@exemple.fr --prenom Alice --nom Durand --mot-de-passe 'MotDePasse-Recette-1'
 * ou, sans arguments, depuis SEED_ADMIN_EMAIL, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME,
 * SEED_ADMIN_PASSWORD. Refuse de s'exécuter si un administrateur existe déjà.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "@/db/schema";
import { closeDb, db } from "@/lib/db";

export type SeedAdminInput = { email: string; firstName: string; lastName: string; password: string };

export async function seedAdmin(input: SeedAdminInput): Promise<{ id: string }> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id,
      name: `${input.firstName} ${input.lastName}`.trim(),
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      firstName: input.firstName,
      lastName: input.lastName,
      role: "administrateur",
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

async function main() {
  const { loadDotenv } = await import("@/lib/dotenv");
  loadDotenv();
  await seedAdmin({
    email: process.env.SEED_ADMIN_EMAIL ?? "",
    firstName: process.env.SEED_ADMIN_FIRST_NAME ?? "",
    lastName: process.env.SEED_ADMIN_LAST_NAME ?? "",
    password: process.env.SEED_ADMIN_PASSWORD ?? "",
  });
  console.log("Administrateur créé.");
  await closeDb();
}

if (process.argv[1] && process.argv[1].endsWith("seed-admin.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
