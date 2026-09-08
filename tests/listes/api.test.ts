import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { GET as getList } from "@/app/api/objets/[type]/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-listes@exemple.fr", firstName: "Alix", lastName: "Perrin", password: "MotDePasse-Listes-1", role: "membre" as const };

let memberCookie: string;

const byType = (type: string) => ({ params: Promise.resolve({ type }) });

type ListBody = { records: { id: string; name: string }[]; count: number; columns: string[]; sort: { field: string; direction: string }; inactive: { message: string }[] };

/** La liste d'un objet, telle que la route générique la rend pour une URL donnée. */
async function list(query: string): Promise<ListBody> {
  const res = await getList(jsonRequest("GET", `/api/objets/company${query}`, undefined, memberCookie), byType("company"));
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody;
}

async function createCompany(name: string, values: Record<string, string>): Promise<string> {
  const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name, ...values }, memberCookie));
  expect(res.status).toBe(201);
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

/**
 * Route générique de liste (D4, D24) : elle ne connaît que la clé d'objet et lit l'état dans son
 * URL, comme l'écran. Elle est la même source de vérité pour un partage d'adresse et pour un appel.
 */
describe("API générique d'une liste (CRM-47, CRM-48, D18, D24)", () => {
  it("rend les fiches filtrées et triées selon l'URL, archivées exclues sauf demande", async () => {
    const alpha = await createCompany("Alpha Liste", { type: "client", city: "Paris" });
    await createCompany("Bravo Liste", { type: "prospect", city: "Lyon" });
    const rangee = await createCompany("Charlie Liste", { type: "client", city: "Paris" });
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, rangee));

    const all = await list("");
    expect(all.records.map((record) => record.name)).toEqual(["Bravo Liste", "Alpha Liste"]);
    expect(all.count).toBe(2);
    expect(all.columns).toEqual(["type", "city", "ownerId"]);
    expect(all.sort).toEqual({ field: "updatedAt", direction: "desc" });

    const sorted = await list("?tri=name:asc");
    expect(sorted.records.map((record) => record.name)).toEqual(["Alpha Liste", "Bravo Liste"]);

    const filtered = await list("?f=type:est:client&f=city:contient:par");
    expect(filtered.records.map((record) => record.id)).toEqual([alpha]);
    expect(filtered.count).toBe(1);

    const archived = await list("?archivees=1&tri=name:asc");
    expect(archived.records.map((record) => record.name)).toEqual(["Alpha Liste", "Bravo Liste", "Charlie Liste"]);
  });
});
