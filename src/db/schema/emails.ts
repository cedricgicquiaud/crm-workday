/**
 * Domaine « emails ». Le socle pose le journal des envois ; la livraison 1.4 ajoute
 * `cabinet_settings` et `email_template`.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** nom du modèle : invitation, reinitialisation, … */
    template: text("template").notNull(),
    /** capture | envoye | echec */
    status: text("status").notNull(),
    errorReason: text("error_reason"),
    /** identifiant renvoyé par le fournisseur d'envoi */
    providerId: text("provider_id"),
    /** utilisateur à l'origine de l'envoi ; null = système */
    authorId: text("author_id"),
    /** référence d'objet facultative, remplie par les features suivantes (contact, facture…) */
    objectType: text("object_type"),
    objectId: text("object_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_log_to_idx").on(t.to), index("email_log_object_idx").on(t.objectType, t.objectId)],
);
