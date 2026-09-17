import { afterAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import { LOSS_REASONS, PROPOSAL_RESULTS, resultRank, STAGES, stageProbability, stageRank } from "@/features/opportunities/schema";
import { closeDb, rawSql } from "@/lib/db";
import { appliedMigrationsCount, schemaSnapshot } from "../helpers/db";

afterAll(closeDb);

const labels = (values: readonly { label: string }[]) => values.map((entry) => entry.label);

/** Les listes fermées de toute la feature 4.2 : posées ici une fois, lues par les livraisons suivantes sans y toucher. */
describe("listes fermées des opportunités (CRM-103, D32, D33)", () => {
  it("range les huit étapes dans l'ordre du pipeline, gagnée et perdue réservées à leur geste", () => {
    expect(labels(STAGES)).toEqual(["Nouveau besoin", "Qualifié", "Profils proposés", "Entretien client", "Proposition envoyée", "Négociation", "Gagnée", "Perdue"]);
    expect(STAGES.filter((stage) => stage.reserved).map((stage) => stage.label)).toEqual(["Gagnée", "Perdue"]);
    expect(STAGES.map((stage) => stageRank(stage.value))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("déduit de chaque étape sa probabilité : 10, 20, 30, 50, 70, 80, 100 et 0 %", () => {
    expect(STAGES.map((stage) => stageProbability(stage.value))).toEqual([10, 20, 30, 50, 70, 80, 100, 0]);
  });

  it("propose six motifs de perte", () => {
    expect(labels(LOSS_REASONS)).toEqual(["Prix", "Profil non retenu", "Concurrent", "Projet abandonné ou reporté", "Pas de réponse", "Autre"]);
  });

  it("classe les résultats d'une proposition : Retenu avant Entretien, avant Proposé, avant Refusé", () => {
    expect(labels(PROPOSAL_RESULTS)).toEqual(["Proposé", "Entretien", "Retenu", "Refusé"]);
    const byRank = [...PROPOSAL_RESULTS].sort((a, b) => resultRank(b.value) - resultRank(a.value));
    expect(labels(byRank)).toEqual(["Retenu", "Entretien", "Proposé", "Refusé"]);
  });
});

/** D53 : migration `0012_opportunites`, la seule de la feature 4.2 — l'opportunité, ses modules et ses propositions. */
describe("migration 0012 — opportunités (CRM-103, D53)", () => {
  it("crée l'opportunité avec ses champs et ses colonnes de base, ses modules et ses propositions", async () => {
    const snapshot = await schemaSnapshot();
    const columns = [
      "opportunity.id:uuid",
      "opportunity.title:text",
      "opportunity.company_id:uuid",
      "opportunity.contact_person_id:uuid",
      "opportunity.need:text",
      "opportunity.target_daily_rate:numeric",
      "opportunity.estimated_days:integer",
      "opportunity.desired_start:date",
      "opportunity.expected_close:date",
      "opportunity.stage:text",
      "opportunity.closed_at:timestamp with time zone",
      "opportunity.loss_reason:text",
      "opportunity.loss_comment:text",
      "opportunity.lead_id:uuid",
      "opportunity.owner_id:text",
      "opportunity.created_by:text",
      "opportunity.created_at:timestamp with time zone",
      "opportunity.updated_at:timestamp with time zone",
      "opportunity.archived_at:timestamp with time zone",
      "opportunity_module.opportunity_id:uuid",
      "opportunity_module.module:text",
      "opportunity_consultant.opportunity_id:uuid",
      "opportunity_consultant.person_id:uuid",
      "opportunity_consultant.result:text",
      "opportunity_consultant.proposed_daily_rate:numeric",
    ];
    for (const column of columns) expect(snapshot, column).toContain(column);
  });

  it("supprime modules et propositions avec l'opportunité, et ne supprime rien des fiches qu'elle désigne", async () => {
    const rows = await rawSql()<{ table_name: string; column_name: string; delete_rule: string }[]>`
      SELECT kcu.table_name, kcu.column_name, rc.delete_rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name IN ('opportunity', 'opportunity_module', 'opportunity_consultant')
        AND kcu.column_name NOT IN ('owner_id', 'created_by')
      ORDER BY kcu.table_name, kcu.column_name`;
    expect(rows).toEqual([
      { table_name: "opportunity", column_name: "company_id", delete_rule: "NO ACTION" },
      { table_name: "opportunity", column_name: "contact_person_id", delete_rule: "NO ACTION" },
      { table_name: "opportunity", column_name: "lead_id", delete_rule: "NO ACTION" },
      { table_name: "opportunity_consultant", column_name: "opportunity_id", delete_rule: "CASCADE" },
      { table_name: "opportunity_consultant", column_name: "person_id", delete_rule: "NO ACTION" },
      { table_name: "opportunity_module", column_name: "opportunity_id", delete_rule: "CASCADE" },
    ]);
  });

  it("n'accepte qu'une proposition par consultant et un module une seule fois par opportunité", async () => {
    const rows = await rawSql()<{ table_name: string; columns: string }[]>`
      SELECT tc.table_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'UNIQUE' AND tc.table_name IN ('opportunity_module', 'opportunity_consultant')
      GROUP BY tc.table_name, tc.constraint_name ORDER BY tc.table_name`;
    expect(rows).toEqual([
      { table_name: "opportunity_consultant", columns: "opportunity_id,person_id" },
      { table_name: "opportunity_module", columns: "opportunity_id,module" },
    ]);
  });

  it("appliquée une seconde fois, ne change rien", async () => {
    const before = await schemaSnapshot();
    const count = await appliedMigrationsCount();
    await runMigrations();
    expect(await schemaSnapshot()).toBe(before);
    expect(await appliedMigrationsCount()).toBe(count);
  });
});
