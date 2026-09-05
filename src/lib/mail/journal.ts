/**
 * Journal des envois (D23) : une ligne par email, quel que soit son sort. Lisible par tout
 * membre ; filtrable par statut, période et objet rattaché.
 */
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { emailLog, user } from "@/db/schema";
import { db } from "@/lib/db";
import type { EmailStatus } from "@/lib/mail/send";

export type JournalFilters = {
  status?: EmailStatus;
  /** borne basse incluse */
  from?: Date;
  /** borne haute exclue */
  to?: Date;
  objectType?: string;
  objectId?: string;
};

export type JournalEntry = {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: EmailStatus;
  errorReason: string | null;
  providerId: string | null;
  createdAt: Date;
  /** utilisateur à l'origine de l'envoi ; null = système */
  author: { id: string; name: string } | null;
  objectType: string | null;
  objectId: string | null;
};

const MAX_ROWS = 500;

export async function listEmailLog(filters: JournalFilters): Promise<JournalEntry[]> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(emailLog.status, filters.status));
  if (filters.from) conditions.push(gte(emailLog.createdAt, filters.from));
  if (filters.to) conditions.push(lt(emailLog.createdAt, filters.to));
  if (filters.objectType) conditions.push(eq(emailLog.objectType, filters.objectType));
  if (filters.objectId) conditions.push(eq(emailLog.objectId, filters.objectId));

  const rows = await db
    .select({
      id: emailLog.id,
      to: emailLog.to,
      subject: emailLog.subject,
      template: emailLog.template,
      status: emailLog.status,
      errorReason: emailLog.errorReason,
      providerId: emailLog.providerId,
      createdAt: emailLog.createdAt,
      authorId: emailLog.authorId,
      authorFirstName: user.firstName,
      authorLastName: user.lastName,
      objectType: emailLog.objectType,
      objectId: emailLog.objectId,
    })
    .from(emailLog)
    .leftJoin(user, eq(user.id, emailLog.authorId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(emailLog.createdAt))
    .limit(MAX_ROWS);

  return rows.map(({ authorId, authorFirstName, authorLastName, status, ...row }) => ({
    ...row,
    status: status as EmailStatus,
    author: authorId ? { id: authorId, name: `${authorFirstName ?? ""} ${authorLastName ?? ""}`.trim() } : null,
  }));
}
