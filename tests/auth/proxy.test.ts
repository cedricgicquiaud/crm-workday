import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy : rien n'est servi sans session hors routes publiques (contrat 19)", () => {
  it("renvoie une page privée sans session vers /connexion en conservant la page demandée", async () => {
    const res = await proxy(request("/parametres/comptes?onglet=actifs"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/connexion");
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/parametres/comptes?onglet=actifs");
  });

  it("sert connexion, invitation, réinitialisation et santé sans session, et une page privée avec un cookie de session", async () => {
    for (const path of ["/connexion", "/invitation/jeton-x", "/reinitialisation", "/reinitialisation/jeton-y", "/api/health", "/api/auth/get-session"]) {
      expect((await proxy(request(path))).headers.get("location"), path).toBeNull();
    }
    const withCookie = await proxy(request("/accueil", "better-auth.session_token=abc.def"));
    expect(withCookie.headers.get("location")).toBeNull();
    expect(withCookie.status).toBe(200);
  });
});
