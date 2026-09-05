/**
 * Boîte locale pour Playwright. Le chargeur de Playwright ne résout pas l'alias `@/` du code
 * applicatif : chaque lecture relance ce fichier en sous-processus `tsx`
 * (`npx tsx e2e/helpers/mailbox.ts <commande>`), comme la fixture `e2e/fixtures/auth.ts`.
 */
import { execFileSync } from "node:child_process";

export type CapturedEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  template: string;
  status: string;
  createdAt: string;
  links: string[];
};

const SELF = "e2e/helpers/mailbox.ts";

function runDbCommand(...args: string[]): string {
  return execFileSync("npx", ["tsx", SELF, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/** Dernier email adressé à cette adresse, ou null. */
export async function lastEmailTo(address: string): Promise<CapturedEmail | null> {
  return JSON.parse(runDbCommand("last-email", address)) as CapturedEmail | null;
}

export async function listEmails(limit = 50): Promise<CapturedEmail[]> {
  return JSON.parse(runDbCommand("list", String(limit))) as CapturedEmail[];
}

/** Pose une ligne « échec » dans le journal, comme l'aurait fait un refus de Resend en production. */
export async function insertFailedEmail(input: { to: string; subject: string; reason: string; template?: string }): Promise<{ id: string }> {
  return JSON.parse(runDbCommand("insert-failed", JSON.stringify(input))) as { id: string };
}

/* --------------------------------------------------------------------------------------------
 * Mode sous-processus. Les modules applicatifs sont importés dynamiquement ici seulement.
 * ------------------------------------------------------------------------------------------ */
async function main(command: string, arg?: string) {
  const { loadDotenv } = await import("../../src/lib/dotenv");
  loadDotenv();
  const { closeDb, db } = await import("../../src/lib/db");
  try {
    if (command === "last-email" && arg) {
      const { lastEmailTo: read } = await import("../../src/lib/mail/mailbox");
      process.stdout.write(JSON.stringify(await read(arg)));
    } else if (command === "list") {
      const { listEmails: list } = await import("../../src/lib/mail/mailbox");
      process.stdout.write(JSON.stringify(await list(Number(arg ?? "50"))));
    } else if (command === "insert-failed" && arg) {
      const { emailLog } = await import("../../src/db/schema");
      const input = JSON.parse(arg) as { to: string; subject: string; reason: string; template?: string };
      const [row] = await db
        .insert(emailLog)
        .values({ to: input.to, subject: input.subject, body: `<p>${input.subject}</p>`, template: input.template ?? "test", status: "echec", errorReason: input.reason })
        .returning({ id: emailLog.id });
      process.stdout.write(JSON.stringify(row));
    } else {
      throw new Error(`Commande inconnue : ${command}`);
    }
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && process.argv[1].endsWith("mailbox.ts")) {
  main(process.argv[2] ?? "", process.argv[3]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
