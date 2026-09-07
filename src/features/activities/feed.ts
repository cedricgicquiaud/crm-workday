/**
 * Fil d'une fiche (D11) : les entrées de toutes provenances, la plus récente d'abord, prêtes pour
 * l'écran (dates en chaînes ISO). Mécanisme commun à tout objet : il ne connaît que la clé d'objet
 * du registre. Le fil d'une fiche reprend ses propres activités et celles des fiches qui l'avaient
 * pour parent au moment où elles ont été écrites (`parent_type` / `parent_id`, contrat 7) ; ces
 * dernières portent la fiche d'origine, que l'écran nomme.
 */
import { and, desc, eq, getTableColumns, inArray, or } from "drizzle-orm";
import { activity, user } from "@/db/schema";
import { getObject } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { TASK } from "./schema";

/** Auteur d'une entrée ; `null` = le système (D11), seul cas qui porte la mention « automatique ». */
export type FeedAuthor = { id: string; name: string } | null;

/** Fiche d'origine d'une entrée venue d'une autre fiche que celle du fil (un contact). */
export type FeedSource = { type: string; id: string; title: string; href: string };

export type FeedItem = {
  /** clé stable dans le fil, préfixée par la provenance de l'entrée */
  id: string;
  /** type d'entrée : un type d'activité déclaré, ou une provenance (changement, email) */
  kind: string;
  /** date de l'entrée, en chaîne ISO */
  at: string;
  author: FeedAuthor;
  /** texte principal : corps d'une note, titre d'une tâche */
  text: string | null;
  source: FeedSource | null;
};

const nameOf = (firstName: string | null, lastName: string | null) => `${firstName ?? ""} ${lastName ?? ""}`.trim();

/** Titres des fiches d'un même objet, par identifiant : le fil nomme la fiche d'origine sans jamais nommer d'objet. */
async function titlesOf(objectType: string, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const definition = getObject(objectType);
  const { table } = getServerObject(objectType);
  const columns = getTableColumns(table);
  const rows = await db
    .select({ id: columns.id, title: columns[definition.titleField] })
    .from(table)
    .where(inArray(columns.id, [...ids]));
  return new Map(rows.map((row) => [String(row.id), String(row.title ?? "")]));
}

/** Fiches d'origine des entrées venues d'ailleurs, par « type:id ». */
async function sourcesOf(origins: readonly { objectType: string; objectId: string }[]): Promise<Map<string, FeedSource>> {
  const byType = new Map<string, Set<string>>();
  for (const origin of origins) byType.set(origin.objectType, (byType.get(origin.objectType) ?? new Set()).add(origin.objectId));
  const sources = new Map<string, FeedSource>();
  for (const [objectType, ids] of byType) {
    const definition = getObject(objectType);
    for (const [id, title] of await titlesOf(objectType, [...ids])) sources.set(`${objectType}:${id}`, { type: objectType, id, title, href: definition.href(id) });
  }
  return sources;
}

/** Entrées du fil d'une fiche, la plus récente d'abord. */
export async function listFeed(objectType: string, objectId: string): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: activity.id,
      objectType: activity.objectType,
      objectId: activity.objectId,
      type: activity.type,
      body: activity.body,
      title: activity.title,
      createdAt: activity.createdAt,
      authorId: activity.authorId,
      authorFirstName: user.firstName,
      authorLastName: user.lastName,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.authorId))
    .where(or(and(eq(activity.objectType, objectType), eq(activity.objectId, objectId)), and(eq(activity.parentType, objectType), eq(activity.parentId, objectId))))
    .orderBy(desc(activity.createdAt), desc(activity.id));
  const sources = await sourcesOf(rows.filter((row) => row.objectId !== objectId).map((row) => ({ objectType: row.objectType, objectId: row.objectId })));
  return rows.map((row) => ({
    id: `activite:${row.id}`,
    kind: row.type,
    at: row.createdAt.toISOString(),
    author: row.authorId ? { id: row.authorId, name: nameOf(row.authorFirstName, row.authorLastName) } : null,
    text: row.type === TASK ? row.title : row.body,
    source: row.objectId === objectId ? null : sources.get(`${row.objectType}:${row.objectId}`) ?? null,
  }));
}
