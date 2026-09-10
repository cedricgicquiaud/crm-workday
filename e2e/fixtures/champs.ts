/**
 * Fixture des champs personnalisés pour Playwright (livraison 2.4). Même modèle que `objets.ts` :
 * le chargeur de Playwright ne résout pas l'alias `@/`, tout accès à la base passe par ce fichier
 * relancé en sous-processus `tsx`.
 *
 * - `resetCustomFields()` efface les champs dont le libellé finit par « (e2e) », et rien d'autre :
 *   leurs valeurs partent avec eux (cascade), et les champs de recette cohabitent.
 */
import { execFileSync } from "node:child_process";

const SELF = "e2e/fixtures/champs.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetCustomFields(): void {
  runDbCommand("reset");
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/champs.ts reset`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { like } = await import("drizzle-orm");
      const { customFieldDefinition } = await import("../../src/db/schema");
      await db.delete(customFieldDefinition).where(like(customFieldDefinition.label, "%(e2e)"));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("champs.ts")) {
  main(process.argv[2] ?? "").catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
