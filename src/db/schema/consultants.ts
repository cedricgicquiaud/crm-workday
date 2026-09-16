/**
 * Domaine « Profil consultant » (livraison 3.1, D1, D3, D18). Un profil au plus par personne, qui
 * cohabite avec son profil contact ; il ne se retire pas, il part avec la personne (cascade).
 * - `consultant_profile` porte ce que le cabinet sait d'un consultant : son statut, son coût
 *   journalier, sa disponibilité, son expérience, ses langues et son CV.
 * - `consultant_module` porte les modules Workday qu'il maîtrise, un par ligne, chacun certifié ou
 *   non ; un module ne se retient qu'une fois par profil.
 * - La société de facturation est `person.billing_company_id`, portée par la personne comme
 *   `company_id` l'est pour le profil contact : la colonne des liens, la fusion et la suppression
 *   la lisent par la relation déclarée.
 */
import { boolean, date, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { person } from "./persons";

export const consultantProfile = pgTable("consultant_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .unique()
    .references(() => person.id, { onDelete: "cascade" }),
  /** salarie | freelance | portage */
  status: text("status").notNull(),
  /** euros par jour, 0 à 10 000, deux décimales au plus */
  dailyCost: numeric("daily_cost", { precision: 10, scale: 2 }),
  /** jour à partir duquel le consultant peut commencer une mission */
  availableFrom: date("available_from"),
  unavailable: boolean("unavailable").notNull().default(false),
  /** 120 caractères max ; vidé quand « Indisponible » est décoché (D6) */
  unavailableReason: text("unavailable_reason"),
  /** 0 à 40 */
  yearsExperience: integer("years_experience"),
  /** 120 caractères max, texte libre */
  languages: text("languages"),
  /** lien https de 200 caractères max ; aucun fichier n'est déposé (D7) */
  cvUrl: text("cv_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Modules Workday d'un profil (D3) : liste fermée dans le code, chacun certifié ou non. */
export const consultantModule = pgTable(
  "consultant_module",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => consultantProfile.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    certified: boolean("certified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("consultant_module_unique").on(t.profileId, t.module), index("consultant_module_profile_id_idx").on(t.profileId)],
);
