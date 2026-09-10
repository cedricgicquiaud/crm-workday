/**
 * Fil d'une fiche (D11) : les entrées de toutes provenances, la plus récente d'abord, prêtes pour
 * l'écran (dates en chaînes ISO). Mécanisme commun à tout objet : il ne connaît que la clé d'objet
 * du registre. Le fil d'une fiche reprend ses propres activités et celles des fiches qui l'avaient
 * pour parent au moment où elles ont été écrites (`parent_type` / `parent_id`, contrat 7) ; ces
 * dernières portent la fiche d'origine, que l'écran nomme.
 */
import { and, count, desc, eq, getTableColumns, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { activity, user } from "@/db/schema";
import { countHistory, listHistory, type HistoryEntry } from "@/features/history/history";
import { historyFieldsOf } from "@/features/objects/fields";
import { displayValue, type UserOption } from "@/features/objects/labels";
import { getObject, type FieldDescriptor } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { db } from "@/lib/db";
import { listEmailLog } from "@/lib/mail/journal";
import { isOverdue } from "./overdue";
import { CHANGE, EMAIL, TASK } from "./schema";

/** Auteur d'une entrée ; `null` = le système (D11), seul cas qui porte la mention « automatique ». */
export type FeedAuthor = { id: string; name: string } | null;

/** Fiche d'origine d'une entrée venue d'une autre fiche que celle du fil (un contact). */
export type FeedSource = { type: string; id: string; title: string; href: string };

/**
 * Ce qu'une tâche ajoute à son entrée : de quoi la cocher, dire si elle est en retard (D13) et
 * afficher la date de son cochage (`doneAt`, contrat 12). `assigneeId` accompagne le nom du
 * responsable : l'écran ne le répète pas quand c'est l'auteur, déjà nommé sur la même ligne.
 */
export type FeedTask = { activityId: string; done: boolean; doneAt: string | null; dueDate: string | null; overdue: boolean; assignee: string | null; assigneeId: string | null };

/** Entrées du fil d'une fiche, bornées : `more` compte celles, plus anciennes, qui n'ont pas été chargées. */
export type Feed = { items: FeedItem[]; more: number };

/**
 * Entrées chargées au plus par le fil, toutes provenances confondues : une fiche de trois ans
 * d'historique n'en charge pas trois ans à chaque rendu (comme la colonne des liens en 2.2).
 */
export const FEED_ITEMS_LIMIT = 50;

/** Ce qu'une provenance rend au fil : ses entrées les plus récentes, et le nombre total qu'elle porte. */
type FeedPart = { items: FeedItem[]; total: number };

export type FeedItem = {
  /** clé stable dans le fil, préfixée par la provenance de l'entrée */
  id: string;
  /** type d'entrée : un type d'activité déclaré, ou une provenance (changement, email) */
  kind: string;
  /** date de l'entrée, en chaîne ISO */
  at: string;
  author: FeedAuthor;
  /** texte principal : corps d'une note, titre d'une tâche, phrase d'un changement, sujet d'un email */
  text: string | null;
  source: FeedSource | null;
  /** statut d'un email (envoyé, échec) ; nul pour les autres entrées */
  status: string | null;
  /** état d'une tâche ; nul pour les autres entrées */
  task: FeedTask | null;
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

/** Activités de la fiche et de celles qui l'avaient pour parent, la plus récente d'abord, bornées. */
async function activityItems(objectType: string, objectId: string): Promise<FeedPart> {
  const assignee = alias(user, "assignee");
  const scope = or(and(eq(activity.objectType, objectType), eq(activity.objectId, objectId)), and(eq(activity.parentType, objectType), eq(activity.parentId, objectId)));
  const rows = await db
    .select({
      id: activity.id,
      objectType: activity.objectType,
      objectId: activity.objectId,
      type: activity.type,
      body: activity.body,
      title: activity.title,
      dueDate: activity.dueDate,
      doneAt: activity.doneAt,
      createdAt: activity.createdAt,
      authorId: activity.authorId,
      authorFirstName: user.firstName,
      authorLastName: user.lastName,
      assigneeId: activity.assigneeId,
      assigneeFirstName: assignee.firstName,
      assigneeLastName: assignee.lastName,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.authorId))
    .leftJoin(assignee, eq(assignee.id, activity.assigneeId))
    .where(scope)
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(FEED_ITEMS_LIMIT);
  /* Une fiche d'un autre objet peut porter le même identifiant : la provenance se juge sur les deux. */
  const elsewhere = (row: { objectType: string; objectId: string }) => row.objectType !== objectType || row.objectId !== objectId;
  const sources = await sourcesOf(rows.filter(elsewhere).map((row) => ({ objectType: row.objectType, objectId: row.objectId })));
  const items = rows.map((row) => ({
    id: `activite:${row.id}`,
    kind: row.type,
    at: row.createdAt.toISOString(),
    author: row.authorId ? { id: row.authorId, name: nameOf(row.authorFirstName, row.authorLastName) } : null,
    text: row.type === TASK ? row.title : row.body,
    source: elsewhere(row) ? sources.get(`${row.objectType}:${row.objectId}`) ?? null : null,
    status: null,
    task:
      row.type === TASK
        ? {
            activityId: row.id,
            done: row.doneAt !== null,
            doneAt: row.doneAt?.toISOString() ?? null,
            dueDate: row.dueDate,
            overdue: row.doneAt === null && isOverdue(row.dueDate),
            assignee: row.assigneeId ? nameOf(row.assigneeFirstName, row.assigneeLastName) : null,
            assigneeId: row.assigneeId,
          }
        : null,
  }));
  return { items, total: await totalOf(items.length, () => db.select({ value: count() }).from(activity).where(scope)) };
}

/**
 * Total d'une provenance : les entrées chargées suffisent tant que la borne n'est pas atteinte ;
 * en dessous, aucune requête de compte n'est faite.
 */
async function totalOf(loaded: number, countRows: () => Promise<{ value: number }[]>): Promise<number> {
  if (loaded < FEED_ITEMS_LIMIT) return loaded;
  const [row] = await countRows();
  return Math.max(Number(row?.value ?? loaded), loaded);
}

const ACTION_LABELS: Record<HistoryEntry["action"], string> = { creee: "Fiche créée", modifiee: "Champ modifié", archivee: "Fiche archivée", restauree: "Fiche restaurée", fusionnee: "Fusionnée avec" };

/** « Type : Prospect → Client » ; une valeur absente se lit « vide ». */
function changeLabel(fields: readonly FieldDescriptor[], entry: HistoryEntry, users: readonly UserOption[]): string {
  const field = fields.find((f) => f.key === entry.field);
  const label = field?.label ?? entry.field ?? "";
  const show = (value: string | null) => (field && value !== null ? displayValue(field, value, users) : value ?? "vide");
  return `${label} : ${show(entry.oldValue)} → ${show(entry.newValue)}`;
}

/** Phrase d'une entrée d'historique — « Fiche créée », « Type : Prospect → Client » (D12). */
function historyLabel(type: string, entry: HistoryEntry, users: readonly UserOption[]): string {
  if (entry.action === "modifiee") return changeLabel(historyFieldsOf(type), entry, users);
  /* Une fusion nomme la fiche absorbée (contrat 29) : son titre est dans `newValue`. */
  if (entry.action === "fusionnee" && entry.newValue) return `${ACTION_LABELS.fusionnee} ${entry.newValue}`;
  return ACTION_LABELS[entry.action];
}

/**
 * Changements de la fiche (D12) : l'historique est un type d'entrée du fil, il n'a plus de colonne à
 * lui. Les options d'utilisateurs viennent de l'appelant, qui les a déjà lues pour la fiche.
 */
async function changeItems(objectType: string, objectId: string, users: readonly UserOption[]): Promise<FeedPart> {
  const entries = await listHistory(objectType, objectId, FEED_ITEMS_LIMIT);
  const items = entries.map((entry) => ({
    id: `changement:${entry.id}`,
    kind: CHANGE,
    at: entry.createdAt.toISOString(),
    author: entry.author,
    text: historyLabel(objectType, entry, users),
    source: null,
    status: null,
    task: null,
  }));
  return { items, total: items.length < FEED_ITEMS_LIMIT ? items.length : await countHistory(objectType, objectId) };
}

/**
 * Emails du journal qui portent la référence de la fiche (D10) : lecture seule, sujet et statut. Le
 * journal borne déjà sa propre lecture ; le fil n'en garde que les plus récents.
 */
async function emailItems(objectType: string, objectId: string): Promise<FeedPart> {
  const entries = await listEmailLog({ objectType, objectId });
  const items = entries.slice(0, FEED_ITEMS_LIMIT).map((entry) => ({
    id: `email:${entry.id}`,
    kind: EMAIL,
    at: entry.createdAt.toISOString(),
    author: entry.author,
    text: entry.subject,
    source: null,
    status: entry.status,
    task: null,
  }));
  return { items, total: entries.length };
}

/**
 * Entrées du fil d'une fiche, toutes provenances mêlées, la plus récente d'abord, bornées à
 * `FEED_ITEMS_LIMIT` ; `more` dit combien d'entrées plus anciennes n'ont pas été chargées. Le tri est
 * stable : deux entrées de même date gardent l'ordre de leur provenance, jamais un ordre au hasard.
 * Les options d'utilisateurs sont reçues, jamais relues : la fiche les a déjà lues pour ses champs.
 */
export async function listFeed(objectType: string, objectId: string, users: readonly UserOption[]): Promise<Feed> {
  const parts = await Promise.all([activityItems(objectType, objectId), changeItems(objectType, objectId, users), emailItems(objectType, objectId)]);
  const merged = parts.flatMap((part) => part.items).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const items = merged.slice(0, FEED_ITEMS_LIMIT);
  return { items, more: Math.max(parts.reduce((total, part) => total + part.total, 0) - items.length, 0) };
}
