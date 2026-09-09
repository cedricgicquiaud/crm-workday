/**
 * Fixture des vues pour Playwright (livraison 2.5b). Même modèle que `objets.ts` : le chargeur de
 * Playwright ne résout pas l'alias `@/`, tout accès à la base passe par ce fichier relancé en
 * sous-processus `tsx`.
 *
 * - `resetViews()` efface les vues dont le nom finit par « (e2e) », et rien d'autre (les épingles
 *   partent avec elles) : la vue de recette du compte `admin@exemple.fr` cohabite.
 */
import { execFileSync } from "node:child_process";

const SELF = "e2e/fixtures/vues.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetViews(): void {
  runDbCommand("reset");
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/vues.ts reset`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { like } = await import("drizzle-orm");
      const { savedView } = await import("../../src/db/schema");
      await db.delete(savedView).where(like(savedView.name, "%(e2e)"));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("vues.ts")) {
  main(process.argv[2] ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
