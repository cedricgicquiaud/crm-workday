/**
 * Part serveur du registre d'objets : la table Drizzle de chaque objet (colonnes de base
 * `id`, `owner_id`, `created_by`, `created_at`, `updated_at`, `archived_at`), la recherche, la clé
 * de doublon, et ce que la fiche montre sous « Champs » (les sections de l'objet, D20). Le service
 * générique, la fiche et l'API de l'historique lisent ce registre.
 */
import type { PgTable } from "drizzle-orm/pg-core";
import type { ReactNode } from "react";
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

/** Ce qu'une section reçoit pour se rendre : la fiche, ce que son chargeur a lu, et si la fiche ne s'écrit plus (fiche archivée, D21). */
export type SectionProps<T> = { id: string; data: T; readOnly: boolean };

/**
 * Section propre à un objet, rendue par la fiche générique dans la colonne centrale sous « Champs »
 * (D20) : « Profil contact », puis « Profil consultant ». Elle déclare son chargeur, pour que la
 * fiche lise ses données une fois et les lui passe — une section qui rechargerait pour son compte
 * doublerait les requêtes de la page.
 */
export type ObjectSection<T = unknown> = {
  /** clé de la section, unique dans l'objet */
  key: string;
  /** rang d'affichage croissant sous « Champs » ; l'ordre ne dépend jamais de l'ordre de déclaration */
  order: number;
  load: (id: string) => Promise<T>;
  render: (props: SectionProps<T>) => ReactNode;
};

/**
 * Déclare une section en gardant le lien de type entre son chargeur et son rendu : le rendu reçoit
 * exactement ce que le chargeur a lu. Le registre, lui, les range côte à côte sans connaître leurs
 * données — d'où la seule conversion, ici.
 */
export function defineSection<T>(section: ObjectSection<T>): ObjectSection {
  return section as ObjectSection;
}

export type ServerObjectDefinition = {
  key: string;
  table: PgTable;
  /** fiches non archivées qui répondent à la saisie (sous-chaîne, insensible à la casse et aux accents pour 2.1b) */
  search: (query: string) => Promise<SearchHit[]>;
  /** clé de rapprochement des doublons probables (D19) : deux fiches de même clé sont signalées (2.6a) ; nulle si la fiche n'en a pas */
  duplicateKey: (record: Record<string, unknown>) => string | null;
  /** tables qui dépendent d'une fiche de cet objet, lues par la fusion (2.6a) ; absentes, la fiche n'en a pas */
  dependents?: readonly DependentTable[];
  /** sections propres à l'objet, rendues par la fiche sous « Champs » (D20) ; absentes, la fiche n'en montre aucune */
  sections?: readonly ObjectSection[];
};

const objects = new Map<string, ServerObjectDefinition>();

/**
 * Déclare la part serveur d'un objet. Une section sans chargeur ou sans rendu échoue ici, à
 * l'enregistrement, pas au rendu : la fiche de la première personne ouverte n'a pas à découvrir
 * qu'une section est incomplète.
 */
export function registerServerObject(definition: ServerObjectDefinition): void {
  for (const section of definition.sections ?? []) {
    if (typeof section.load !== "function") throw new Error(`Objet « ${definition.key} » : la section « ${section.key} » n'a pas de chargeur.`);
    if (typeof section.render !== "function") throw new Error(`Objet « ${definition.key} » : la section « ${section.key} » n'a pas de rendu.`);
  }
  objects.set(definition.key, definition);
}

/** Définition serveur d'un objet ; une clé inconnue est une ressource inexistante (404). */
export function getServerObject(key: string): ServerObjectDefinition {
  const definition = objects.get(key);
  if (!definition) throw new HttpError(404, "objet_inconnu", `Aucun objet « ${key} ».`);
  return definition;
}

/** Sections d'un objet, par rang croissant puis par clé ; vide si l'objet n'en déclare aucune. */
export function sectionsOf(key: string): readonly ObjectSection[] {
  return [...(getServerObject(key).sections ?? [])].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}
