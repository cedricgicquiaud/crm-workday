/**
 * Part serveur du registre d'objets : la table Drizzle de chaque objet (colonnes de base
 * `id`, `owner_id`, `created_by`, `created_at`, `updated_at`, `archived_at`), la recherche et
 * la clé de doublon. Le service générique et l'API de l'historique lisent ce registre.
 */
import type { PgTable } from "drizzle-orm/pg-core";
import { HttpError } from "@/lib/auth/session";

/** Résultat de recherche (palette Cmd+K, 2.1b) : la fiche, son titre et un sous-titre facultatif. */
export type SearchHit = { id: string; title: string; subtitle?: string };

/**
 * Table qui dépend d'une fiche sans être un objet du registre : les autres adresses d'une personne,
 * son profil contact. La fusion les compte dans son aperçu et les rattache à la fiche conservée
 * (D20, 2.6a) — la déclaration vit ici, dans le manifeste de l'objet, jamais dans le mécanisme.
 */
export type DependentTable = {
  table: PgTable;
  /** colonne de la table dépendante qui porte l'identifiant de la fiche */
  fkColumn: string;
  /** ce que la famille est pour un lecteur, dans l'aperçu de la fusion */
  label: string;
  /** une ligne au plus par fiche : la conservée garde la sienne, celle de l'absorbée est consignée dans l'historique puis supprimée (D20) */
  oneAtMost?: boolean;
  /** colonnes de la fiche que cette ligne tient à jour (l'entreprise de rattachement, un champ dérivé) : elles la suivent quand elle change de fiche, sans quoi la fiche conservée porterait un rattachement à moitié */
  carries?: readonly string[];
};

export type ServerObjectDefinition = {
  key: string;
  table: PgTable;
  /** fiches non archivées qui répondent à la saisie (sous-chaîne, insensible à la casse et aux accents pour 2.1b) */
  search: (query: string) => Promise<SearchHit[]>;
  /** clé de rapprochement des doublons probables (D19) : deux fiches de même clé sont signalées (2.6a) ; nulle si la fiche n'en a pas */
  duplicateKey: (record: Record<string, unknown>) => string | null;
  /** tables qui dépendent d'une fiche de cet objet, lues par la fusion (2.6a) ; absentes, la fiche n'en a pas */
  dependents?: readonly DependentTable[];
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
