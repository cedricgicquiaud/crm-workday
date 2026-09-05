/**
 * Helpers d'authentification pour les tests Vitest : connexion par l'API telle que le
 * navigateur la fait, puis cookie de session tel qu'il le renverrait.
 * (Rapatriés de `tests/auth/*.test.ts`, qui gardent leurs copies jusqu'à un nettoyage ultérieur.)
 */
import { getAuth } from "@/lib/auth";

const ORIGIN = "http://localhost:3000";

/** Tentative de connexion telle que le navigateur l'envoie : POST /api/auth/sign-in/email. */
export async function signIn(email: string, password: string) {
  const res = await getAuth().handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    }),
  );
  return { status: res.status, body: await res.json(), setCookie: res.headers.get("set-cookie") };
}

/** Ce que le navigateur renvoie ensuite : le cookie de session tel que posé par la connexion. */
export function cookieHeader(setCookie: string | null): string {
  return (setCookie ?? "").split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim()).join("; ");
}

/** Connexion réussie, puis cookie prêt à être renvoyé ; échoue si la connexion est refusée. */
export async function sessionCookie(email: string, password: string): Promise<string> {
  const login = await signIn(email, password);
  if (login.status !== 200) throw new Error(`Connexion refusée pour ${email} : ${login.status}`);
  return cookieHeader(login.setCookie);
}

/** Requête JSON vers une route d'API de l'application, avec ou sans cookie de session. */
export function jsonRequest(method: string, path: string, body?: unknown, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
