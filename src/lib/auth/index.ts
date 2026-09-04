/**
 * Instance Better Auth du serveur, créée à la demande : l'environnement n'est lu qu'à la
 * première requête, jamais au build. Le socle pose l'essentiel ; la livraison 1.2a ajoute
 * la session glissante, la limitation des tentatives, les comptes désactivés et les emails
 * de réinitialisation.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

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
