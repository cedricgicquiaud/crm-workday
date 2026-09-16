/**
 * Fixture des leads pour Playwright (livraison 4.1a). Même modèle que `objets.ts` : le chargeur de
 * Playwright ne résout pas l'alias `@/`, tout accès à la base passe par ce fichier relancé en
 * sous-processus `tsx`.
 *
 * - `resetLeads()` efface les leads créés par les comptes `*-e2e@exemple.fr` ou dont le nom
 *   d'entreprise finit par « (e2e) », avec ce qui les désigne — activités, valeurs personnalisées,
 *   historique —, enfants avant parents ; rien d'autre (les leads de l'amorce cohabitent). À appeler
 *   avant `resetPersons()` et `resetObjects()` : un lead converti retient sa personne et son
 *   entreprise (clés sans cascade), et avant `seedAccounts()` : un lead retient son créateur.
 * - `convertLead(id)` pose l'avancement « converti » directement en base (D29) : la conversion
 *   arrive en 4.1b, les contrats 5 et 7 ont besoin d'un lead converti dès maintenant.
 */
import { execFileSync } from "node:child_process";

const SELF = "e2e/fixtures/leads.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export function resetLeads(): void {
  runDbCommand("reset");
}

export function convertLead(id: string): void {
  runDbCommand("convert", id);
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus : `npx tsx e2e/fixtures/leads.ts reset | convert <id>`.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string, arg?: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "reset") {
      const { and, eq, inArray, like, or } = await import("drizzle-orm");
      const { activity, auditLog, customFieldValue, lead, user } = await import("../../src/db/schema");
      const e2eUsers = db.select({ id: user.id }).from(user).where(like(user.email, "%-e2e@exemple.fr"));
      const doomed = db
        .select({ id: lead.id })
        .from(lead)
        .where(or(inArray(lead.createdBy, e2eUsers), like(lead.companyName, "%(e2e)")));
      await db.delete(activity).where(and(eq(activity.objectType, "lead"), inArray(activity.objectId, doomed)));
      await db.delete(customFieldValue).where(and(eq(customFieldValue.objectType, "lead"), inArray(customFieldValue.objectId, doomed)));
      await db.delete(auditLog).where(and(eq(auditLog.objectType, "lead"), inArray(auditLog.objectId, doomed)));
      await db.delete(lead).where(inArray(lead.id, doomed));
    } else if (command === "convert" && arg) {
      const { eq } = await import("drizzle-orm");
      const { lead } = await import("../../src/db/schema");
      await db.update(lead).set({ stage: "converti", convertedAt: new Date() }).where(eq(lead.id, arg));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("leads.ts")) {
  main(process.argv[2] ?? "", process.argv[3]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
