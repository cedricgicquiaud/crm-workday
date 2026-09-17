import { join } from "node:path";
import { config } from "dotenv";

/**
 * Charge `.env.local` puis `.env` (Next.js le fait seul ; les scripts et les tests non). `dir` : le
 * dossier qui les porte ; absent, le dossier courant. La configuration des tests d'écran passe le
 * sien, pour tester la copie qui la contient d'où qu'on la lance (CRM-100).
 */
export function loadDotenv(dir?: string) {
  const at = (name: string) => (dir ? join(dir, name) : name);
  config({ path: at(".env.local"), override: false, quiet: true });
  config({ path: at(".env"), override: false, quiet: true });
}
