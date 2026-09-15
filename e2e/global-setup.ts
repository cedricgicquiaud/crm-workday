import { execFileSync } from "node:child_process";
import { MEMBER, seedAccounts } from "./fixtures/auth";

/**
 * Avant les tests d'écran : migre la base de développement, puis **chauffe le serveur de dev**.
 * Playwright démarre le serveur avant cette fonction ; en mode dev, la première ouverture d'une
 * route la compile (10 à 20 s sur une machine de CI), ce que le premier test de chaque part de CI
 * payait en délai expiré (CRM-89). On ouvre ici, avec une session, chaque famille de pages et
 * d'API une fois ; un échec de chauffe n'arrête rien, il est seulement affiché.
 *
 * Passe par `tsx` en sous-processus pour la migration : le chargeur TypeScript de Playwright ne
 * résout pas l'alias `@/` utilisé par le code applicatif (constaté en CI).
 */
const NIL_ID = "00000000-0000-4000-8000-000000000000";
const ROUTES = ["/connexion", "/accueil", "/entreprises", `/entreprises/${NIL_ID}`, "/personnes", `/personnes/${NIL_ID}`, "/profil", "/parametres", "/parametres/champs", "/parametres/comptes", "/parametres/journal", "/parametres/modeles", "/api/entreprises", "/api/personnes", "/api/recherche?q=abc", "/api/vues?objet=company"];

async function warmUp(appUrl: string): Promise<void> {
  seedAccounts();
  const signIn = await fetch(`${appUrl}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: appUrl }, body: JSON.stringify({ email: MEMBER.email, password: MEMBER.password }) });
  const cookie = (signIn.headers.getSetCookie?.() ?? []).map((line) => line.split(";")[0]).join("; ");
  if (!signIn.ok || !cookie) {
    console.warn(`chauffe : connexion refusée (${signIn.status}), pages non chauffées`);
    return;
  }
  const started = Date.now();
  for (const route of ROUTES) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${appUrl}${route}`, { headers: { cookie, origin: appUrl }, redirect: "manual" });
      console.log(`chauffe ${route} → ${res.status} en ${Date.now() - t0} ms`);
    } catch (error) {
      console.warn(`chauffe ${route} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`chauffe terminée en ${Date.now() - started} ms`);
}

export default async function globalSetup() {
  execFileSync("npx", ["tsx", "src/db/migrate.ts"], { stdio: "inherit" });
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  try {
    await warmUp(appUrl);
  } catch (error) {
    console.warn(`chauffe : ${error instanceof Error ? error.message : String(error)}`);
  }
}
