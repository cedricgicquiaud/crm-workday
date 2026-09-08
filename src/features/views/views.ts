/**
 * Vues sauvegardées (D18, contrat 24) : l'état d'une liste — filtres, tri, colonnes — rangé sous un
 * nom. Mécanisme commun à tout objet : il ne connaît que la clé d'objet du registre (D4). Une vue
 * est partagée par toute l'équipe (D11) : tout membre la voit, la modifie et la supprime. Chaque
 * objet ouvre sa liste de vues sur une vue par défaut synthétique (« Toutes les entreprises »),
 * qui n'est pas en base et ne se renomme ni ne se supprime.
 */
import "@/features/objects/manifest.server";
import { asc, eq } from "drizzle-orm";
import { savedView } from "@/db/schema";
import { getObject } from "@/features/objects/registry";
import type { Actor } from "@/features/objects/service";
import { db } from "@/lib/db";

export type SavedViewRow = typeof savedView.$inferSelect;

/** Une vue telle que la barre des vues la lit : la vue par défaut et les vues enregistrées ont la même forme. */
export type ViewSummary = { id: string; objectType: string; name: string; query: string };

export type ViewInput = { objectType: string; name: string; query: string };

/** Identifiant synthétique de la vue par défaut d'un objet : elle n'a pas de ligne en base. */
export const DEFAULT_VIEW = "default";

/** Vue par défaut d'un objet : aucun paramètre, donc la liste nue, sous « Toutes les … ». */
export function defaultView(type: string): ViewSummary {
  const { labels } = getObject(type);
  return { id: DEFAULT_VIEW, objectType: type, name: `${labels.article === "un" ? "Tous les" : "Toutes les"} ${labels.plural.toLowerCase()}`, query: "" };
}

const summarize = (row: SavedViewRow): ViewSummary => ({ id: row.id, objectType: row.objectType, name: row.name, query: row.query });

/** Vues d'un objet : la vue par défaut, puis les vues enregistrées par ordre alphabétique. */
export async function listViews(type: string): Promise<ViewSummary[]> {
  const rows = await db.select().from(savedView).where(eq(savedView.objectType, type)).orderBy(asc(savedView.name));
  return [defaultView(type), ...rows.map(summarize)];
}

/** Enregistre l'état courant d'une liste sous un nom. */
export async function createView(input: ViewInput, actor: Actor): Promise<SavedViewRow> {
  const [row] = await db.insert(savedView).values({ ...input, createdBy: actor.id }).returning();
  return row;
}
