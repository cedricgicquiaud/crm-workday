/**
 * Fixture d'authentification pour Playwright (livraison 1.2a ; 1.3 et 1.4 la lisent sans la modifier).
 *
 * - `seedAccounts()` pose un administrateur et un membre connus dans la base de développement ;
 * - `signInAs(request, compte)` ouvre une session par l'API et rend le `storageState` ;
 * - `test` étend celui de Playwright avec `adminPage` et `memberPage`, déjà connectées ;
 * - `lastEmailTo(adresse)` lit le dernier email capturé (sujet, liens).
 *
 * Le chargeur de Playwright ne résout pas l'alias `@/` du code applicatif : tout accès à la
 * base passe par ce même fichier relancé en sous-processus `tsx` (`npx tsx e2e/fixtures/auth.ts <commande>`).
 */
import { execFileSync } from "node:child_process";
import { test as base, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export type Account = { email: string; password: string; firstName: string; lastName: string; role: "administrateur" | "membre" };

export const ADMIN: Account = { email: "admin-e2e@exemple.fr", password: "MotDePasse-Admin-E2E-1", firstName: "Alice", lastName: "Durand", role: "administrateur" };
export const MEMBER: Account = { email: "membre-e2e@exemple.fr", password: "MotDePasse-Membre-E2E-1", firstName: "Marc", lastName: "Leroy", role: "membre" };

const SELF = "e2e/fixtures/auth.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/** Recrée l'administrateur et le membre de test (mot de passe connu, sessions fermées). */
export function seedAccounts(): void {
  runDbCommand("seed");
}

export type CapturedEmail = { subject: string; links: string[] } | null;

export function lastEmailTo(address: string): CapturedEmail {
  return JSON.parse(runDbCommand("last-email", address)) as CapturedEmail;
}

/** Connexion par l'API, comme le formulaire le fait ; le contexte garde le cookie de session. */
export async function signInAs(request: APIRequestContext, account: Account) {
  const res = await request.post("/api/auth/sign-in/email", { data: { email: account.email, password: account.password } });
  if (!res.ok()) throw new Error(`Connexion e2e refusée pour ${account.email} : ${res.status()}`);
  return request.storageState();
}

async function pageAs(browser: Browser, account: Account, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  await signInAs(context.request, account);
  const page = await context.newPage();
  await run(page);
  await context.close();
}

export const test = base.extend<{ adminPage: Page; memberPage: Page }>({
  adminPage: ({ browser }, run) => pageAs(browser, ADMIN, run),
  memberPage: ({ browser }, run) => pageAs(browser, MEMBER, run),
});

export { expect } from "@playwright/test";

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/auth.ts seed | last-email <adresse>`.
 * Les modules applicatifs sont importés dynamiquement ici seulement, jamais par Playwright.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string, arg?: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "seed") {
      const { inArray } = await import("drizzle-orm");
      const { user } = await import("../../src/db/schema");
      const { createUserWithPassword } = await import("../../src/features/auth/accounts");
      await db.delete(user).where(inArray(user.email, [ADMIN.email, MEMBER.email]));
      await createUserWithPassword(ADMIN);
      await createUserWithPassword(MEMBER);
    } else if (command === "last-email" && arg) {
      const { lastEmailTo } = await import("../../src/lib/mail/mailbox");
      const mail = await lastEmailTo(arg);
      process.stdout.write(JSON.stringify(mail ? { subject: mail.subject, links: mail.links } : null));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("auth.ts")) {
  main(process.argv[2] ?? "", process.argv[3]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
