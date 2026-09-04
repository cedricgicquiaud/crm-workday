/**
 * Crée le premier administrateur (décision D8, tâche CRM-17).
 *   npm run seed:admin -- --email admin@exemple.fr --prenom Alice --nom Durand --mot-de-passe 'MotDePasse-Recette-1'
 * ou, sans arguments, depuis SEED_ADMIN_EMAIL, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME,
 * SEED_ADMIN_PASSWORD. Refuse de s'exécuter si un administrateur existe déjà.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { account, user } from "@/db/schema";
import { closeDb, db } from "@/lib/db";

export type SeedAdminInput = { email: string; firstName: string; lastName: string; password: string };

export async function seedAdmin(input: SeedAdminInput): Promise<{ id: string }> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.role, "administrateur")).limit(1);
  if (existing.length > 0) throw new Error("seed:admin : un administrateur existe déjà, la commande ne fait rien.");
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

/** Les arguments priment sur l'environnement ; un champ absent arrête la commande en le nommant. */
export function readSeedAdminInput(argv: string[], env: NodeJS.ProcessEnv): SeedAdminInput {
  const { values } = parseArgs({
    args: argv,
    options: { email: { type: "string" }, prenom: { type: "string" }, nom: { type: "string" }, "mot-de-passe": { type: "string" } },
    strict: true,
  });
  const input = {
    email: values.email ?? env.SEED_ADMIN_EMAIL ?? "",
    firstName: values.prenom ?? env.SEED_ADMIN_FIRST_NAME ?? "",
    lastName: values.nom ?? env.SEED_ADMIN_LAST_NAME ?? "",
    password: values["mot-de-passe"] ?? env.SEED_ADMIN_PASSWORD ?? "",
  };
  const missing = (Object.keys(input) as (keyof SeedAdminInput)[]).filter((key) => input[key].trim() === "");
  if (missing.length > 0) {
    throw new Error(`seed:admin : champ requis absent : ${missing.join(", ")} (arguments --email, --prenom, --nom, --mot-de-passe ou variables SEED_ADMIN_*).`);
  }
  return input;
}

async function main() {
  const { loadDotenv } = await import("@/lib/dotenv");
  loadDotenv();
  await seedAdmin(readSeedAdminInput(process.argv.slice(2), process.env));
  console.log("Administrateur créé.");
  await closeDb();
}

if (process.argv[1] && process.argv[1].endsWith("seed-admin.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
