import { execFileSync } from "node:child_process";

/**
 * Migre la base de développement avant de lancer le serveur. Passe par `tsx` en
 * sous-processus : le chargeur TypeScript de Playwright ne résout pas l'alias `@/`
 * utilisé par le code applicatif (constaté en CI).
 */
export default async function globalSetup() {
  execFileSync("npx", ["tsx", "src/db/migrate.ts"], { stdio: "inherit" });
}
