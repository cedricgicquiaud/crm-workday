import { config } from "dotenv";

/** Charge `.env.local` puis `.env` (Next.js le fait seul ; les scripts et les tests non). */
export function loadDotenv() {
  config({ path: ".env.local", override: false, quiet: true });
  config({ path: ".env", override: false, quiet: true });
}
