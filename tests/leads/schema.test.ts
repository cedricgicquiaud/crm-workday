import { afterAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import { closeDb, rawSql } from "@/lib/db";
import { appliedMigrationsCount, schemaSnapshot } from "../helpers/db";

afterAll(closeDb);

/** D20 : migration `0011_leads`, la seule de la livraison 4.1 — les colonnes de la conversion comprises, sans cascade. */
describe("migration 0011 — leads (CRM-90, D20)", () => {
  it("crée la table lead avec ses champs, ses colonnes de base et celles de la conversion", async () => {
    const snapshot = await schemaSnapshot();
    const columns = [
      "lead.id:uuid",
      "lead.title:text",
      "lead.first_name:text",
      "lead.last_name:text",
      "lead.job_title:text",
      "lead.company_name:text",
      "lead.email:text",
      "lead.phone:text",
      "lead.linkedin:text",
      "lead.need:text",
      "lead.origin:text",
      "lead.score:integer",
      "lead.stage:text",
      "lead.converted_at:timestamp with time zone",
      "lead.converted_person_id:uuid",
      "lead.converted_company_id:uuid",
      "lead.owner_id:text",
      "lead.created_by:text",
      "lead.created_at:timestamp with time zone",
      "lead.updated_at:timestamp with time zone",
      "lead.archived_at:timestamp with time zone",
    ];
    for (const column of columns) expect(snapshot, column).toContain(column);
  });

  it("relie la conversion à la personne et à l'entreprise sans cascade", async () => {
    const rows = await rawSql()<{ column_name: string; delete_rule: string }[]>`
      SELECT kcu.column_name, rc.delete_rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'lead' AND kcu.column_name LIKE 'converted_%' ORDER BY kcu.column_name`;
    expect(rows).toEqual([
      { column_name: "converted_company_id", delete_rule: "NO ACTION" },
      { column_name: "converted_person_id", delete_rule: "NO ACTION" },
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
