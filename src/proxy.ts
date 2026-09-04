/**
 * Proxy Next.js 16 (l'ancien middleware) : hors routes publiques, rien n'est servi sans
 * cookie de session ; la page demandée est conservée dans `?next=` (contrat 19).
 * Vérification optimiste sur le cookie seul : la validité réelle de la session est
 * contrôlée dans les pages et les API par `requireSession()` (`src/lib/auth/session.ts`).
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/connexion", "/invitation/", "/reinitialisation", "/api/health", "/api/auth/"];

export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "non_authentifie" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  /** Tout sauf les fichiers statiques de Next.js et les icônes. */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$).*)"],
};
