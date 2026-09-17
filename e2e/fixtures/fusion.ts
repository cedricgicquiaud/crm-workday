/**
 * Fixture des fusions pour Playwright (livraison 2.6a). Même modèle que `objets.ts` : le chargeur
 * de Playwright ne résout pas l'alias `@/`, tout accès à la base passe par ce fichier relancé en
 * sous-processus `tsx`.
 *
 * - `resetMerges()` efface les redirections laissées par les fusions des tests, c'est-à-dire celles
 *   qui mènent à une fiche créée par un compte `*-e2e@exemple.fr` ou nommée « … (e2e) ». La fiche
 *   absorbée n'existant plus, c'est la fiche conservée qui les désigne. À appeler **avant**
 *   `resetPersons()` et `resetObjects()` : après, la fiche conservée a disparu avec sa redirection.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Ce fichier et la racine de sa copie du dépôt : le sous-processus lit le `.env.local` de la copie, d'où qu'on lance la suite (CRM-100). */
const SELF = __filename;
const ROOT = join(__dirname, "..", "..");

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetMerges(): void {
  runDbCommand("reset");
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/fusion.ts reset`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { and, eq, inArray, like, or } = await import("drizzle-orm");
      const { company, objectRedirect, person, user } = await import("../../src/db/schema");
      const e2eUsers = db.select({ id: user.id }).from(user).where(like(user.email, "%-e2e@exemple.fr"));
      const companies = db
        .select({ id: company.id })
        .from(company)
        .where(or(inArray(company.createdBy, e2eUsers), like(company.name, "%(e2e)")));
      const persons = db
        .select({ id: person.id })
        .from(person)
        .where(or(inArray(person.createdBy, e2eUsers), like(person.lastName, "%(e2e)")));
      await db.delete(objectRedirect).where(and(eq(objectRedirect.objectType, "company"), inArray(objectRedirect.toId, companies)));
      await db.delete(objectRedirect).where(and(eq(objectRedirect.objectType, "person"), inArray(objectRedirect.toId, persons)));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("fusion.ts")) {
  main(process.argv[2] ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
