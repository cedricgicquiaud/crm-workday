/**
 * Garde-fous de session côté serveur.
 * - Page (sans `request`) : `requireSession()` renvoie vers la connexion, `requireAdmin()` vers Accueil.
 * - API (avec `request`) : `HttpError` 401 sans session, 403 si l'utilisateur n'est pas administrateur ;
 *   `withApi()` traduit l'erreur en réponse JSON.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuth, type Session } from "@/lib/auth";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    /** champs supplémentaires rendus dans la réponse JSON */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export async function getSession(request?: Request): Promise<Session | null> {
  return getAuth().api.getSession({ headers: request?.headers ?? (await headers()) });
}

/** Un compte désactivé ne se connecte plus, même si une session ouverte avant la désactivation existe encore (D12). */
function isActive(session: Session): boolean {
  return session.user.status !== "desactive";
}

export async function requireSession(request?: Request): Promise<Session> {
  const session = await getSession(request);
  if (session && isActive(session)) return session;
  if (request) throw new HttpError(401, "non_authentifie");
  redirect("/connexion");
}

export async function requireAdmin(request?: Request): Promise<Session> {
  const session = await requireSession(request);
  if (session.user.role === "administrateur") return session;
  if (request) throw new HttpError(403, "reserve_aux_administrateurs");
  redirect("/accueil");
}

/** Enveloppe d'un gestionnaire d'API : une `HttpError` devient `{ error }` avec son statut. */
export function withApi<A extends unknown[]>(handler: (request: Request, ...args: A) => Promise<Response>) {
  return async (request: Request, ...args: A): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.code, message: error.message, ...error.details }, { status: error.status });
      }
      throw error;
    }
  };
}
