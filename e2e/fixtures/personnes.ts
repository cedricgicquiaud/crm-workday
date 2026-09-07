/**
 * Fixture des personnes pour Playwright (livraison 2.2). Même modèle que `objets.ts` : le chargeur
 * de Playwright ne résout pas l'alias `@/`, tout accès à la base passe par ce fichier relancé en
 * sous-processus `tsx`.
 *
 * - `resetPersons()` efface les personnes créées par les comptes `*-e2e@exemple.fr` ou dont le nom
 *   finit par « (e2e) », leurs adresses et profils (cascade) et leur historique ; rien d'autre (le
 *   compte de recette et les personnes de l'amorce cohabitent). À appeler avant `resetObjects()` :
 *   une personne rattachée retient son entreprise.
 * - `archiveCompany(id)` pose `archived_at` sur une entreprise (l'archivage par l'écran arrive en 2.6b).
 */
import { execFileSync } from "node:child_process";

const SELF = "e2e/fixtures/personnes.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetPersons(): void {
  runDbCommand("reset");
}

export function archiveCompany(id: string): void {
  runDbCommand("archive-company", id);
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/personnes.ts reset | archive-company <id>`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string, arg?: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { inArray, like, or } = await import("drizzle-orm");
      const { auditLog, person, user } = await import("../../src/db/schema");
      const e2eUsers = db.select({ id: user.id }).from(user).where(like(user.email, "%-e2e@exemple.fr"));
      const doomed = db
        .select({ id: person.id })
        .from(person)
        .where(or(inArray(person.createdBy, e2eUsers), like(person.lastName, "%(e2e)")));
      await db.delete(auditLog).where(inArray(auditLog.objectId, doomed));
      await db.delete(person).where(inArray(person.id, doomed));
    } else if (command === "archive-company" && arg) {
      const { eq } = await import("drizzle-orm");
      const { company } = await import("../../src/db/schema");
      await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, arg));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("personnes.ts")) {
  main(process.argv[2] ?? "", process.argv[3]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
