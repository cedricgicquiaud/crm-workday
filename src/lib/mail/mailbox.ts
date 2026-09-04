/**
 * Boîte locale : lecture des emails capturés (développement, tests, recette).
 */
import { desc, eq } from "drizzle-orm";
import { emailLog } from "@/db/schema";
import { db } from "@/lib/db";

export type CapturedEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  template: string;
  status: string;
  createdAt: Date;
  /** liens http(s) trouvés dans le corps */
  links: string[];
};

const LINK_RE = /https?:\/\/[^\s"'<>]+/g;

function toCaptured(row: typeof emailLog.$inferSelect): CapturedEmail {
  return {
    id: row.id,
    to: row.to,
    subject: row.subject,
    body: row.body,
    template: row.template,
    status: row.status,
    createdAt: row.createdAt,
    links: Array.from(new Set((row.body.match(LINK_RE) ?? []).map((l) => l.replace(/&amp;/g, "&")))),
  };
}

/** Dernier email adressé à cette adresse, ou null. */
export async function lastEmailTo(address: string): Promise<CapturedEmail | null> {
  const rows = await db.select().from(emailLog).where(eq(emailLog.to, address.trim())).orderBy(desc(emailLog.createdAt)).limit(1);
  return rows[0] ? toCaptured(rows[0]) : null;
}

export async function listEmails(limit = 50): Promise<CapturedEmail[]> {
  const rows = await db.select().from(emailLog).orderBy(desc(emailLog.createdAt)).limit(limit);
  return rows.map(toCaptured);
}
