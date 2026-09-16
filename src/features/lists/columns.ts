/**
 * Colonnes possibles d'une liste : les champs déclarés par l'objet, plus les colonnes de base
 * « Créé le » et « Modifiée le » que la liste rend elle-même. Elles s'affichent comme les autres,
 * donc elles se masquent et se déplacent comme les autres : une colonne visible que le menu ne
 * proposerait pas serait un réglage muet. Seule la colonne titre reste fixe, et le menu ne la propose pas.
 */
import { CREATED_AT, UPDATED_AT } from "@/features/lists/sort";
import { fieldsOf } from "@/features/objects/fields";
import { getList, type FieldDescriptor } from "@/features/objects/registry";

/**
 * Descripteurs des colonnes de base : ils ne viennent pas des champs de l'objet — aucune fiche ne les
 * saisit — mais le menu des colonnes, l'URL et le tableau les lisent comme des champs de plus.
 */
export const CREATED_AT_COLUMN: FieldDescriptor = { key: CREATED_AT, label: "Créé le", type: "date", editable: false, sortable: true, order: Number.MAX_SAFE_INTEGER - 1 };
export const UPDATED_AT_COLUMN: FieldDescriptor = { key: UPDATED_AT, label: "Modifiée le", type: "date", editable: false, sortable: true, order: Number.MAX_SAFE_INTEGER };

/** Colonnes qu'une liste sait afficher, dans l'ordre des descripteurs, les colonnes de base en dernier. */
export function columnsOf(list: string): readonly FieldDescriptor[] {
  return [...fieldsOf(getList(list).objectKey), CREATED_AT_COLUMN, UPDATED_AT_COLUMN];
}

/** Colonnes visibles par défaut après la colonne titre : celles que la liste déclare, puis la colonne de base. */
export function defaultColumnKeys(list: string): string[] {
  return [...(getList(list).columns ?? []), UPDATED_AT];
}
