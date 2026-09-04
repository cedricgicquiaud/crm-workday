import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://crm:crm@localhost:5433/crm",
  TEST_DATABASE_URL: "postgres://crm:crm@localhost:5433/crm_test",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("variables d'environnement (contrat 4)", () => {
  it("nomme la variable requise absente et refuse de démarrer", () => {
    const { DATABASE_URL: _omit, ...without } = { ...base, NODE_ENV: "development" };
    void _omit;
    expect(() => parseEnv(without)).toThrowError(/DATABASE_URL/);
  });

  it("démarre en développement sans clé Resend", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "development" })).not.toThrow();
  });

  it("exige la clé Resend en production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrowError(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...base, NODE_ENV: "production", RESEND_API_KEY: "re_x" })).not.toThrow();
  });

  it("utilise la base de test quand NODE_ENV=test", () => {
    expect(parseEnv({ ...base, NODE_ENV: "test" }).DATABASE_URL).toBe(base.TEST_DATABASE_URL);
  });

  it("refuse un secret de session trop court", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "development", BETTER_AUTH_SECRET: "court" })).toThrowError(/BETTER_AUTH_SECRET/);
  });
});
