/**
 * Vues sauvegardées (D18, contrat 24) : l'état d'une liste — filtres, tri, colonnes — rangé sous un
 * nom. Mécanisme commun à tout objet : il ne connaît que la clé d'objet du registre (D4). Une vue
 * est partagée par toute l'équipe (D11) : tout membre la voit, la modifie et la supprime. Chaque
 * objet ouvre sa liste de vues sur une vue par défaut synthétique (« Toutes les entreprises »),
 * qui n'est pas en base et ne se renomme ni ne se supprime.
 */
import "@/features/objects/manifest.server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { savedView } from "@/db/schema";
import { applyViewParams, DEFAULT_VIEW, parseListState, readViewId, type ListState } from "@/features/lists/url-state";
import { findList, getList } from "@/features/objects/registry";
import type { Actor } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type SavedViewRow = typeof savedView.$inferSelect;

/** Une vue telle que la barre des vues la lit : la vue par défaut et les vues enregistrées ont la même forme. */
export type ViewSummary = { id: string; objectType: string; name: string; query: string };

/** L'identifiant de la vue par défaut vit avec le paramètre `vue=` de l'URL, seul endroit qui le nomme. */
export { DEFAULT_VIEW };

export const VIEW_NAME_MAX = 120;

/** Vrai si la liste est déclarée au registre : une vue survit au retrait de sa liste, mais aucune liste ne s'ouvre alors. */
const isDeclared = (type: string) => findList(type) !== undefined;

/** Vue par défaut d'une liste : aucun paramètre, donc la liste nue, sous le nom qu'elle déclare. */
export function defaultView(type: string): ViewSummary {
  return { id: DEFAULT_VIEW, objectType: type, name: getList(type).defaultViewName, query: "" };
}

const summarize = (row: SavedViewRow): ViewSummary => ({ id: row.id, objectType: row.objectType, name: row.name, query: row.query });

/** Vues d'une liste : la vue par défaut, puis les vues enregistrées par ordre alphabétique ; 404 sur une liste qui n'existe pas (D24). */
export async function listViews(type: string): Promise<ViewSummary[]> {
  if (!isDeclared(type)) throw new HttpError(404, "objet_inconnu", `Aucune liste « ${type} ».`);
  const rows = await db.select().from(savedView).where(eq(savedView.objectType, type)).orderBy(asc(savedView.name));
  return [defaultView(type), ...rows.map(summarize)];
}

const nameSchema = z.string().trim().min(1).max(VIEW_NAME_MAX);
const querySchema = z.string().max(2_000);

const asRecord = (input: unknown): Record<string, unknown> => (typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {});

/** 400 dont le message est celui du champ fautif, rendu aussi par champ pour l'écran. */
function invalid(field: string, message: string): never {
  throw new HttpError(400, "donnees_invalides", message, { fields: { [field]: message } });
}

/** Clé de la liste : une vue est toujours la vue d'une liste (celle d'un objet, ou une liste déclarée). */
function parseObjectType(value: unknown): string {
  const parsed = z.string().trim().min(1).safeParse(value);
  return parsed.success ? parsed.data : invalid("objectType", "Une vue se range sous la liste d'un objet.");
}

/** Nom d'une vue : obligatoire, 120 caractères au plus, espaces de bordure retirés. */
function parseName(value: unknown): string {
  const parsed = nameSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const tooLong = typeof value === "string" && value.trim().length > VIEW_NAME_MAX;
  return invalid("name", tooLong ? `Le nom d'une vue tient en ${VIEW_NAME_MAX} caractères.` : "Le nom d'une vue est obligatoire.");
}

/** État de la liste : la chaîne de paramètres d'URL, telle que la liste l'écrit. */
function parseQuery(value: unknown): string {
  const parsed = querySchema.safeParse(value ?? "");
  return parsed.success ? parsed.data : invalid("query", "L'état de cette vue est illisible.");
}

