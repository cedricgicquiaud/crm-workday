import { afterAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import { closeDb } from "@/lib/db";
import { appliedMigrationsCount, schemaSnapshot } from "../helpers/db";

afterAll(closeDb);

describe("migrations (contrat 3)", () => {
  it("appliquées une seconde fois, ne changent rien", async () => {
    const before = await schemaSnapshot();
    const countBefore = await appliedMigrationsCount();
    expect(before).toContain("user.email");
    expect(before).toContain("email_log.object_type");
    await runMigrations();
    expect(await schemaSnapshot()).toBe(before);
    expect(await appliedMigrationsCount()).toBe(countBefore);
  });
});
