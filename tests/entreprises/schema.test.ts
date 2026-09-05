import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/db";
import { schemaSnapshot } from "../helpers/db";

afterAll(closeDb);

/** D23 : migration `0003_entreprises`, un fichier de schéma par domaine (`companies.ts`, `audit.ts`). */
describe("migration 0003 — entreprises et historique (CRM-34, D23)", () => {
  it("crée la table company avec ses colonnes de base et la table audit_log", async () => {
    const snapshot = await schemaSnapshot();
    for (const column of ["company.id:uuid", "company.name:text", "company.siren:text", "company.type:text", "company.payment_terms:text", "company.billing_email:text", "company.owner_id:text", "company.created_by:text", "company.created_at:timestamp with time zone", "company.updated_at:timestamp with time zone", "company.archived_at:timestamp with time zone"]) {
      expect(snapshot, column).toContain(column);
    }
    for (const column of ["audit_log.object_type:text", "audit_log.object_id:uuid", "audit_log.action:text", "audit_log.field:text", "audit_log.old_value:text", "audit_log.new_value:text", "audit_log.author_id:text", "audit_log.created_at:timestamp with time zone"]) {
      expect(snapshot, column).toContain(column);
    }
  });
});
