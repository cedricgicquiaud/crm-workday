/**
 * Vues épinglées (contrat 24) : la part personnelle des vues. Une vue est partagée par l'équipe,
 * mais chacun choisit celles qui vivent dans sa barre latérale et leur rang. Le rang est enregistré
 * (`position`) : l'ordre d'une barre latérale ne se déduit ni de la date d'épinglage ni des imports.
 */
import { and, asc, eq } from "drizzle-orm";
import { pinnedView, savedView } from "@/db/schema";
import { getView } from "@/features/views/views";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Une entrée du groupe « Vues épinglées » : la vue elle-même, dans l'ordre choisi par son épingleur. */
export type PinnedViewEntry = { id: string; objectType: string; name: string };

/** Vues épinglées par un utilisateur, dans son ordre. */
export async function listPinnedViews(userId: string): Promise<PinnedViewEntry[]> {
  return db
    .select({ id: savedView.id, objectType: savedView.objectType, name: savedView.name })
    .from(pinnedView)
    .innerJoin(savedView, eq(savedView.id, pinnedView.viewId))
    .where(eq(pinnedView.userId, userId))
    .orderBy(asc(pinnedView.position));
}

/** Épingle une vue en fin de barre : 404 vue inconnue, 409 vue déjà épinglée. */
export async function pinView(userId: string, viewId: string): Promise<void> {
  await getView(viewId);
  const pinned = await listPinnedViews(userId);
  if (pinned.some((view) => view.id === viewId)) throw new HttpError(409, "deja_epinglee", "Cette vue est déjà dans votre barre latérale.");
  await db.insert(pinnedView).values({ userId, viewId, position: pinned.length });
}

/** Retire une vue de sa propre barre latérale : 404 si elle n'y est pas (la vue, elle, reste à l'équipe). */
export async function unpinView(userId: string, viewId: string): Promise<void> {
  const removed = await db
    .delete(pinnedView)
    .where(and(eq(pinnedView.userId, userId), eq(pinnedView.viewId, viewId)))
    .returning({ id: pinnedView.id });
  if (removed.length === 0) throw new HttpError(404, "epingle_introuvable", "Cette vue n'est pas dans votre barre latérale.");
}

/** Range les épingles dans l'ordre reçu ; une vue absente de la liste reçue garde sa place à la suite. */
export async function reorderPins(userId: string, viewIds: readonly string[]): Promise<void> {
  const pinned = await listPinnedViews(userId);
  const ordered = [...viewIds.filter((id) => pinned.some((view) => view.id === id)), ...pinned.map((view) => view.id).filter((id) => !viewIds.includes(id))];
  for (const [position, viewId] of ordered.entries()) {
    await db
      .update(pinnedView)
      .set({ position })
      .where(and(eq(pinnedView.userId, userId), eq(pinnedView.viewId, viewId)));
  }
}
