import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchCompany, GET as getCompany } from "@/app/api/entreprises/[id]/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { GET as getList } from "@/app/api/objets/[type]/route";
import { auditLog, company, customFieldDefinition, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey, setCustomFields } from "@/features/custom-fields/fields-source";
import { columnsOf } from "@/features/lists/columns";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-liste-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-ListeChamps-1", role: "administrateur" as const };
const TYPE = "company";

let cookie: string;
let actor: { id: string };
let segment: string;

const byType = (type: string) => ({ params: Promise.resolve({ type }) });

type ListBody = { records: Record<string, string>[]; count: number; inactive: { message: string }[] };

/** La liste telle que la route la rend sur un serveur qui vient de démarrer : rien en mémoire, tout à lire. */
async function list(query: string): Promise<ListBody> {
  setCustomFields([]);
  const res = await getList(jsonRequest("GET", `/api/objets/${TYPE}${query}`, undefined, cookie), byType(TYPE));
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody;
}

async function createCompany(name: string, values: Record<string, unknown>): Promise<string> {
  const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name, type: "client", ...values }, cookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(customFieldDefinition);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
  cookie = await sessionCookie(ADMIN.email, ADMIN.password);
  segment = customFieldKey((await createDefinition({ objectType: TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME", "Startup"] }, actor)).id);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Contrat 18 : un champ défini par un administrateur devient une colonne, un filtre et un critère de
 * tri de la liste sans une ligne de code de plus, parce qu'il est un descripteur de champ comme les autres.
 */
describe("colonne, filtre et tri d'un champ personnalisé (CRM-56, contrat 18)", () => {
  it("propose le champ comme colonne, l'affiche, le filtre et le trie depuis l'URL de la liste", async () => {
    const grand = await createCompany("Alpha Champs", { [segment]: "Grand compte" });
    const pme = await createCompany("Bravo Champs", { [segment]: "PME" });
    await createCompany("Charlie Champs", {});

    await loadCustomFields();
    expect(columnsOf(TYPE).map((column) => column.label)).toContain("Segment");

    const shown = await list(`?colonnes=${segment}`);
    expect(shown.records.map((record) => record[segment])).toEqual(expect.arrayContaining(["Grand compte", "PME", null]));

    const filtered = await list(`?f=${segment}:est:PME`);
    expect(filtered.records.map((record) => record.id)).toEqual([pme]);
    expect(filtered.count).toBe(1);
    expect(filtered.inactive).toEqual([]);

    const sorted = await list(`?tri=${segment}:asc`);
    expect(sorted.records.map((record) => record.id).slice(0, 2)).toEqual([grand, pme]);
  });

  it("lit et écrit la valeur personnalisée par l'API de l'objet, sans route propre au champ", async () => {
    const id = await createCompany("Delta Champs", {});
    const patched = await patchCompany(jsonRequest("PATCH", `/api/entreprises/${id}`, { [segment]: "Startup" }, cookie), { params: Promise.resolve({ id }) });
    expect(patched.status).toBe(200);
    expect((await patched.json())[segment]).toBe("Startup");

    const read = await getCompany(jsonRequest("GET", `/api/entreprises/${id}`, undefined, cookie), { params: Promise.resolve({ id }) });
    expect((await read.json())[segment]).toBe("Startup");
  });
});
