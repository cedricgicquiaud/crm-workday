/**
 * Part serveur du registre d'objets : la table Drizzle de chaque objet (colonnes de base
 * `id`, `owner_id`, `created_by`, `created_at`, `updated_at`, `archived_at`), la recherche, la clé
 * de doublon, et ce que la fiche montre sous « Champs » (les sections de l'objet, D20). Le service
 * générique, la fiche et l'API de l'historique lisent ce registre.
 */
import type { PgTable } from "drizzle-orm/pg-core";
import type { ReactNode } from "react";
import type { ObjectRecord } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import type { Executor } from "@/lib/db";

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
  /**
   * Ce que cette ligne portait, en toutes lettres, pour l'entrée de fusion qui la consigne avant de
   * la supprimer (D16) : un statut par son libellé, une entreprise par son nom, des modules par les
   * leurs. Absent, la ligne est consignée colonne par colonne, ce qui suffit à une famille simple.
   */
  describe?: (row: Record<string, unknown>, record: ObjectRecord) => Promise<string>;
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
  /**
   * Lecture d'une fiche pour son écran, quand elle ne se résume pas aux colonnes de sa table : la
   * personne y joint ses autres adresses et le poste de son profil contact. Absent, la fiche est lue
   * par la lecture générique du service.
   */
  loadRecord?: (id: string) => Promise<ObjectRecord>;
  /**
   * Compléments d'une fiche que sa table ne porte pas : les champs d'un profil, ses modules, le nom
   * d'une fiche liée (D19). Le service l'appelle à **chaque** lecture — une fiche, une liste — et lui
   * passe toutes les fiches d'un coup : un complément se lit en une requête, pas une par ligne.
   * Absent, une fiche se résume aux colonnes de sa table et à ses valeurs personnalisées.
   */
  attach?: (records: readonly ObjectRecord[]) => Promise<ObjectRecord[]>;
  /**
   * Recalcule les champs dérivés d'une fiche après une écriture que le mécanisme ne connaît pas (une
   * fusion, qui déplace des profils) : « Profils » se déduit des profils présents, il ne se recopie
   * jamais (D8). Appelé dans la transaction de l'écriture, pour que la fiche n'existe pas un instant
   * avec un champ dérivé faux.
   */
  recompute?: (id: string, exec: Executor) => Promise<void>;
};

const objects = new Map<string, ServerObjectDefinition>();

/**
 * Déclare la part serveur d'un objet. Une section sans chargeur, sans rendu, ou dont la clé est déjà
 * prise échoue ici, à l'enregistrement, pas au rendu : la fiche de la première personne ouverte n'a
 * pas à découvrir qu'une section est incomplète, ni à en perdre une parce que deux portent la même
 * clé (elles se rendraient dans un ordre arbitraire sous la même clé React).
 */
export function registerServerObject(definition: ServerObjectDefinition): void {
  const keys = new Set<string>();
  for (const section of definition.sections ?? []) {
    if (typeof section.load !== "function") throw new Error(`Objet « ${definition.key} » : la section « ${section.key} » n'a pas de chargeur.`);
    if (typeof section.render !== "function") throw new Error(`Objet « ${definition.key} » : la section « ${section.key} » n'a pas de rendu.`);
    if (keys.has(section.key)) throw new Error(`Objet « ${definition.key} » : la section « ${section.key} » est déclarée deux fois.`);
    keys.add(section.key);
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
