import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { auditLog, company, customFieldDefinition, customFieldValue, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { listForState } from "@/features/lists/apply-filters";
import { columnsOf } from "@/features/lists/columns";
import { listObjects } from "@/features/objects/registry";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { listStateWithView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-champs-opportunite@exemple.fr", firstName: "Hana", lastName: "Robin", password: "MotDePasse-Champs-Opp-1", role: "administrateur" as const };

let adminId: string;
let adminCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function create(title: string): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title, companyId: bankId, modules: ["hcm"], expectedClose: "2026-10-30" }, adminCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const titlesFor = async (query: string) => {
  const state = await listStateWithView("opportunity", new URLSearchParams(query));
  return listForState("opportunity", await listObjectRecords("opportunity", { includeArchived: state.includeArchived }), state).map((record) => record.title);
};

/** Les enfants avant les parents : les valeurs personnalisées et les modules avant l'opportunité, elle-même avant son entreprise. */
async function cleanup() {
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await db.delete(auditLog);
  await db.delete(opportunity);
  await loadCustomFields();
}

beforeAll(async () => {
  await cleanup();
  await db.delete(company);
  await db.delete(user).where(eq(user.email, ADMIN.email));
  adminId = (await createUserWithPassword(ADMIN)).id;
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: adminId })).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.delete(company);
  await closeDb();
});

/** D37, contrat 38 : un administrateur pose un champ sur les opportunités, il vit comme un champ déclaré. */
describe("champ personnalisé d'une opportunité (CRM-106, D37, contrat 38)", () => {
  it("propose « Opportunités » parmi les objets de Paramètres → Champs", () => {
    expect(listObjects().map((object) => object.labels.plural)).toContain("Opportunités");
  });

  it("se saisit sur la fiche et devient colonne et filtre de la liste", async () => {
    const definition = await createDefinition({ objectType: "opportunity", label: "Appel d'offres", type: "text" }, { id: adminId });
    await loadCustomFields();
    const key = customFieldKey(definition.id);
    expect(columnsOf("opportunity").map((column) => column.label)).toContain("Appel d'offres");

    const id = await create("Refonte Payroll");
    const saved = await patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, { [key]: "AO 2026-114" }, adminCookie), byId(id));
    expect(saved.status).toBe(200);
    await create("Audit Finance");

    expect(await titlesFor(`f=${key}:contient:2026-114`)).toEqual(["Refonte Payroll"]);
  });
});
