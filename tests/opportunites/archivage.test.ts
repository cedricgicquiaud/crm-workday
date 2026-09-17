import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as archiveRecord } from "@/app/api/objets/[type]/[id]/archiver/route";
import { POST as restoreRecord } from "@/app/api/objets/[type]/[id]/restaurer/route";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-archivage-opportunite@exemple.fr", firstName: "Sacha", lastName: "Morel", password: "MotDePasse-Archive-Opp-1", role: "membre" as const };
const ADMIN = { email: "admin-archivage-opportunite@exemple.fr", firstName: "Zoé", lastName: "Aubry", password: "MotDePasse-Archive-Opp-2", role: "administrateur" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const on = (id: string) => ({ params: Promise.resolve({ type: "opportunity", id }) });

async function create(title = "Refonte Payroll"): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title, companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const archive = (id: string) => archiveRecord(jsonRequest("POST", `/api/objets/opportunity/${id}/archiver`, undefined, memberCookie), on(id));
const restore = (id: string) => restoreRecord(jsonRequest("POST", `/api/objets/opportunity/${id}/restaurer`, undefined, memberCookie), on(id));
const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade) ; ses modules partent avec elle. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(company);
  await db.delete(user).where(inArray(user.email, [MEMBER.email, ADMIN.email]));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  await createUserWithPassword(ADMIN);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.delete(company);
  await closeDb();
});

/** D37 : une opportunité se range et se sort du rangement, comme toute fiche du CRM. */
describe("archivage d'une opportunité (CRM-106, D37)", () => {
  it("l'archive, refuse (409) de la modifier tant qu'elle l'est, puis la restaure telle quelle", async () => {
    const id = await create();

    expect((await archive(id)).status).toBe(200);
    expect((await read(id)).archivedAt).not.toBeNull();
    const refused = await patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, { title: "Refonte Payroll 2027" }, memberCookie), byId(id));
    expect(refused.status).toBe(409);

    expect((await restore(id)).status).toBe(200);
    expect(await read(id)).toMatchObject({ archivedAt: null, title: "Refonte Payroll", modules: ["hcm", "payroll"] });
  });
});
