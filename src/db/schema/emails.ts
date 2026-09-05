/**
 * Domaine « emails ». Le socle pose le journal des envois ; la livraison 1.4 ajoute
 * `cabinet_settings` et `email_template`.
 */
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

/**
 * Paramètres du cabinet (D20, D21) : une seule ligne, clé fixe `cabinet`. L'expéditeur des
 * emails en est tiré ; rien ne part sans lui.
 */
export const cabinetSettings = pgTable("cabinet_settings", {
  id: text("id").primaryKey(),
  /** nom du cabinet, injecté dans `{{cabinet}}` */
  name: text("name").notNull(),
  /** nom d'affichage de l'expéditeur */
  senderName: text("sender_name").notNull(),
  /** adresse d'expédition (domaine vérifié chez Resend) */
  senderEmail: text("sender_email").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Modèle d'email modifiable dans l'interface (D22) ; les modèles système ne se suppriment pas. */
export const emailTemplate = pgTable("email_template", {
  /** invitation, reinitialisation, … */
  key: text("key").primaryKey(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  /** variables sans lesquelles le modèle ne s'enregistre pas (`lien` pour les deux modèles système) */
  requiredVariables: text("required_variables").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
