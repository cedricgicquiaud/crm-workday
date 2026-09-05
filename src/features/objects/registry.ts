/**
 * Registre d'objets (D4, « règle de branchement »). Chaque objet (entreprise, personne, puis
 * opportunité, mission…) se déclare ici à son chargement, comme les entrées de la palette : les
 * mécanismes communs (fiche, liste, historique, colonne des liens, recherche) lisent ce registre et
 * ne nomment jamais un objet. Ce fichier est importable côté client : aucune table, aucune base.
 * La part serveur (table Drizzle, recherche) vit dans `registry.server.ts`.
 */
import type { LucideIcon } from "lucide-react";

export type FieldType = "text" | "list" | "date" | "number" | "user";

export type ListValue = { value: string; label: string };

/** Descripteur d'un champ : il pilote la section des champs de la fiche, l'édition en place, l'historique, puis les colonnes, filtres et tri (2.5a) et les champs personnalisés (2.4). */
export type FieldDescriptor = {
  /** clé du champ, égale au nom de la colonne Drizzle en camelCase (`paymentTerms`) */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** valeurs d'une liste fermée (`type: "list"`) */
  values?: readonly ListValue[];
  /** valeur posée à la création quand le champ est absent ; pour un champ `user`, `"actor"` désigne le créateur */
  default?: string;
  /** faux : lecture seule sur la fiche (défaut : vrai) */
  editable?: boolean;
  sortable?: boolean;
  maxLength?: number;
  /** texte : espaces retirés, casse… appliquée avant la validation et l'enregistrement */
  normalize?: (value: string) => string;
  /** texte : forme attendue après normalisation, et message de la règle */
  pattern?: { regex: RegExp; message: string };
  /** texte : une valeur déjà portée par une autre fiche (archivée comprise) est refusée (409, D19) */
  unique?: boolean;
  /** texte long (notes) : zone de texte plutôt qu'un champ d'une ligne */
  multiline?: boolean;
  /** groupe d'affichage sur la fiche (« Adresse ») ; sans section, le champ est dans le groupe principal */
  section?: string;
  /** rang d'affichage, croissant */
  order: number;
};

/** Relation déclarée, lue par la colonne des liens de la fiche, la fusion et la suppression (D4). */
export type Relation = {
  /** clé de l'objet lié */
  to: string;
  /** colonne de l'objet lié qui porte la clé étrangère */
  fkColumn: string;
  label: string;
  inverseLabel: string;
  /** champ du dialogue de création rapide pré-rempli depuis cette fiche (« ajouter un contact ») */
  prefill?: string;
};

export type ObjectLabels = { singular: string; plural: string; article: string };

export type ObjectDefinition = {
  /** clé d'objet : aussi l'`object_type` du journal des emails et de l'historique */
  key: string;
  /** rang dans la barre latérale et les listes d'objets ; l'ordre ne dépend jamais de l'ordre des imports */
  order: number;
  labels: ObjectLabels;
  icon: LucideIcon;
  href: (id: string) => string;
  /** racine des routes d'API de l'objet (`/api/entreprises`) */
  apiBase: string;
  /** champ affiché comme titre de la fiche et première colonne de la liste */
  titleField: string;
  fields: readonly FieldDescriptor[];
  relations: readonly Relation[];
  /** objet parent dont le fil reprend les activités de celui-ci (2.3) */
  feedParent?: string;
  /** clés des champs du dialogue de création rapide (cinq au plus, D7) ; défaut : le champ titre */
  quickCreate?: readonly string[];
  /** clés des colonnes de la liste (2.1a : minimal ; 2.5a rend les colonnes configurables) ; défaut : le champ titre */
  listColumns?: readonly string[];
};

const objects = new Map<string, ObjectDefinition>();

/** Déclare un objet ; ré-enregistrer la même clé remplace la définition. */
export function registerObject(definition: ObjectDefinition): void {
  objects.set(definition.key, definition);
}

export function getObject(key: string): ObjectDefinition {
  const definition = objects.get(key);
  if (!definition) throw new Error(`Objet inconnu : ${key}`);
  return definition;
}

/** Tous les objets déclarés, par rang croissant puis par clé. */
export function listObjects(): readonly ObjectDefinition[] {
  return Array.from(objects.values()).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}
