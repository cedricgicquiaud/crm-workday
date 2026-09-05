/**
 * Lecture des descripteurs de champs d'un objet. La livraison 2.4 y ajoutera les champs
 * personnalisés définis par un administrateur, sans que les lecteurs changent.
 */
import { getObject, type FieldDescriptor } from "@/features/objects/registry";

/** Champs d'un objet, dans l'ordre d'affichage (`order` croissant). */
export function fieldsOf(type: string): readonly FieldDescriptor[] {
  return [...getObject(type).fields].sort((a, b) => a.order - b.order);
}
