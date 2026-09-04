import { PgBoss } from "pg-boss";
import { getEnv } from "@/lib/env";

const globalForJobs = globalThis as unknown as { __crmBoss?: PgBoss };

/**
 * File de tâches planifiées (pg-boss, dans Postgres). Démarrée à la demande ; aucun
 * travail n'est enregistré dans le socle. Les relances (feature 8) s'y brancheront.
 */
export async function getJobs(): Promise<PgBoss> {
  if (!globalForJobs.__crmBoss) {
    const boss = new PgBoss({ connectionString: getEnv().DATABASE_URL, schema: "pgboss" });
    boss.on("error", (error: unknown) => console.error("[jobs]", error));
    await boss.start();
    globalForJobs.__crmBoss = boss;
  }
  return globalForJobs.__crmBoss;
}

export async function stopJobs() {
  if (globalForJobs.__crmBoss) {
    await globalForJobs.__crmBoss.stop({ graceful: true });
    globalForJobs.__crmBoss = undefined;
  }
}
