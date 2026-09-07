/**
 * Fixture des activités pour Playwright (livraison 2.3). Même modèle que `objets.ts` et
 * `personnes.ts` : le chargeur de Playwright ne résout pas l'alias `@/`, tout accès à la base passe
 * par ce fichier relancé en sous-processus `tsx`.
 *
 * - `resetActivities()` efface les activités écrites par les comptes `*-e2e@exemple.fr` et les
 *   emails du journal posés par cette fixture (modèle `activites-e2e`) ; rien d'autre. À appeler
 *   avant `seedAccounts()` : une activité retient son auteur.
 * - `seedJournalEmail(...)` pose dans le journal un email qui porte la référence d'une fiche, envoyé
 *   par le membre de test ou par le système, comme la feature 1 l'aurait écrit.
 */
import { execFileSync } from "node:child_process";

const SELF = "e2e/fixtures/activites.ts";

/** Modèle des emails posés par cette fixture : il les rend reconnaissables, et effaçables sans toucher aux autres. */
export const E2E_TEMPLATE = "activites-e2e";

export type JournalEmailInput = { objectType: string; objectId: string; subject: string; status: "envoye" | "echec"; author: "membre" | "systeme" };

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetActivities(): void {
  runDbCommand("reset");
}

export function seedJournalEmail(input: JournalEmailInput): void {
  runDbCommand("seed-email", JSON.stringify(input));
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/activites.ts reset | seed-email <json>`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string, arg?: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { eq, inArray, like } = await import("drizzle-orm");
      const { activity, emailLog, user } = await import("../../src/db/schema");
      const e2eUsers = db.select({ id: user.id }).from(user).where(like(user.email, "%-e2e@exemple.fr"));
      await db.delete(activity).where(inArray(activity.authorId, e2eUsers));
      await db.delete(emailLog).where(eq(emailLog.template, E2E_TEMPLATE));
    } else if (command === "seed-email" && arg) {
      const { eq } = await import("drizzle-orm");
      const { emailLog, user } = await import("../../src/db/schema");
      const input = JSON.parse(arg) as JournalEmailInput;
      const [member] = await db.select({ id: user.id }).from(user).where(eq(user.email, "membre-e2e@exemple.fr")).limit(1);
      await db.insert(emailLog).values({
        to: "contact@exemple.fr",
        subject: input.subject,
        body: `<p>${input.subject}</p>`,
        template: E2E_TEMPLATE,
        status: input.status,
        authorId: input.author === "membre" ? member?.id ?? null : null,
        objectType: input.objectType,
        objectId: input.objectId,
      });
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("activites.ts")) {
  main(process.argv[2] ?? "", process.argv[3]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
