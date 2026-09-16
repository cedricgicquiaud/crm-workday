/**
 * Historique des changements (D12), commun à tout objet : le service générique y écrit une entrée
 * par champ modifié (et une « créée » à la création) ; la fiche le lit. Jamais modifié ni supprimé.
 * Ce module ne connaît que la clé d'objet du registre.
 */
import { and, count, desc, eq } from "drizzle-orm";
import { auditLog, user } from "@/db/schema";
import { db, type Executor } from "@/lib/db";

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

/**
 * Écrit des entrées d'historique ; rien n'est écrit quand la liste est vide. `exec` reçoit la
 * transaction en cours quand l'écriture qu'elles racontent s'y trouve : une trace hors transaction
 * survivrait à une écriture annulée.
 */
export async function recordHistory(entries: readonly HistoryInput[], exec: Executor = db): Promise<void> {
  if (entries.length === 0) return;
  await exec.insert(auditLog).values(
    entries.map((e) => ({ objectType: e.objectType, objectId: e.objectId, action: e.action, field: e.field ?? null, oldValue: e.oldValue ?? null, newValue: e.newValue ?? null, authorId: e.authorId })),
  );
}

/** Toutes les entrées d'un objet appartiennent à la même fiche : la condition sert à la lecture comme au compte. */
const entriesOf = (objectType: string, objectId: string) => and(eq(auditLog.objectType, objectType), eq(auditLog.objectId, objectId));

/** Nombre d'entrées d'un objet : ce qu'un lecteur borné n'a pas chargé se déduit de ce compte. */
export async function countHistory(objectType: string, objectId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(auditLog).where(entriesOf(objectType, objectId));
  return Number(row?.value ?? 0);
}

/**
 * Entrées d'un objet, la plus récente d'abord, avec le nom de l'auteur. `limit` borne la lecture :
 * un fil qui n'affiche que les entrées récentes ne charge pas tout l'historique d'une fiche.
 */
export async function listHistory(objectType: string, objectId: string, limit?: number): Promise<HistoryEntry[]> {
  const query = db
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
    .where(entriesOf(objectType, objectId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id));
  const rows = await (limit === undefined ? query : query.limit(limit));
  return rows.map(({ authorId, authorFirstName, authorLastName, ...row }) => ({
    ...row,
    action: row.action as HistoryAction,
    author: authorId ? { id: authorId, name: `${authorFirstName ?? ""} ${authorLastName ?? ""}`.trim() } : null,
  }));
}
