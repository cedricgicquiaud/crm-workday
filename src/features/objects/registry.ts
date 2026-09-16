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

/**
 * `reserved` : une valeur que seul un geste de l'objet pose (« converti », « écarté » d'un lead, D21).
 * Elle se lit et se filtre comme les autres ; aucun sélecteur ne la propose et l'écriture la refuse (400).
 */
export type ListValue = { value: string; label: string; reserved?: boolean };

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
  /**
   * Le champ se fige selon la fiche (D21) : l'avancement d'un lead écarté. Tant que `test` est vrai,
   * la fiche le lit en texte, sa cellule ne s'édite pas, et l'écriture le refuse (409) avec `message` ;
   * les autres champs de la fiche restent modifiables, à la différence d'une fiche archivée.
   */
  lockedWhen?: { test: (record: Record<string, unknown>) => boolean; message: string };
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
   * `multilist` : les valeurs que porte aussi le champ nommé reçoivent cette marque en colonne
   * (« HCM ✔, Integration » pour les modules certifiés, D10). Deux champs, une seule colonne à lire.
   */
  markedBy?: { field: string; mark: string };
  /**
   * Champ d'un profil de la fiche (D19) : il se rend dans la section de son profil et jamais dans
   * « Champs », se règle par l'API de ce profil (celle de l'objet le refuse), s'exclut du dialogue de
   * création de l'objet et de l'édition en cellule ; `required` s'entend dans le profil. Il reste
   * colonne, filtre et tri de la liste. Le libellé sert au refus (« … se règle sur le profil consultant »).
   */
  profile?: { key: string; label: string };
  /**
   * Champ dérivé (D19) : ce que la liste et la fiche écrivent, rendu depuis la fiche entière (un état
   * qui cite sa date lit les deux). La valeur du champ reste celle que filtrent les opérateurs ;
   * `display` ne dit que comment elle se lit.
   */
  display?: (record: Record<string, unknown>) => string;
  /**
   * Clé de tri d'un champ dérivé, lue depuis la fiche entière (D19) : la liste trie sur elle plutôt que
   * sur le libellé. `null` range la fiche en dernier. Sans `sortable`, elle n'est jamais lue.
   */
  sortKey?: (record: Record<string, unknown>) => string | number | null;
  /** texte : espaces retirés, casse… appliquée avant la validation et l'enregistrement */
  normalize?: (value: string) => string;
  /** texte : forme attendue après normalisation, et message de la règle */
  pattern?: { regex: RegExp; message: string };
  /** texte : une valeur déjà portée par une autre fiche (archivée comprise) est refusée (409, D19) */
  unique?: boolean;
  /** début de la phrase du refus 409 (« Le SIREN 123456789 est déjà porté ») ; le service y ajoute la fiche qui le porte */
  uniqueMessage?: (value: string) => string;
  /**
   * À la saisie sur la fiche, la valeur enregistrée est soumise à la source d'avertissement que l'objet
   * déclare (route des doublons, D8) : ce qu'elle rappelle d'autres fiches s'affiche sous le champ, sans rien bloquer.
   */
  entryWarning?: boolean;
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
  /**
   * La colonne des liens de la fiche désignée garde les fiches qui la désignent même archivées,
   * marquées « archivée » (D21) : la trace d'origine prime (« Issu du lead … »). Défaut : elles sortent.
   */
  keepArchived?: boolean;
};

/** Ce qu'une phrase d'historique déclarée lit d'une entrée. */
export type HistoryEntryText = { oldValue: string | null; newValue: string | null };

export type ObjectLabels = { singular: string; plural: string; article: string };

/**
 * Filtre qu'une liste déclarée applique toujours, côté serveur (D10) : il dit ce que la liste est
 * (« les personnes qui portent un profil consultant »). L'URL ne peut pas le retirer — un filtre
 * ajouté à la main s'ajoute au sien, il ne le remplace pas.
 */
export type ListFilter = { field: string; operator: string; value: string };

/** Création rapide offerte par une liste (D12) : quel dialogue, quels champs, quelle API. */
export type ListCreate = {
  /** racine de l'API appelée par le dialogue ; défaut : celle de l'objet */
  apiBase?: string;
  /** clés des champs du dialogue, cinq au plus ; défaut : le `quickCreate` de l'objet */
  fields?: readonly string[];
  /** libellé du bouton et du dialogue ; défaut : « Nouvelle … » de l'objet */
  label?: string;
};

/**
 * Une liste d'un objet, nommée et restreinte (D10) : « Consultants » est la liste des personnes qui
 * portent un profil consultant. La barre latérale, l'URL, les colonnes et les vues la lisent comme
 * elles lisent la liste d'un objet — c'est la même chose, avec un filtre de base et un nom à elle.
 */
export type ListDeclaration = {
  /** clé de la liste, unique parmi les objets et les listes : les vues et les épingles s'y rangent */
  key: string;
  label: string;
  /** singulier du compteur de pied (« 1 consultant ») ; défaut : le singulier de l'objet */
  singular?: string;
  icon: LucideIcon;
  /** adresse de la liste (`/consultants`) */
  href: string;
  /** rang dans la barre latérale ; l'ordre ne dépend jamais de l'ordre des imports */
  order: number;
  baseFilters?: readonly ListFilter[];
  /** colonnes visibles par défaut après la colonne titre */
  columns?: readonly string[];
  /** nom de la vue par défaut de cette liste (« Tous les consultants ») */
  defaultViewName: string;
  /**
   * État de la vue par défaut, en paramètres d'URL (« f=stage:n_est_pas:converti&tri=createdAt:desc »,
   * D10) : l'adresse nue l'ouvre, et ce que l'adresse porte l'emporte famille par famille. Absent, la
   * vue par défaut est la liste nue. Contrairement au filtre de base, ses puces se retirent.
   */
  defaultViewQuery?: string;
  /** `false` : la liste n'offre pas de création */
  create?: ListCreate | false;
};

