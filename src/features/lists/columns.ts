/**
 * Colonnes possibles d'une liste : les champs déclarés par l'objet, plus la colonne de base
 * « Modifiée le » que la liste rend elle-même. Elle s'affiche comme les autres, donc elle se
 * masque et se déplace comme les autres : une colonne visible que le menu ne proposerait pas
 * serait un réglage muet. Seule la colonne titre reste fixe, et le menu ne la propose pas.
 */
import { UPDATED_AT } from "@/features/lists/sort";
import { fieldsOf } from "@/features/objects/fields";
import { getList, type FieldDescriptor } from "@/features/objects/registry";

/**
 * Descripteur de la colonne de base : elle ne vient pas des champs de l'objet — aucune fiche ne la
 * saisit — mais le menu des colonnes, l'URL et le tableau la lisent comme un champ de plus.
 */
export const UPDATED_AT_COLUMN: FieldDescriptor = { key: UPDATED_AT, label: "Modifiée le", type: "date", editable: false, sortable: true, order: Number.MAX_SAFE_INTEGER };

/** Colonnes qu'une liste sait afficher, dans l'ordre des descripteurs, la colonne de base en dernier. */
export function columnsOf(list: string): readonly FieldDescriptor[] {
  return [...fieldsOf(getList(list).objectKey), UPDATED_AT_COLUMN];
}

/** Colonnes visibles par défaut après la colonne titre : celles que la liste déclare, puis la colonne de base. */
export function defaultColumnKeys(list: string): string[] {
  return [...(getList(list).columns ?? []), UPDATED_AT];
}
