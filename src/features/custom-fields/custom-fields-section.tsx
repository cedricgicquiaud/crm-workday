"use client";

import { setCustomFields, type CustomFieldDefinition } from "@/features/custom-fields/fields-source";

/**
 * Pose côté écran les champs personnalisés que le serveur vient de lire (2.4). `fieldsOf` est
 * synchrone et lu des deux côtés : sans ce dépôt, la fiche, la liste et leurs briques ne verraient
 * dans le navigateur que les champs déclarés au registre.
 *
 * Il se rend avant les briques qui lisent `fieldsOf`, en tête de l'écran, et n'affiche rien : la
 * section « Autres champs » de la fiche est rendue par `FieldsSection`, qui groupe les champs par
 * leur section — un champ personnalisé y arrive comme un champ déclaré.
 */
export function CustomFieldsSource({ definitions }: { definitions: readonly CustomFieldDefinition[] }) {
  setCustomFields(definitions);
  return null;
}
