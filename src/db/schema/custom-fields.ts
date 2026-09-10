/**
 * Domaine « Champs personnalisés » (livraison 2.4) : un administrateur définit par objet des champs
 * que le code ne connaît pas. `object_type` est la clé d'objet du registre (`company`, `person`…),
 * et le libellé est unique par objet — deux champs du même nom seraient indiscernables sur la fiche.
 * Un champ ne se supprime pas : il s'archive (`archived_at`), et les valeurs déjà saisies restent
 * lisibles. Une valeur retirée d'une liste passe de `values` à `retired_values`, pour la même raison.
 * Les valeurs des fiches vivent dans `custom_field_value`, une ligne par champ et par fiche :
 * `object_id` désigne la fiche de n'importe quelle table du registre, sans clé étrangère possible.
 */
import { boolean, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const customFieldDefinition = pgTable(
  "custom_field_definition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** clé d'objet du registre (`company`, `person`…) */
    objectType: text("object_type").notNull(),
    /** libellé saisi par l'administrateur (120 caractères au plus), unique par objet */
    label: text("label").notNull(),
    /** `text`, `list`, `date` ou `number` */
    type: text("type").notNull(),
    /** valeurs d'une liste ; la valeur enregistrée sur la fiche est le libellé lui-même */
    values: text("values").array().notNull().default([]),
    /** valeurs retirées de la liste : lisibles sur les fiches qui les portent, plus proposées */
    retiredValues: text("retired_values").array().notNull().default([]),
    required: boolean("required").notNull().default(false),
    /** rang d'affichage choisi par l'administrateur : l'ordre s'enregistre, il ne se déduit pas */
    position: integer("position").notNull(),
    /** archivé : le champ ne se saisit plus et sort des filtres ; sa valeur reste lisible */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("custom_field_definition_object_label_uq").on(t.objectType, t.label)],
);

export const customFieldValue = pgTable(
  "custom_field_value",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => customFieldDefinition.id, { onDelete: "cascade" }),
    /** clé d'objet du registre, pour lire toutes les valeurs d'une liste en une requête */
    objectType: text("object_type").notNull(),
    /** identifiant de la fiche, dans la table que le registre déclare pour cet objet */
    objectId: uuid("object_id").notNull(),
    /** valeur sérialisée : jour ISO pour une date, décimal canonique pour un nombre, texte sinon */
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("custom_field_value_definition_object_uq").on(t.definitionId, t.objectId)],
);
