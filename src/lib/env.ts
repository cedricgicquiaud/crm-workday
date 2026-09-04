/**
 * Variables d'environnement, validées au démarrage selon l'environnement.
 *
 * - développement / test : DATABASE_URL, APP_URL, BETTER_AUTH_SECRET
 * - production          : les mêmes + RESEND_API_KEY
 *
 * En test, DATABASE_URL est remplacée par TEST_DATABASE_URL pour ne jamais toucher
 * aux données de développement. Une variable requise absente arrête le démarrage
 * avec son nom dans le message (contrat 4).
 */
import { z } from "zod";

export type AppEnv = "development" | "test" | "production";

const REQUIRED: Record<AppEnv, readonly string[]> = {
  development: ["DATABASE_URL", "APP_URL", "BETTER_AUTH_SECRET"],
  test: ["TEST_DATABASE_URL", "APP_URL", "BETTER_AUTH_SECRET"],
  production: ["DATABASE_URL", "APP_URL", "BETTER_AUTH_SECRET", "RESEND_API_KEY"],
};

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET doit faire 32 caractères au moins"),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  GIT_COMMIT: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const nodeEnv = (raw.NODE_ENV ?? "development") as AppEnv;
  if (!(nodeEnv in REQUIRED)) {
    throw new EnvError(`NODE_ENV invalide : « ${nodeEnv} » (attendu : development, test ou production)`);
  }
  const missing = REQUIRED[nodeEnv].filter((key) => !raw[key] || raw[key]?.trim() === "");
  if (missing.length > 0) {
    throw new EnvError(
      `Variable d'environnement requise absente (${nodeEnv}) : ${missing.join(", ")}. Voir .env.example.`,
    );
  }
  const candidate = {
    ...raw,
    NODE_ENV: nodeEnv,
    DATABASE_URL: nodeEnv === "test" ? raw.TEST_DATABASE_URL : raw.DATABASE_URL,
  };
  const result = schema.safeParse(candidate);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ");
    throw new EnvError(`Variable d'environnement invalide : ${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lecture paresseuse : l'erreur survient au premier usage, avec le nom de la variable. */
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

export const isProduction = () => getEnv().NODE_ENV === "production";
export const isTest = () => getEnv().NODE_ENV === "test";
