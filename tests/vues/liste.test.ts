import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { GET as getList } from "@/app/api/objets/[type]/route";
import { auditLog, company, savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-vues-liste@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-VuesListe-1", role: "membre" as const };

let member: string;
let memberCookie: string;

const byType = (type: string) => ({ params: Promise.resolve({ type }) });

type ListBody = { records: { name: string }[]; count: number; sort: { field: string; direction: string }; view: string | null };

async function list(query: string): Promise<ListBody> {
  const res = await getList(jsonRequest("GET", `/api/objets/company${query}`, undefined, memberCookie), byType("company"));
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody;
}

async function createCompany(name: string, values: Record<string, string>) {
  const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name, ...values }, memberCookie));
  expect(res.status).toBe(201);
}

async function cleanup() {
  await db.delete(savedView);
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  member = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * L'écran et l'API lisent la vue avec le même module (D24) : une adresse partagée et un appel
 * rendent la même liste, vue comprise. C'est la parité voulue par 2.5a, tenue par 2.5b.
 */
describe("la vue demandée dans l'URL d'une liste (CRM-53, contrat 24)", () => {
  it("rend la liste dans l'état de la vue, laisse l'adresse l'emporter et ignore une vue disparue", async () => {
    await createCompany("Alpha Vue", { type: "client", city: "Paris" });
    await createCompany("Bravo Vue", { type: "prospect", city: "Lyon" });
    await createCompany("Charlie Vue", { type: "client", city: "Lyon" });
    const view = await createView({ objectType: "company", name: "Clients parisiens", query: "f=type:est:client&tri=name:asc" }, { id: member });

    const opened = await list(`?vue=${view.id}`);
    expect(opened.records.map((record) => record.name)).toEqual(["Alpha Vue", "Charlie Vue"]);
    expect(opened.sort).toEqual({ field: "name", direction: "asc" });
    expect(opened.view).toBe(view.id);

    /* Un filtre porté par l'adresse remplace celui de la vue ; le tri de la vue reste. */
    const refined = await list(`?vue=${view.id}&f=city:contient:Lyon`);
    expect(refined.records.map((record) => record.name)).toEqual(["Bravo Vue", "Charlie Vue"]);
    expect(refined.sort).toEqual({ field: "name", direction: "asc" });

    /* Une vue supprimée par un collègue rend la liste par défaut, jamais une erreur (contrat 24). */
    const gone = await list(`?vue=${randomUUID()}`);
    expect(gone.count).toBe(3);
    expect(gone.view).toBe(null);
  });
});
