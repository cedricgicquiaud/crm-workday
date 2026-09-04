/**
 * Applique les migrations du dossier `drizzle/` sur la base de l'environnement courant.
 *   npm run db:migrate            → base de développement (DATABASE_URL)
 *   NODE_ENV=test npm run db:migrate → base de test (TEST_DATABASE_URL)
 * Relancée sans nouvelle migration, elle ne change rien.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "@/lib/db";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: "drizzle" });
}

async function main() {
  const { loadDotenv } = await import("@/lib/dotenv");
  loadDotenv();
  await runMigrations();
  console.log("Migrations appliquées.");
  await closeDb();
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
