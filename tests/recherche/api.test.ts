import { describe, expect, it } from "vitest";
import { GET as searchApi } from "@/app/api/recherche/route";
import { jsonRequest } from "../helpers/auth";

describe("API de recherche — accès (CRM-38, D24)", () => {
  it("répond 401 sans session", async () => {
    const res = await searchApi(jsonRequest("GET", "/api/recherche?q=acm"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "non_authentifie" });
  });
});
