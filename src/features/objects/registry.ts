/**
 * Registre d'objets (D4, « règle de branchement »). Chaque objet (entreprise, personne, puis
 * opportunité, mission…) se déclare ici à son chargement, comme les entrées de la palette : les
 * mécanismes communs (fiche, liste, historique, colonne des liens, recherche) lisent ce registre et
 * ne nomment jamais un objet. Ce fichier est importable côté client : aucune table, aucune base.
 * La part serveur (table Drizzle, recherche) vit dans `registry.server.ts`.
 */
import type { LucideIcon } from "lucide-react";

/** `multilist` : plusieurs valeurs d'une liste fermée dans un même champ (modules Workday, Profils, D19). */
export type FieldType = "text" | "list" | "date" | "number" | "user" | "multilist";

export type ListValue = { value: string; label: string };

/** Descripteur d'un champ : il pilote la section des champs de la fiche, l'édition en place, l'historique, puis les colonnes, filtres et tri (2.5a) et les champs personnalisés (2.4). */
export type FieldDescriptor = {
  /** clé du champ, égale au nom de la colonne Drizzle en camelCase (`paymentTerms`) */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** valeurs d'une liste fermée (`type: "list"` ou `"multilist"`) */
  values?: readonly ListValue[];
  /** valeurs retirées de la liste (2.4) : lisibles sur les fiches qui les portent, marquées « retirée », jamais proposées */
  retiredValues?: readonly ListValue[];
  /** valeur posée à la création quand le champ est absent ; pour un champ `user`, `"actor"` désigne le créateur */
  default?: string;
  /** faux : lecture seule sur la fiche (défaut : vrai) */
  editable?: boolean;
  /** un `multilist` se trie sur ses libellés joints (D11) */
  sortable?: boolean;
  maxLength?: number;
  /** nombre : borne basse acceptée (D5, D7) */
  min?: number;
  /** nombre : borne haute acceptée */
  max?: number;
  /** nombre : décimales acceptées au plus ; absent, le nombre en prend autant qu'il veut */
  decimals?: number;
  /** nombre : seul un entier est accepté (« 6,5 » refusé, D7) */
  integer?: boolean;
  /** nombre : unité écrite après la valeur (« 650,00 € ») */
  unit?: string;
  /** ce qu'un ensemble vide affiche (« Aucun », D8) ; absent, il s'écrit « — » comme toute valeur absente */
  emptyLabel?: string;
  /**
   * Champ d'un profil de la fiche (D19) : il se rend dans la section de son profil et jamais dans
   * « Champs », se règle par l'API de ce profil (celle de l'objet le refuse), s'exclut du dialogue de
   * création de l'objet et de l'édition en cellule ; `required` s'entend dans le profil. Il reste
   * colonne, filtre et tri de la liste. Le libellé sert au refus (« … se règle sur le profil consultant »).
   */
  profile?: { key: string; label: string };
  /** texte : espaces retirés, casse… appliquée avant la validation et l'enregistrement */
  normalize?: (value: string) => string;
  /** texte : forme attendue après normalisation, et message de la règle */
  pattern?: { regex: RegExp; message: string };
  /** texte : une valeur déjà portée par une autre fiche (archivée comprise) est refusée (409, D19) */
  unique?: boolean;
  /** début de la phrase du refus 409 (« Le SIREN 123456789 est déjà porté ») ; le service y ajoute la fiche qui le porte */
  uniqueMessage?: (value: string) => string;
  /** texte long (notes) : zone de texte plutôt qu'un champ d'une ligne */
  multiline?: boolean;
  /** occupe toute la largeur de sa section sur la fiche (raison sociale, rue) */
  wide?: boolean;
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
  /** adresse de la liste (`/entreprises`), pour la barre latérale */
  listHref: string;
  /** racine des routes d'API de l'objet (`/api/entreprises`) */
  apiBase: string;
  /** champ affiché comme titre de la fiche et première colonne de la liste */
  titleField: string;
  fields: readonly FieldDescriptor[];
  /**
   * Descripteurs de champs historisés mais édités hors de la section des champs de la fiche (une
   * section propre à l'objet). L'historique y lit leur libellé ; sans eux il afficherait la clé brute.
   */
  historyFields?: readonly FieldDescriptor[];
  relations: readonly Relation[];
  /** objet parent dont le fil reprend les activités de celui-ci (2.3) */
  feedParent?: string;
  /** clés des champs du dialogue de création rapide (cinq au plus, D7) ; défaut : le champ titre */
  quickCreate?: readonly string[];
  /** clés des colonnes de la liste (2.1a : minimal ; 2.5a rend les colonnes configurables) ; défaut : le champ titre */
  listColumns?: readonly string[];
  /**
   * Clés des champs rendus en badge dans l'en-tête de la fiche, après le badge de type et dans cet
   * ordre (« Profils : Contact ») : un champ dérivé se lit d'un coup d'œil sans descendre dans la
   * section « Champs ». Chacune désigne un champ déclaré.
   */
  headerFields?: readonly string[];
};

const objects = new Map<string, ObjectDefinition>();

/**
 * Déclare un objet ; ré-enregistrer la même clé remplace la définition. Un objet mal déclaré (champ
 * titre, colonne de liste ou champ de tête sans champ correspondant) échoue ici, à l'enregistrement,
 * pas au rendu.
 */
export function registerObject(definition: ObjectDefinition): void {
  const keys = new Set(definition.fields.map((field) => field.key));
  if (!keys.has(definition.titleField)) throw new Error(`Objet « ${definition.key} » : le champ titre « ${definition.titleField} » n'est pas déclaré dans ses champs.`);
  for (const column of definition.listColumns ?? []) {
    if (!keys.has(column)) throw new Error(`Objet « ${definition.key} » : la colonne de liste « ${column} » n'est pas déclarée dans ses champs.`);
  }
  for (const key of definition.headerFields ?? []) {
    if (!keys.has(key)) throw new Error(`Objet « ${definition.key} » : le champ de tête « ${key} » n'est pas déclaré dans ses champs.`);
  }
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
