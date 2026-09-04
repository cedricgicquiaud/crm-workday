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
});
