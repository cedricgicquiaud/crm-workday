/**
 * Domaine « entreprises » (livraison 2.1a, D1, D4). Colonnes de base communes à tout objet :
 * `owner_id` (responsable), `created_by`, `created_at`, `updated_at`, `archived_at`.
 * Les valeurs de `type` et `payment_terms` sont des listes fermées tenues par les descripteurs
 * de champs (`src/features/companies/schema.ts`), extensibles par migration.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** raison sociale, 120 caractères max */
    name: text("name").notNull(),
    /** neuf chiffres, espaces retirés à la saisie, unique s'il est renseigné */
    siren: text("siren").unique(),
    street: text("street"),
    postalCode: text("postal_code"),
    city: text("city"),
    country: text("country").notNull().default("France"),
    sector: text("sector"),
    /** prospect | client | partenaire | societe_de_portage */
    type: text("type").notNull(),
    /** a_reception | 30_jours | 30_jours_fin_de_mois | 45_jours_fin_de_mois | 60_jours */
    paymentTerms: text("payment_terms").notNull().default("30_jours"),
    website: text("website"),
    /** adresse générique de facturation (`compta@…`), pour la feature 7 */
    billingEmail: text("billing_email"),
    /** 2 000 caractères max */
    notes: text("notes"),
    /** responsable : un utilisateur, le créateur par défaut */
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** posée par l'archivage (2.6b) : la fiche passe en lecture seule */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("company_updated_at_idx").on(t.updatedAt), index("company_owner_id_idx").on(t.ownerId)],
);
