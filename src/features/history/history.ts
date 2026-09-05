/**
 * Historique des changements (D12), commun à tout objet : le service générique y écrit une entrée
 * par champ modifié (et une « créée » à la création) ; la fiche le lit. Jamais modifié ni supprimé.
 * Ce module ne connaît que la clé d'objet du registre.
 */
import { and, desc, eq } from "drizzle-orm";
import { auditLog, user } from "@/db/schema";
import { db } from "@/lib/db";

export type HistoryAction = "creee" | "modifiee" | "archivee" | "restauree" | "fusionnee";

export type HistoryInput = {
  objectType: string;
  objectId: string;
  action: HistoryAction;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  /** utilisateur à l'origine du changement ; null = système (D11) */
  authorId: string | null;
};

export type HistoryEntry = {
  id: string;
  action: HistoryAction;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  author: { id: string; name: string } | null;
};

/** Écrit des entrées d'historique ; rien n'est écrit quand la liste est vide. */
export async function recordHistory(entries: readonly HistoryInput[]): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(auditLog).values(
    entries.map((e) => ({ objectType: e.objectType, objectId: e.objectId, action: e.action, field: e.field ?? null, oldValue: e.oldValue ?? null, newValue: e.newValue ?? null, authorId: e.authorId })),
  );
}

/** Entrées d'un objet, la plus récente d'abord, avec le nom de l'auteur. */
export async function listHistory(objectType: string, objectId: string): Promise<HistoryEntry[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      field: auditLog.field,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      createdAt: auditLog.createdAt,
      authorId: auditLog.authorId,
      authorFirstName: user.firstName,
      authorLastName: user.lastName,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.authorId))
    .where(and(eq(auditLog.objectType, objectType), eq(auditLog.objectId, objectId)))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id));
  return rows.map(({ authorId, authorFirstName, authorLastName, ...row }) => ({
    ...row,
    action: row.action as HistoryAction,
    author: authorId ? { id: authorId, name: `${authorFirstName ?? ""} ${authorLastName ?? ""}`.trim() } : null,
  }));
}
