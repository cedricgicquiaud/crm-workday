import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { getEnv } from "@/lib/env";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __crmSql?: ReturnType<typeof postgres>; __crmDb?: Db };

function connect() {
  if (!globalForDb.__crmSql) {
    globalForDb.__crmSql = postgres(getEnv().DATABASE_URL, { max: 10, onnotice: () => {} });
    globalForDb.__crmDb = drizzle(globalForDb.__crmSql, { schema });
  }
  return { sql: globalForDb.__crmSql, db: globalForDb.__crmDb! };
}

/** Client Drizzle partagé (une seule connexion par processus, y compris en rechargement à chaud). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = connect().db as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

/** Client SQL brut, pour les migrations et les remises à zéro de test. */
export function rawSql() {
  return connect().sql;
}

export async function closeDb() {
  if (globalForDb.__crmSql) {
    await globalForDb.__crmSql.end({ timeout: 5 });
    globalForDb.__crmSql = undefined;
    globalForDb.__crmDb = undefined;
  }
}
