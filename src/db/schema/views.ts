/**
 * Domaine « Vues sauvegardées et épinglées » (D18, livraison 2.5b) : une vue range l'état d'une
 * liste — filtres, tri, colonnes — sous un nom, dans `query`, la chaîne de paramètres d'URL que la
 * liste sait relire. `object_type` est la clé d'objet du registre (`company`, `person`…).
 * Une vue est partagée par toute l'équipe (D11) : son nom est unique par objet, et elle survit à la
 * disparition du compte qui l'a créée (`created_by` remis à nul, jamais la vue effacée).
 * L'épingle, elle, est personnelle : `pinned_view` range dans la barre latérale d'un utilisateur les
 * vues qu'il a choisies, au rang qu'il a choisi (`position`). Supprimer la vue ou le compte vide
 * l'épingle (`cascade`) : une barre latérale ne montre jamais une vue qui n'existe plus.
 */
import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const savedView = pgTable(
  "saved_view",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** clé d'objet du registre (`company`, `person`…) */
    objectType: text("object_type").notNull(),
    /** nom donné par l'équipe (120 caractères au plus) */
    name: text("name").notNull(),
    /** état de la liste en paramètres d'URL (`f=…&tri=…&colonnes=…`) */
    query: text("query").notNull().default(""),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("saved_view_object_name_uq").on(t.objectType, t.name)],
);

export const pinnedView = pgTable(
  "pinned_view",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    viewId: uuid("view_id")
      .notNull()
      .references(() => savedView.id, { onDelete: "cascade" }),
    /** rang dans la barre latérale, choisi par l'utilisateur : l'ordre s'enregistre, il ne se déduit pas */
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pinned_view_user_view_uq").on(t.userId, t.viewId)],
);
