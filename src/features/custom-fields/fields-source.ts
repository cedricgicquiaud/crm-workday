/**
 * Source des champs personnalisés (D4, 2.4) : les définitions posées par un administrateur
 * deviennent des descripteurs de champs, comme ceux qu'un objet déclare au registre. Les dix
 * lecteurs de `fieldsOf` — fiche, colonnes, filtres, tri, création rapide — n'en savent rien.
 *
 * Le jeu de définitions est tenu ici, en mémoire, parce que `fieldsOf` est synchrone et lu des deux
 * côtés : le serveur le remplit à chaque rendu (`loadCustomFields`), l'écran le reçoit sérialisé et
 * le repose avant de rendre ses briques (`CustomFieldsSource`). Ce fichier ne connaît ni base ni objet.
 */
import type { FieldDescriptor, FieldType } from "@/features/objects/registry";

/** Un libellé de champ tient sur une ligne de fiche et de menu de colonnes. */
export const CUSTOM_FIELD_LABEL_MAX = 120;

/** Types qu'un champ personnalisé peut prendre (D : ni formule, ni relation, ni choix multiple en V1). */
export const CUSTOM_FIELD_TYPES = ["text", "list", "date", "number"] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Une définition telle qu'elle vit en base et telle que l'écran la reçoit : rien que du sérialisable. */
export type CustomFieldDefinition = {
  id: string;
  /** clé d'objet du registre (`company`, `person`…) */
  objectType: string;
  label: string;
  type: CustomFieldType;
  /** valeurs d'une liste ; la valeur enregistrée est le libellé saisi par l'administrateur */
  values: readonly string[];
  /** valeurs retirées de la liste : les fiches qui les portent les lisent encore, marquées « retirée » */
  retiredValues: readonly string[];
  required: boolean;
  /** rang d'affichage choisi par l'administrateur : l'ordre s'enregistre, il ne se déduit pas */
  position: number;
  /** archivé : la valeur reste lisible, le champ ne se saisit plus et sort des filtres */
  archived: boolean;
};

/** Préfixe des clés de champs personnalisés : aucune colonne Drizzle en camelCase ne peut le porter. */
export const CUSTOM_FIELD_PREFIX = "cf_";

/** Clé d'un champ personnalisé, stable : elle survit au changement de libellé, donc les vues aussi. */
export const customFieldKey = (id: string): string => `${CUSTOM_FIELD_PREFIX}${id}`;

export const isCustomFieldKey = (key: string): boolean => key.startsWith(CUSTOM_FIELD_PREFIX);

/** Groupe d'affichage des champs personnalisés sur la fiche. */
export const CUSTOM_FIELDS_SECTION = "Autres champs";

/** Les champs personnalisés s'affichent après tous les champs déclarés, quel que soit leur rang. */
const CUSTOM_ORDER_BASE = 1_000_000;

/** La valeur enregistrée d'une liste personnalisée est son libellé : l'administrateur n'en saisit qu'un. */
const asListValue = (value: string) => ({ value, label: value });

/** Descripteur de champ d'une définition : à partir d'ici, plus rien ne distingue un champ personnalisé. */
export function toDescriptor(definition: CustomFieldDefinition): FieldDescriptor {
  return {
    key: customFieldKey(definition.id),
    label: definition.label,
    type: definition.type as FieldType,
    required: definition.required,
    values: definition.type === "list" ? definition.values.map(asListValue) : undefined,
    retiredValues: definition.type === "list" ? definition.retiredValues.map(asListValue) : undefined,
    sortable: true,
    /* Archivé : la valeur se lit, elle ne se saisit plus (contrat 19). */
    editable: !definition.archived,
    section: CUSTOM_FIELDS_SECTION,
    order: CUSTOM_ORDER_BASE + definition.position,
  };
}

/** Définitions par objet, remplacées en bloc : le jeu lu par l'écran est toujours celui du dernier rendu. */
let definitions: readonly CustomFieldDefinition[] = [];

export function setCustomFields(next: readonly CustomFieldDefinition[]): void {
  definitions = next;
}

/** Définitions d'un objet, dans l'ordre choisi par l'administrateur. */
function definitionsOf(type: string): CustomFieldDefinition[] {
  return definitions.filter((definition) => definition.objectType === type).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
}

/** Champs personnalisés qui se saisissent et se filtrent : les champs archivés n'en sont plus. */
export function customFieldsOf(type: string): readonly FieldDescriptor[] {
  return definitionsOf(type)
    .filter((definition) => !definition.archived)
    .map(toDescriptor);
}

/**
 * Tous les champs personnalisés d'un objet, archivés compris : leur valeur reste lisible sur les
 * fiches qui en portent une, et l'historique nomme leur libellé longtemps après leur archivage.
 */
export function allCustomFieldsOf(type: string): readonly FieldDescriptor[] {
  return definitionsOf(type).map(toDescriptor);
}
