import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { GET as searchApi } from "@/app/api/recherche/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-recherche@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Recherche-1", role: "membre" as const };

let memberCookie: string;

const search = (q: string, cookie?: string) => searchApi(jsonRequest("GET", `/api/recherche?q=${encodeURIComponent(q)}`, undefined, cookie));

type Result = { type: string; id: string; title: string; subtitle?: string; href: string };

async function results(q: string): Promise<Result[]> {
  const res = await search(q, memberCookie);
  expect(res.status, q).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

async function createCompany(body: Record<string, unknown>): Promise<string> {
  const res = await postCompany(jsonRequest("POST", "/api/entreprises", body, memberCookie));
  expect(res.status, JSON.stringify(body)).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("API de recherche — accès (CRM-38, D24)", () => {
  it("répond 401 sans session", async () => {
    const res = await search("acm");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "non_authentifie" });
  });
});

describe("API de recherche — longueur de la saisie (CRM-38, D24)", () => {
  it("refuse (400) une saisie absente, de deux caractères (espaces retirés) ou de 121 caractères ; trois et 120 caractères passent", async () => {
    for (const q of ["", "ac", "  ac  ", "a".repeat(121)]) {
      const res = await search(q, memberCookie);
      expect(res.status, JSON.stringify(q)).toBe(400);
      expect(await res.json()).toMatchObject({ error: "requete_invalide" });
    }
    const missing = await searchApi(jsonRequest("GET", "/api/recherche", undefined, memberCookie));
    expect(missing.status).toBe(400);
    for (const q of ["acm", "a".repeat(120)]) {
      const res = await search(q, memberCookie);
      expect(res.status, q.length.toString()).toBe(200);
      expect(await res.json()).toMatchObject({ results: [] });
    }
  });
});

describe("API de recherche — entreprise par raison sociale ou SIREN (CRM-38, contrat 3)", () => {
  it("« acm », « me s » et « 732 829 320 » rendent « ACME SAS » avec son type d'objet, son sous-titre et l'adresse de sa fiche ; une autre entreprise n'est pas rendue", async () => {
    const acme = await createCompany({ name: "ACME SAS", type: "client", siren: "732829320" });
    await createCompany({ name: "Banque Solveige", type: "prospect" });
    for (const q of ["acm", "me s", "732 829 320", "732829320"]) {
      const found = await results(q);
      expect(found, q).toEqual([{ type: "company", id: acme, title: "ACME SAS", subtitle: "Client", href: `/entreprises/${acme}` }]);
    }
  });
});

describe("API de recherche — fiches archivées (CRM-38, D21)", () => {
  it("ne rend jamais une entreprise archivée, ni par son nom ni par son SIREN", async () => {
    const archived = await createCompany({ name: "ACME Archivée", type: "client", siren: "356000000" });
    expect((await results("acme")).map((r) => r.id)).toContain(archived);
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, archived));
    expect((await results("acme")).map((r) => r.title)).toEqual(["ACME SAS"]);
    expect(await results("356000000")).toEqual([]);
  });
});

describe("API de recherche — accents dans la saisie (CRM-38, D8)", () => {
  it("« acmé » et « ACMÉ » trouvent « ACME SAS » (saisie normalisée) et « Acmé Éditions » (saisie telle que tapée), chacune une seule fois", async () => {
    await createCompany({ name: "Acmé Éditions", type: "partenaire" });
    for (const q of ["acmé", "ACMÉ"]) {
      const titles = (await results(q)).map((r) => r.title).sort();
      expect(titles, q).toEqual(["ACME SAS", "Acmé Éditions"]);
    }
  });
});
