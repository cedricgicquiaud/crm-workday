/**
 * Fixture des objets pour Playwright (livraison 2.1a ; les suivantes ajoutent la leur :
 * `personnes.ts`, `activites.ts`…). Même modèle que `auth.ts` : le chargeur de Playwright ne
 * résout pas l'alias `@/`, tout accès à la base passe par ce fichier relancé en sous-processus `tsx`.
 *
 * - `resetObjects()` efface les fiches créées par les comptes `*-e2e@exemple.fr` ou dont le nom
 *   finit par « (e2e) », et leur historique ; rien d'autre (le compte de recette cohabite).
 */
import { execFileSync } from "node:child_process";

const SELF = "e2e/fixtures/objets.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetObjects(): void {
  execFileSync("npx", ["tsx", "e2e/fixtures/leads.ts", "reset"], { stdio: ["ignore", "pipe", "inherit"] }); // F10 : un lead converti retient son entreprise (clé sans cascade)
  runDbCommand("reset");
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/objets.ts reset`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { inArray, like, or } = await import("drizzle-orm");
      const { auditLog, company, user } = await import("../../src/db/schema");
      const e2eUsers = db.select({ id: user.id }).from(user).where(like(user.email, "%-e2e@exemple.fr"));
      const doomed = db
        .select({ id: company.id })
        .from(company)
        .where(or(inArray(company.createdBy, e2eUsers), like(company.name, "%(e2e)")));
      await db.delete(auditLog).where(inArray(auditLog.objectId, doomed));
      await db.delete(company).where(inArray(company.id, doomed));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("objets.ts")) {
  main(process.argv[2] ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
