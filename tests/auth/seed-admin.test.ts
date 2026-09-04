import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-admin";
import { user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-seed@exemple.fr", firstName: "Alice", lastName: "Durand", password: "MotDePasse-Seed-1" };

beforeAll(async () => {
  await db.delete(user);
});
afterAll(closeDb);

describe("premier administrateur par commande (CRM-17)", () => {
  it("crée un administrateur actif qui se connecte ensuite avec son mot de passe", async () => {
    await seedAdmin(ADMIN);
    const result = await getAuth().api.signInEmail({ body: { email: ADMIN.email, password: ADMIN.password } });
    expect(result.user.email).toBe(ADMIN.email);
    const [row] = await db.select().from(user);
    expect(row.role).toBe("administrateur");
    expect(row.status).toBe("actif");
    expect(row.firstName).toBe("Alice");
  });
});
