/**
 * Part serveur du registre d'objets : la table Drizzle de chaque objet (colonnes de base
 * `id`, `owner_id`, `created_by`, `created_at`, `updated_at`, `archived_at`), la recherche, la clé
 * de doublon, et ce que la fiche montre sous « Champs » (les sections de l'objet, D20). Le service
 * générique, la fiche et l'API de l'historique lisent ce registre.
 */
import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ReactNode } from "react";
import type { Banner } from "@/features/objects/banners";
import type { SerializedRecord } from "@/features/objects/labels";
import type { ListValue } from "@/features/objects/registry";
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
  /**
   * Une ligne au plus par fiche et par valeur de `column` (une proposition par opportunité) : quand la
   * conservée et l'absorbée en portent une chacune, seule reste celle de plus haut `rank`, la conservée
   * l'emportant à égalité ; l'autre est consignée dans l'entrée de fusion puis supprimée (D47).
   */
  oneAtMostPer?: { column: string; rank: (row: Record<string, unknown>) => number };
  /** colonnes de la fiche que cette ligne tient à jour (l'entreprise de rattachement, un champ dérivé) : elles la suivent quand elle change de fiche, sans quoi la fiche conservée porterait un rattachement à moitié */
  carries?: readonly string[];
  /**
   * Ce que cette ligne portait, en toutes lettres, pour l'entrée de fusion qui la consigne avant de
   * la supprimer (D16) : un statut par son libellé, une entreprise par son nom, des modules par les
   * leurs. Absent, la ligne est consignée colonne par colonne, ce qui suffit à une famille simple.
   */
  describe?: (row: Record<string, unknown>, record: ObjectRecord) => Promise<string>;
  /**
   * La ligne retient la suppression définitive de la fiche (D47) : le refus nomme, sous `label`, les
   * fiches de l'objet `to` qu'elle désigne par `fkColumn` — le consultant, les opportunités où il est
   * proposé. Absent, la ligne part avec la fiche ou la bloque en base sans le dire.
   */
  holds?: { to: string; fkColumn: string; label: string };
  /**
   * La ligne désigne aussi une fiche d'un autre objet, qui la voit dans sa colonne des liens (D54) :
   * le consultant voit les opportunités où il est proposé. Absent, la table ne se lit pas là.
   */
  links?: DependentLinks;
};

/**
 * Lecture d'une table dépendante dans la colonne des liens de la fiche qu'elle désigne : l'objet de
 * cette fiche (`to`), la colonne qui la porte, le libellé du groupe et le sous-titre de chaque fiche.
 */
export type DependentLinks = { to: string; fkColumn: string; label: string; subtitle?: LinkSubtitle };

/**
 * Champ à plusieurs valeurs rangé dans une table fille, une ligne par valeur (les modules Workday
 * d'une fiche) : le service écrit l'ensemble avec la fiche, par l'exécuteur de son écriture, et le
 * relit à chaque lecture comme une colonne de la fiche.
 */
export type SetTable = {
  /** clé du champ `multilist` que la table porte */
  field: string;
  table: PgTable;
  /** colonne de la table fille qui porte l'identifiant de la fiche */
  fkColumn: string;
  /** colonne de la table fille qui porte une valeur de l'ensemble */
  valueColumn: string;
};

/**
 * Condition déclarée sur un champ `relation` (D35, D60) : la fiche liée ne se choisit que parmi celles
 * qui la remplissent pour la valeur d'un autre champ de la fiche — le contact d'une opportunité parmi
 * les contacts de son entreprise. La même condition borne les options du sélecteur et refuse l'écriture.
 */
export type RelationScope = {
  /** champ `relation` restreint */
  field: string;
  /** champ de la fiche dont la valeur règle la condition */
  dependsOn: string;
  /** colonne de l'objet lié qui doit porter la valeur de `dependsOn` (l'entreprise de rattachement d'une personne) */
  matches: string;
  /** condition fixe de plus sur l'objet lié (porter un profil contact) */
  where?: SQL;
  /** refus (400 sous le champ) d'une fiche liée qui ne remplit pas la condition */
  refusal: string;
  /** marque d'une fiche liée qui ne remplit plus la condition, depuis le titre de la fiche désignée par `dependsOn` (« a quitté Banque X ») */
  outsideMark: (basisTitle: string) => string;
};

/**
 * Sous-titre d'une fiche liée dans la colonne des liens (D61) : le libellé de la valeur de liste
 * fermée qu'une colonne porte (l'étape d'une opportunité).
 */
export type LinkSubtitle = { column: string; values: readonly ListValue[] };

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

/** Ce qu'une action d'en-tête reçoit pour se rendre : la fiche, prête pour un composant client. */
export type ActionProps = { id: string; record: SerializedRecord };

/**
 * Geste propre à un objet, rendu dans l'en-tête de la fiche à côté du menu d'actions (D21) :
 * « Écarter », « Rouvrir » d'un lead. Il dit quand la fiche le permet ; la fiche montre ceux qui
 * le sont, par rang croissant, et aucun sur une fiche archivée, qui ne s'écrit plus. La route du
 * geste refuse de son côté : cacher un bouton n'est jamais la protection.
 */