/**
 * Deux vues du même nom sur le même objet seraient indiscernables dans la barre (contrat 26) ; le
 * nom de la vue par défaut se lit dans cette même barre, il n'est pas libre non plus.
 */
async function assertNameFree(objectType: string, name: string, currentId: string | null): Promise<void> {
  const conditions = [eq(savedView.objectType, objectType), eq(savedView.name, name)];
  if (currentId) conditions.push(ne(savedView.id, currentId));
  const [existing] = await db.select({ id: savedView.id }).from(savedView).where(and(...conditions)).limit(1);
  if (existing || (isDeclared(objectType) && defaultView(objectType).name === name)) {
    throw new HttpError(409, "nom_deja_pris", `« ${name} » est déjà le nom d'une vue de cette liste.`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new HttpError(404, "vue_introuvable", "Vue introuvable.");

/** La vue par défaut n'est pas une ligne : elle ne se renomme ni ne se supprime (contrat 26). */
function assertNotDefault(id: string): void {
  if (id === DEFAULT_VIEW) throw new HttpError(409, "vue_par_defaut", "La vue par défaut d'une liste ne se renomme ni ne se supprime.");
}

/** Lit une vue ; une vue inconnue est une ressource inexistante (404), et un identifiant qui n'est pas un UUID aussi : Postgres n'est jamais interrogé avec. */
export async function getView(id: string): Promise<SavedViewRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await db.select().from(savedView).where(eq(savedView.id, id)).limit(1);
  if (!row) throw notFound();
  return row;
}

/** Enregistre l'état courant d'une liste sous un nom : 400 nom hors règle, 409 nom déjà pris sur cet objet. */
export async function createView(input: unknown, actor: Actor): Promise<SavedViewRow> {
  const raw = asRecord(input);
  const objectType = parseObjectType(raw.objectType);
  const name = parseName(raw.name);
  const query = parseQuery(raw.query);
  await assertNameFree(objectType, name, null);
  const [row] = await db
    .insert(savedView)
    .values({ objectType, name, query, createdBy: actor.id })
    .returning();
  return row;
}

/** Renomme une vue ou met à jour son état, pour toute l'équipe (D11) : 400 nom hors règle, 404 vue inconnue, 409 vue par défaut ou nom déjà pris. */
export async function updateView(id: string, input: unknown): Promise<SavedViewRow> {
  assertNotDefault(id);
  const current = await getView(id);
  const raw = asRecord(input);
  const values: { name?: string; query?: string } = {};
  if (raw.name !== undefined) values.name = parseName(raw.name);
  if (raw.query !== undefined) values.query = parseQuery(raw.query);
  if (values.name !== undefined && values.name !== current.name) await assertNameFree(current.objectType, values.name, id);
  const [row] = await db
    .update(savedView)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(savedView.id, id))
    .returning();
  return row;
}

/** Supprime une vue pour toute l'équipe : 404 vue inconnue, 409 vue par défaut. */
export async function deleteView(id: string): Promise<void> {
  assertNotDefault(id);
  await getView(id);
  await db.delete(savedView).where(eq(savedView.id, id));
}

/** Vue d'un objet, ou rien : une vue supprimée par un collègue n'est jamais une erreur d'écran. */
async function findView(type: string, id: string): Promise<SavedViewRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select()
    .from(savedView)
    .where(and(eq(savedView.id, id), eq(savedView.objectType, type)))
    .limit(1);
  return row ?? null;
}

/**
 * État d'une liste ouverte à une adresse : la vue demandée (`vue=`) donne l'état de départ, ce que
 * l'adresse porte elle-même l'emporte famille par famille. L'écran et l'API passent tous deux par
 * ici : une adresse partagée et un appel rendent la même liste (D24).
 */
export async function listStateWithView(type: string, params: URLSearchParams): Promise<ListState> {
  const id = readViewId(params);
  const view = id === null ? null : await findView(type, id);
  return parseListState(type, applyViewParams(view?.query ?? null, params));
}
