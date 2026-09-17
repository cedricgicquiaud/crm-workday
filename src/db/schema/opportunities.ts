/**
 * Domaine « Opportunités » (feature 4.2, D53). Colonnes de base communes à tout objet : `owner_id`,
 * `created_by`, `created_at`, `updated_at`, `archived_at`.
 * - `stage`, `loss_reason` et `result` sont des listes fermées tenues par les descripteurs
 *   (`src/features/opportunities/schema.ts`).
 * - La probabilité et le montant estimé se calculent à la lecture, ils ne sont pas stockés (D33, D31).
 * - Les clés vers l'entreprise, le contact et le lead d'origine sont sans cascade : une opportunité
 *   retient les fiches qu'elle désigne. Ses modules et ses propositions partent avec elle (cascade).
 */
import { date, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { company } from "./companies";
import { lead } from "./leads";
import { person } from "./persons";

export const opportunity = pgTable(
  "opportunity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 120 caractères max, non vide */
    title: text("title").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    /** une personne portant un profil contact de l'entreprise (D35) */
    contactPersonId: uuid("contact_person_id").references(() => person.id),
    /** 2 000 caractères max */
    need: text("need"),
    /** euros par jour, plus de 0 et 5 000 au plus, deux décimales au plus */
    targetDailyRate: numeric("target_daily_rate", { precision: 7, scale: 2 }),
    /** entier de 1 à 1 000 */
    estimatedDays: integer("estimated_days"),
    desiredStart: date("desired_start"),
    expectedClose: date("expected_close").notNull(),
    /** nouveau_besoin | qualifie | profils_proposes | entretien_client | proposition_envoyee | negociation | gagnee | perdue */
    stage: text("stage").notNull().default("nouveau_besoin"),
    /** « Gagnée ou perdue le », posée par le geste qui clôt (4.2d) */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lossReason: text("loss_reason"),
    lossComment: text("loss_comment"),
    /** le lead dont l'opportunité est issue (4.2c) */
    leadId: uuid("lead_id").references(() => lead.id),
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
    index("opportunity_updated_at_idx").on(t.updatedAt),
    index("opportunity_owner_id_idx").on(t.ownerId),
    index("opportunity_company_id_idx").on(t.companyId),
    index("opportunity_contact_person_id_idx").on(t.contactPersonId),
    index("opportunity_lead_id_idx").on(t.leadId),
  ],
);

/** Modules Workday d'une opportunité (D31), sur le modèle de `consultant_module` : un par ligne, une seule fois chacun. */
export const opportunityModule = pgTable(
  "opportunity_module",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunity.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("opportunity_module_unique").on(t.opportunityId, t.module), index("opportunity_module_opportunity_id_idx").on(t.opportunityId)],
);

/** Consultants proposés sur une opportunité (4.2b) : un par consultant, avec son résultat et son TJM de vente proposé. */
export const opportunityConsultant = pgTable(
  "opportunity_consultant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunity.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id),
    /** propose | entretien | retenu | refuse */
    result: text("result").notNull().default("propose"),
    /** euros par jour, mêmes bornes que le TJM de vente cible */
    proposedDailyRate: numeric("proposed_daily_rate", { precision: 7, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("opportunity_consultant_unique").on(t.opportunityId, t.personId),
    index("opportunity_consultant_opportunity_id_idx").on(t.opportunityId),
    index("opportunity_consultant_person_id_idx").on(t.personId),
  ],
);
