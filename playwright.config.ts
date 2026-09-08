import { defineConfig, devices } from "@playwright/test";
import { loadDotenv } from "./src/lib/dotenv";

/**
 * Tests d'écran. Le serveur de développement est lancé sur la base de développement migrée,
 * à l'adresse APP_URL de `.env.local` : un worktree qui a son propre `.env.local` a son propre
 * port et ses propres bases, et deux livraisons peuvent se tester côte à côte.
 */
loadDotenv();
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  /** Un seul worker : les fichiers e2e partagent la base `crm` et leurs amorces de comptes se marchent dessus en parallèle. */
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: appUrl, trace: "retain-on-failure", locale: "fr-FR", timezoneId: "Europe/Paris" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `${appUrl}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