export type ObjectAction = {
  /** clé de l'action, unique dans l'objet */
  key: string;
  /** rang d'affichage croissant ; l'ordre ne dépend jamais de l'ordre de déclaration */
  order: number;
  visible: (record: Record<string, unknown>) => boolean;
  render: (props: ActionProps) => ReactNode;
};

/**
 * Ce qu'une valeur saisie rappelle d'une autre fiche (l'email d'un lead déjà porté par une personne,
 * D8) : la fiche, son adresse et la phrase qui la nomme. Un avertissement, jamais un refus.
 */
export type EntryWarning = { id: string; title: string; href: string; message: string };

export type ServerObjectDefinition = {
  key: string;
  table: PgTable;
  /** fiches non archivées qui répondent à la saisie (sous-chaîne, insensible à la casse et aux accents pour 2.1b) */
  search: (query: string) => Promise<SearchHit[]>;
  /** clé de rapprochement des doublons probables (D19) : deux fiches de même clé sont signalées (2.6a) ; nulle si la fiche n'en a pas */
  duplicateKey: (record: Record<string, unknown>) => string | null;
  /**
   * Source déclarée d'avertissement de saisie (D8, D28), lue par la route des doublons de l'objet avec
   * les valeurs du dialogue ou du champ de la fiche : ce qu'elles rappellent d'autres fiches, la fiche
   * en cours de saisie exceptée. Absente, seule la clé de doublon parle.
   */
  entryWarnings?: (values: Record<string, unknown>, exceptId: string | null) => Promise<EntryWarning[]>;
  /** tables qui dépendent d'une fiche de cet objet, lues par la fusion (2.6a) ; absentes, la fiche n'en a pas */
  dependents?: readonly DependentTable[];
  /** champs à plusieurs valeurs rangés dans une table fille ; absents, un ensemble est une colonne de la table */
  sets?: readonly SetTable[];
  /** conditions sur les fiches liées que ses champs `relation` peuvent désigner ; absentes, toute fiche active se choisit */
  relationScopes?: readonly RelationScope[];
  /** sections propres à l'objet, rendues par la fiche sous « Champs » (D20) ; absentes, la fiche n'en montre aucune */
  sections?: readonly ObjectSection[];
  /** gestes d'en-tête propres à l'objet, visibles selon la fiche (D21) ; absents, la fiche n'offre que le menu commun */
  actions?: readonly ObjectAction[];
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
  /**
   * Refus de suppression selon la fiche (D21) : la phrase du refus (409) quand la fiche ne se supprime
   * pas (« un lead converti s'archive »), `null` quand rien dans son état ne la retient. Absent, seules
   * les fiches et entrées qui la désignent la retiennent.
   */
  deletable?: (record: ObjectRecord) => string | null;
  /**
   * Sous-titre des fiches de cet objet dans les groupes inverses des relations nommées par leur clé
   * étrangère (`relations`) : l'étape d'une opportunité sous l'entreprise et le contact (D61). Absent,
   * une fiche liée ne montre que son titre.
   */
  linkSubtitle?: LinkSubtitle & { relations: readonly string[] };
  /** Bannières propres à l'objet, rangées parmi les communes par leur rang déclaré (D21) ; une seule s'affiche. */
  banners?: readonly DeclaredBanner[];
};

/**
 * Source de bannière déclarée par un objet : son rang (`order`, comparé à ceux des signalements
 * communs — archivée 10, doublon 20, tâche échue 30) et ce qu'elle lit de la fiche.
 */
export type DeclaredBanner = { rank: string; order: number; source: (record: ObjectRecord) => Promise<Banner[]> };

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
  const actionKeys = new Set<string>();
  for (const action of definition.actions ?? []) {
    if (actionKeys.has(action.key)) throw new Error(`Objet « ${definition.key} » : l'action « ${action.key} » est déclarée deux fois.`);
    actionKeys.add(action.key);
  }
  objects.set(definition.key, definition);
}

/** Définition serveur d'un objet ; une clé inconnue est une ressource inexistante (404). */
export function getServerObject(key: string): ServerObjectDefinition {
  const definition = objects.get(key);
  if (!definition) throw new HttpError(404, "objet_inconnu", `Aucun objet « ${key} ».`);
  return definition;
}

/** Actions d'en-tête qu'une fiche permet, par rang croissant puis par clé ; aucune sur une fiche archivée (D21). */
export function visibleActions(key: string, record: Record<string, unknown>): readonly ObjectAction[] {
  if (record.archivedAt != null) return [];
  return (getServerObject(key).actions ?? []).filter((action) => action.visible(record)).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/** Sections d'un objet, par rang croissant puis par clé ; vide si l'objet n'en déclare aucune. */
export function sectionsOf(key: string): readonly ObjectSection[] {
  return [...(getServerObject(key).sections ?? [])].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}
