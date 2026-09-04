import { loadDotenv } from "../src/lib/dotenv";

/** Migre la base de développement avant de lancer le serveur. */
export default async function globalSetup() {
  loadDotenv();
  const { runMigrations } = await import("../src/db/migrate");
  const { closeDb } = await import("../src/lib/db");
  await runMigrations();
  await closeDb();
}
