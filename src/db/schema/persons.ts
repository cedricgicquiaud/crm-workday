/**
 * Domaine « Personnes et profil contact » (livraison 2.2, D2, D3, D4). Colonnes de base communes à
 * tout objet : `owner_id`, `created_by`, `created_at`, `updated_at`, `archived_at`.
 * - `name` est générée par Postgres (« Prénom Nom ») : titre de la fiche, première colonne de la
 *   liste, libellé dans les colonnes des liens et la palette ; elle ne se saisit pas.
 * - `profiles` est dérivée des profils attachés (« aucun » ou « contact ») et tenue à jour par le
 *   service du profil contact ; elle ne se saisit pas (PATCH → 400).
 * - `company_id` est l'entreprise de rattachement du profil contact, portée par la personne pour
 *   que la colonne des liens la lise par la relation déclarée (`fkColumn`) ; écrite seulement par
 *   le service du profil contact.
 * Les adresses : `email` (principale) et `person_email` (autres) ; chaque adresse, normalisée en
 * minuscules et sans espaces, est unique dans tout le CRM, archivées comprises (D19).
 */
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { company } from "./companies";

export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 120 caractères max */
    firstName: text("first_name").notNull(),
    /** 120 caractères max */
    lastName: text("last_name").notNull(),
    /** « Prénom Nom », calculée par la base */
    name: text("name")
      .notNull()
      .generatedAlwaysAs(sql`"first_name" || ' ' || "last_name"`),
    /** adresse principale, normalisée, unique dans tout le CRM avec les autres adresses */
    email: text("email"),
    phone: text("phone"),
    /** URL du profil */
    linkedin: text("linkedin"),
    /** 2 000 caractères max */
    notes: text("notes"),
    /** aucun | contact (dérivé, tenu à jour par le profil contact) */
    profiles: text("profiles").notNull().default("aucun"),
    /** entreprise de rattachement du profil contact */
    companyId: uuid("company_id").references(() => company.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("person_email_unique_idx").on(t.email), index("person_updated_at_idx").on(t.updatedAt), index("person_owner_id_idx").on(t.ownerId), index("person_company_id_idx").on(t.companyId)],
);

/** Autres adresses d'une personne (D2) : une ligne par adresse, normalisée, unique dans tout le CRM. */
export const personEmail = pgTable(
  "person_email",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    address: text("address").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("person_email_person_id_idx").on(t.personId)],
);

/** Profil contact (D3) : au plus un par personne ; l'entreprise est `person.company_id`. */
export const contactProfile = pgTable("contact_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .unique()
    .references(() => person.id, { onDelete: "cascade" }),
  /** 120 caractères max */
  jobTitle: text("job_title"),
  /** decideur | acheteur | utilisateur | facturation | non_precise */
  decisionRole: text("decision_role").notNull().default("non_precise"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