/** Une liste résolue : celle que l'objet a implicitement, ou une liste qu'il déclare. */
export type ListDefinition = ListDeclaration & { objectKey: string };

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
  /**
   * La fiche entière se fige selon son état (D21) : tant que `test` est vrai, aucun de ses champs ne
   * s'écrit (409 avec `message`) et la fiche les lit en texte ; à la différence d'une fiche archivée,
   * son fil reste ouvert (notes, appels, tâches).
   */
  frozen?: { test: (record: Record<string, unknown>) => boolean; message: string };
  /**
   * Actions d'historique propres aux gestes de l'objet (« conversion »), et la phrase qui les raconte
   * dans le fil (« Converti en … »). Le journal les range comme les actions communes.
   */
  historyActions?: Readonly<Record<string, (entry: HistoryEntryText) => string>>;
  /** `false` : les fiches de cet objet ne se fusionnent pas (un lead, D9) — la fusion répond 405 et le menu ne la propose pas ; défaut : vrai */
  mergeable?: boolean;
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
  /**
   * Listes nommées de cet objet, en plus de la sienne (D10) : une clé, un libellé, une icône, une
   * adresse, un rang, un filtre de base, ses colonnes, le nom de sa vue par défaut et sa création.
   */
  lists?: readonly ListDeclaration[];
  /** Vue par défaut de la liste de l'objet, quand elle n'est pas « Tous les … » sans puce (« Leads en cours », D10) : son nom et son état. */
  defaultView?: { name: string; query: string };
};

/**
 * Colonnes de base que toute liste rend elle-même (« Créé le », « Modifiée le », D10) : aucune fiche
 * ne les saisit, mais une liste peut les citer dans ses colonnes (D26), à la place où elle les veut.
 */
export const BASE_COLUMN_KEYS: readonly string[] = ["createdAt", "updatedAt"];

const objects = new Map<string, ObjectDefinition>();

/**
 * Déclare un objet ; ré-enregistrer la même clé remplace la définition. Un objet mal déclaré (champ
 * titre, colonne de liste ou champ de tête sans champ correspondant) échoue ici, à l'enregistrement,
 * pas au rendu.
 */
export function registerObject(definition: ObjectDefinition): void {
  const keys = new Set(definition.fields.map((field) => field.key));
  if (!keys.has(definition.titleField)) throw new Error(`Objet « ${definition.key} » : le champ titre « ${definition.titleField} » n'est pas déclaré dans ses champs.`);
  const columnKeys = new Set([...keys, ...BASE_COLUMN_KEYS]);
  for (const column of definition.listColumns ?? []) {
    if (!columnKeys.has(column)) throw new Error(`Objet « ${definition.key} » : la colonne de liste « ${column} » n'est pas déclarée dans ses champs.`);
  }
  for (const key of definition.headerFields ?? []) {
    if (!keys.has(key)) throw new Error(`Objet « ${definition.key} » : le champ de tête « ${key} » n'est pas déclaré dans ses champs.`);
  }
  for (const list of definition.lists ?? []) {
    for (const column of list.columns ?? []) {
      if (!columnKeys.has(column)) throw new Error(`Objet « ${definition.key} » : la colonne « ${column} » de la liste « ${list.key} » n'est pas déclarée dans ses champs.`);
    }
    for (const filter of list.baseFilters ?? []) {
      if (!keys.has(filter.field)) throw new Error(`Objet « ${definition.key} » : le filtre de base de la liste « ${list.key} » porte sur « ${filter.field} », qui n'est pas un de ses champs.`);
    }
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

/** « Toutes les entreprises », « Tous les consultants » : le déterminant vient de l'article déclaré. */
const allLabel = (labels: ObjectLabels) => `${labels.article === "un" ? "Tous les" : "Toutes les"} ${labels.plural.toLowerCase()}`;

/** La liste qu'un objet a sans rien déclarer : toutes ses fiches, sous son nom pluriel. */
function ownList(definition: ObjectDefinition): ListDefinition {
  return {
    key: definition.key,
    objectKey: definition.key,
    label: definition.labels.plural,
    singular: definition.labels.singular,
    icon: definition.icon,
    href: definition.listHref,
    order: definition.order,
    columns: definition.listColumns,
    defaultViewName: definition.defaultView?.name ?? allLabel(definition.labels),
    defaultViewQuery: definition.defaultView?.query,
  };
}

/**
 * Toutes les listes : celle de chaque objet, puis celles que les objets déclarent, par rang croissant
 * puis par clé. C'est ce que lisent la barre latérale, les vues et les épingles.
 */
export function listLists(): readonly ListDefinition[] {
  return listObjects()
    .flatMap((definition) => [ownList(definition), ...(definition.lists ?? []).map((list) => ({ ...list, objectKey: definition.key }))])
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/** Une liste par sa clé, ou rien : une vue enregistrée survit au retrait de sa liste, mais ne s'ouvre plus. */
export function findList(key: string): ListDefinition | undefined {
  return listLists().find((list) => list.key === key);
}

/** Une liste par sa clé ; une clé inconnue est une erreur de programmation, comme un objet inconnu. */
export function getList(key: string): ListDefinition {
  const list = findList(key);
  if (!list) throw new Error(`Liste inconnue : ${key}`);
  return list;
}
