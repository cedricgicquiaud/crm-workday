/**
 * Domaine « Activités, tâches, bannière » (D10, D13, livraison 2.3) : une ligne par note, appel,
 * réunion ou tâche, sur n'importe quelle fiche (`object_type` du registre, `object_id`).
 * - `parent_type` / `parent_id` mémorisent, à la création, la fiche parente du moment (l'entreprise
 *   d'un contact, via `feedParent`) : le fil du parent reprend l'activité, et un changement
 *   d'entreprise ne déplace jamais les activités déjà écrites (D3, contrat 7).
 * - Une tâche porte `title`, `due_date` (un jour), `assignee_id` (responsable) et `done_at`
 *   (nulle = à faire) ; une réunion porte `occurred_on`.
 */
import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** clé d'objet du registre (`company`, `person`…) */
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    /** fiche parente du moment (`feedParent`), figée à la création */
    parentType: text("parent_type"),
    parentId: uuid("parent_id"),
    /** note | appel | reunion | tache */
    type: text("type").notNull(),
    /** texte d'une note, compte rendu d'un appel ou d'une réunion (2 000 caractères max) */
    body: text("body"),
    /** titre d'une tâche (120 caractères max) */
    title: text("title"),
    /** jour d'une réunion */
    occurredOn: date("occurred_on"),
    /** échéance d'une tâche, au jour (échue le lendemain 00:00 Europe/Paris, D13) */
    dueDate: date("due_date"),
    /** responsable d'une tâche */
    assigneeId: text("assignee_id").references(() => user.id),
    /** date à laquelle la tâche a été cochée ; nulle tant qu'elle est à faire */
    doneAt: timestamp("done_at", { withTimezone: true }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_object_idx").on(t.objectType, t.objectId, t.createdAt), index("activity_parent_idx").on(t.parentType, t.parentId, t.createdAt)],
);
