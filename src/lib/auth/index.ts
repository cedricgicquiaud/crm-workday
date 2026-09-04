/**
 * Instance Better Auth du serveur, créée à la demande : l'environnement n'est lu qu'à la
 * première requête, jamais au build. Le socle pose l'essentiel ; la livraison 1.2a ajoute
 * la session glissante, la limitation des tentatives, les comptes désactivés et les emails
 * de réinitialisation.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { and, count, eq, gt } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** Cinq échecs en 15 minutes sur une adresse, connue ou non, la verrouillent 15 minutes (D14). */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
/** Même réponse que Better Auth pour un mot de passe faux : on ne révèle ni l'adresse ni le verrou. */
const INVALID_CREDENTIALS = { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" };

const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();

async function recentFailures(email: string): Promise<number> {
  const since = new Date(Date.now() - LOCK_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(schema.loginAttempt)
    .where(and(eq(schema.loginAttempt.email, email), gt(schema.loginAttempt.createdAt, since)));
  return row?.n ?? 0;
}

const refuseWhenLocked = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;
  const email = normalizeEmail(ctx.body?.email);
  if ((await recentFailures(email)) >= MAX_FAILED_ATTEMPTS) {
    throw APIError.from("UNAUTHORIZED", INVALID_CREDENTIALS);
  }
});

const recordFailure = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email" || !isAPIError(ctx.context.returned)) return;
  await db.insert(schema.loginAttempt).values({ email: normalizeEmail(ctx.body?.email) });
});

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      /** Pas d'inscription libre : les comptes naissent par invitation (1.2a). */
      disableSignUp: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    hooks: { before: refuseWhenLocked, after: recordFailure },
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, defaultValue: "" },
        lastName: { type: "string", required: false, defaultValue: "" },
        role: { type: "string", required: false, defaultValue: "membre", input: false },
        status: { type: "string", required: false, defaultValue: "invite", input: false },
        theme: { type: "string", required: false, defaultValue: "systeme" },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

const globalForAuth = globalThis as unknown as { __crmAuth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.__crmAuth) globalForAuth.__crmAuth = createAuth();
  return globalForAuth.__crmAuth;
}
