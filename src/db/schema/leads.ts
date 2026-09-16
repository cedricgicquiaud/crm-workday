/**
 * Domaine « Leads » (livraison 4.1, D2, D20). Colonnes de base communes à tout objet : `owner_id`,
 * `created_by`, `created_at`, `updated_at`, `archived_at`.
 * - `title` est générée par Postgres (« Julie Martin · Banque X », D3) : titre de la fiche, première
 *   colonne de la liste, libellé de la palette ; elle suit chaque écriture de ses sources et ne se saisit pas.
 * - `origin` et `stage` sont des listes fermées tenues par les descripteurs (`src/features/leads/schema.ts`).
 * - `converted_*` sont posées par la conversion (4.1b) ; les clés étrangères sont sans cascade : un
 *   lead converti retient la personne et l'entreprise qu'il a créées ou retrouvées.
 */
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { company } from "./companies";
import { person } from "./persons";

export const lead = pgTable(
  "lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** « Prénom Nom · Nom de l'entreprise », calculé par la base à chaque écriture */
    title: text("title")
      .notNull()
      /* `concat_ws` n'est pas immuable pour Postgres : l'expression s'écrit avec `||`, qui l'est. */
      .generatedAlwaysAs(
        sql`CASE WHEN btrim(coalesce("first_name", '') || ' ' || coalesce("last_name", '')) = '' THEN coalesce("company_name", '') ELSE btrim(coalesce("first_name", '') || ' ' || coalesce("last_name", '')) || CASE WHEN coalesce("company_name", '') = '' THEN '' ELSE ' · ' || "company_name" END END`,
      ),
    /** 120 caractères max */
    firstName: text("first_name"),
    /** 120 caractères max */
    lastName: text("last_name"),
    /** 120 caractères max */
    jobTitle: text("job_title"),
    /** nom de l'entreprise en texte libre, 120 caractères max (la relation « Entreprise » vient de la conversion) */
    companyName: text("company_name"),
    /** normalisée en minuscules sans espaces, 200 caractères max, pas unique */
    email: text("email"),
    phone: text("phone"),
    linkedin: text("linkedin"),
    /** 2 000 caractères max */
    need: text("need"),
    /** linkedin | recommandation | appel_d_offres | partenaire | autre */
    origin: text("origin").notNull(),
    /** entier de 1 à 3 */
    score: integer("score"),
    /** nouveau | contacte | qualifie | converti | ecarte */
    stage: text("stage").notNull().default("nouveau"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedPersonId: uuid("converted_person_id").references(() => person.id),
    convertedCompanyId: uuid("converted_company_id").references(() => company.id),
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
  (t) => [
    index("lead_updated_at_idx").on(t.updatedAt),
    index("lead_created_at_idx").on(t.createdAt),
    index("lead_owner_id_idx").on(t.ownerId),
    index("lead_email_idx").on(t.email),
    index("lead_converted_person_id_idx").on(t.convertedPersonId),
    index("lead_converted_company_id_idx").on(t.convertedCompanyId),
  ],
);
