import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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

  it("refuse de s'exécuter si un administrateur existe déjà (contrat 20)", async () => {
    await expect(seedAdmin({ ...ADMIN, email: "second-admin@exemple.fr" })).rejects.toThrowError(/administrateur existe déjà/);
    const rows = await db.select().from(user);
    expect(rows).toHaveLength(1);
  });

  it("refuse un mot de passe de moins de 12 caractères, comme partout ailleurs (contrat 13)", async () => {
    await db.delete(user);
    await expect(seedAdmin({ ...ADMIN, password: "MDPTEST1234" })).rejects.toThrowError(/12 caractères/);
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it("en ligne de commande, lit email, prénom, nom et mot de passe dans ses arguments", async () => {
    await db.delete(user);
    const out = execFileSync(
      "npx",
      ["tsx", "scripts/seed-admin.ts", "--email", "cli@exemple.fr", "--prenom", "Chloé", "--nom", "Bernard", "--mot-de-passe", "MotDePasse-Cli-1"],
      { env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8" },
    );
    expect(out).toContain("Administrateur créé");
    const [row] = await db.select().from(user).where(eq(user.email, "cli@exemple.fr"));
    expect(row.firstName).toBe("Chloé");
    expect(row.lastName).toBe("Bernard");
    expect(row.role).toBe("administrateur");
  });
});
