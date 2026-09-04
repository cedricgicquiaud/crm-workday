import { runMigrations } from "@/db/migrate";
import { closeDb, rawSql } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** Vide la base de test (schéma public et pgboss) puis applique les migrations. */
export async function resetTestDb() {
  if (getEnv().NODE_ENV !== "test") throw new Error("resetTestDb : réservé à NODE_ENV=test");
  const sql = rawSql();
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE;");
  await runMigrations();
  await closeDb();
}

/** Instantané du schéma : tables et colonnes du schéma public, pour comparer avant / après. */
export async function schemaSnapshot(): Promise<string> {
  const rows = await rawSql()<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
  return rows.map((r) => `${r.table_name}.${r.column_name}:${r.data_type}`).join("\n");
}

export async function appliedMigrationsCount(): Promise<number> {
  const rows = await rawSql()<{ n: string }[]>`SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`;
  return Number(rows[0].n);
}
