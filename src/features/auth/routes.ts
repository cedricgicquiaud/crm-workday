/** Paramètres d'URL partagés entre pages serveur et formulaires client (un module « use client » n'exporte pas de valeurs vers le serveur). */
export const PASSWORD_CHANGED_QUERY = "mot-de-passe-modifie";

/**
 * Seule une page interne peut suivre la connexion : jamais une adresse externe.
 * `next` doit être un chemin (`/…`) sans `\` (le navigateur lit `/\evil.com` comme `//evil.com`)
 * et résoudre, contre l'origine du site, vers cette même origine ; sinon Accueil.
 */
export function safeNext(next: string | undefined, origin: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/accueil";
  try {
    return new URL(next, origin).origin === origin ? next : "/accueil";
  } catch {
    return "/accueil";
  }
}
