import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/db";
import { schemaSnapshot } from "../helpers/db";

afterAll(closeDb);

/** D23 : migration `0004_personnes`, domaine `persons.ts` (personne, adresses, profil contact). */
describe("migration 0004 — personnes, adresses, profil contact (CRM-40, D23)", () => {
  it("crée la table person avec ses colonnes de base, la table person_email et la table contact_profile", async () => {
    const snapshot = await schemaSnapshot();
    for (const column of [
      "person.id:uuid",
      "person.first_name:text",
      "person.last_name:text",
      "person.name:text",
      "person.email:text",
      "person.phone:text",
      "person.linkedin:text",
      "person.notes:text",
      "person.profiles:ARRAY",
      "person.company_id:uuid",
      "person.owner_id:text",
      "person.created_by:text",
      "person.created_at:timestamp with time zone",
      "person.updated_at:timestamp with time zone",
      "person.archived_at:timestamp with time zone",
    ]) {
      expect(snapshot, column).toContain(column);
    }
    for (const column of ["person_email.id:uuid", "person_email.person_id:uuid", "person_email.address:text", "person_email.created_at:timestamp with time zone"]) {
      expect(snapshot, column).toContain(column);
    }
    for (const column of ["contact_profile.id:uuid", "contact_profile.person_id:uuid", "contact_profile.job_title:text", "contact_profile.decision_role:text", "contact_profile.created_at:timestamp with time zone", "contact_profile.updated_at:timestamp with time zone"]) {
      expect(snapshot, column).toContain(column);
    }
  });
});
