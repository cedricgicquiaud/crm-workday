/**
 * Fixture des opportunités pour Playwright (livraison 4.2a). Même modèle que `leads.ts` : le chargeur
 * de Playwright ne résout pas l'alias `@/`, tout accès à la base passe par ce fichier relancé en
 * sous-processus `tsx`.
 *
 * - `resetOpportunities()` efface les opportunités créées par les comptes `*-e2e@exemple.fr` ou dont
 *   le titre finit par « (e2e) », avec ce qui les désigne — activités, valeurs personnalisées,
 *   historique —, enfants avant parents ; modules et propositions partent avec elles (cascade). Rien
 *   d'autre : les opportunités de l'amorce cohabitent. À appeler avant `resetLeads()`,
 *   `resetPersons()` et `resetObjects()` : une opportunité retient son lead, son contact et son
 *   entreprise (clés sans cascade).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";

/** Ce fichier et la racine de sa copie du dépôt : le sous-processus lit le `.env.local` de la copie, d'où qu'on lance la suite (CRM-100). */
const SELF = __filename;
const ROOT = join(__dirname, "..", "..");

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetOpportunities(): void {
  runDbCommand("reset");
}

/**
 * Pose l'étape d'une opportunité de test en base, par son titre. « Gagnée » et « Perdue » se posent
 * par leur geste (4.2d) et l'API les refuse : les écrans qui ont besoin d'une affaire terminée
 * passent par ici. Le titre doit finir par « (e2e) » : les opportunités de l'amorce ne bougent pas.
 */
export function setStage(title: string, stage: string): void {
  runDbCommand("set-stage", title, stage);
}

/** Choisit une option d'un sélecteur (liste fermée ou fiche liée) : les deux suites des opportunités le partagent. */
export async function pickOption(page: Page, combobox: Locator, option: string): Promise<void> {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/opportunites.ts reset`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { and, eq, inArray, like, or } = await import("drizzle-orm");
      const { activity, auditLog, customFieldValue, opportunity, user } = await import("../../src/db/schema");
      const e2eUsers = db.select({ id: user.id }).from(user).where(like(user.email, "%-e2e@exemple.fr"));
      const doomed = db
        .select({ id: opportunity.id })
        .from(opportunity)
        .where(or(inArray(opportunity.createdBy, e2eUsers), like(opportunity.title, "%(e2e)")));
      await db.delete(activity).where(and(eq(activity.objectType, "opportunity"), inArray(activity.objectId, doomed)));
      await db.delete(customFieldValue).where(and(eq(customFieldValue.objectType, "opportunity"), inArray(customFieldValue.objectId, doomed)));
      await db.delete(auditLog).where(and(eq(auditLog.objectType, "opportunity"), inArray(auditLog.objectId, doomed)));
      await db.delete(opportunity).where(inArray(opportunity.id, doomed));
    } else if (command === "set-stage") {
      const { eq } = await import("drizzle-orm");
      const { opportunity } = await import("../../src/db/schema");
      const [title, stage] = [process.argv[3], process.argv[4]];
      if (!title?.endsWith("(e2e)")) throw new Error(`Titre hors des fiches de test : « ${title} ».`);
      const updated = await db.update(opportunity).set({ stage }).where(eq(opportunity.title, title)).returning({ id: opportunity.id });
      if (updated.length === 0) throw new Error(`Aucune opportunité « ${title} ».`);
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("opportunites.ts")) {
  main(process.argv[2] ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
