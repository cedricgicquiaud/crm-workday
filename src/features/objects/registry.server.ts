/**
 * Part serveur du registre d'objets : la table Drizzle de chaque objet (colonnes de base
 * `id`, `owner_id`, `created_by`, `created_at`, `updated_at`, `archived_at`), la recherche et
 * la clé de doublon. Le service générique et l'API de l'historique lisent ce registre.
 */
import type { PgTable } from "drizzle-orm/pg-core";
import { HttpError } from "@/lib/auth/session";

/** Résultat de recherche (palette Cmd+K, 2.1b) : la fiche, son titre et un sous-titre facultatif. */
export type SearchHit = { id: string; title: string; subtitle?: string };

export type ServerObjectDefinition = {
  key: string;
  table: PgTable;
  /** fiches non archivées qui répondent à la saisie (sous-chaîne, insensible à la casse et aux accents pour 2.1b) */
  search: (query: string) => Promise<SearchHit[]>;
};

const objects = new Map<string, ServerObjectDefinition>();

export function registerServerObject(definition: ServerObjectDefinition): void {
  objects.set(definition.key, definition);
}

/** Définition serveur d'un objet ; une clé inconnue est une ressource inexistante (404). */
export function getServerObject(key: string): ServerObjectDefinition {
  const definition = objects.get(key);
  if (!definition) throw new HttpError(404, "objet_inconnu", `Aucun objet « ${key} ».`);
  return definition;
}
