import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, customFieldDefinition, customFieldValue, lead, objectRedirect, opportunity, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { deleteRecord } from "@/features/archive/delete";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { createLead } from "@/features/leads/leads";
import { mergeRecords } from "@/features/merge/merge";
import { linkedGroups } from "@/features/objects/links-column";
import { createObject } from "@/features/objects/service";
import { createOpportunity } from "@/features/opportunities/opportunities";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-creation-opportunite@exemple.fr", firstName: "Léa", lastName: "Morel", password: "MotDePasse-Creation-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

type Response_ = { status: number; body: Record<string, unknown> & { fields?: Record<string, string>; message?: string } };

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function post(input: Record<string, unknown>): Promise<Response_> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", input, memberCookie));
  return { status: res.status, body: (await res.json()) as Response_["body"] };
}

async function patch(id: string, input: Record<string, unknown>): Promise<Response_> {
  const res = await patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
  return { status: res.status, body: (await res.json()) as Response_["body"] };
}

const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

const newCompany = async (name: string) => (await createObject("company", { name, type: "prospect" }, { id: memberId })).id;

const opportunityAt = (companyId: string) => ({ title: "Refonte Payroll", companyId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" });

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade). */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await loadCustomFields();
  await db.delete(opportunity);
  await db.delete(lead);
  await db.delete(objectRedirect);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D36, contrat 41 : une entreprise archivée ne se choisit plus ; le refus nomme la fiche. */
describe("entreprise archivée (CRM-104, D36, contrat 41)", () => {
  it("refuse (409) de créer une opportunité chez une entreprise archivée, en la nommant, et n'en crée aucune", async () => {
    const archived = await newCompany("Banque Fermée");
    await archiveRecord("company", archived, { id: memberId });

    const refusal = await post(opportunityAt(archived));
    expect(refusal.status).toBe(409);
    expect(refusal.body.message).toContain("« Banque Fermée »");
    expect(await db.select({ id: opportunity.id }).from(opportunity)).toHaveLength(0);
  });

  it("refuse (409) de déplacer une opportunité vers une entreprise archivée, en la nommant, et garde l'entreprise enregistrée", async () => {
    const bank = await newCompany("Banque X");
    const archived = await newCompany("Banque Fermée");
    await archiveRecord("company", archived, { id: memberId });
    const { body } = await post(opportunityAt(bank));

    const refusal = await patch(String(body.id), { companyId: archived });
    expect(refusal.status).toBe(409);
    expect(refusal.body.message).toContain("« Banque Fermée »");
    expect((await read(String(body.id))).companyId).toBe(bank);
  });
});

/** Une entreprise absorbée par une fusion a une fiche conservée : c'est elle que l'opportunité désigne. */
describe("entreprise absorbée par une fusion (CRM-104, D36)", () => {
  it("enregistre la fiche conservée quand la création désigne l'entreprise absorbée", async () => {
    const kept = await newCompany("Banque X");
    const absorbed = await newCompany("Banque X SA");
    await mergeRecords("company", kept, absorbed, []);

    const created = await post(opportunityAt(absorbed));
    expect(created.status).toBe(201);
    expect((await read(String(created.body.id))).companyId).toBe(kept);
  });

  it("enregistre la fiche conservée quand la modification désigne l'entreprise absorbée", async () => {
    const kept = await newCompany("Banque X");
    const absorbed = await newCompany("Banque X SA");
    const other = await newCompany("Acme");
    await mergeRecords("company", kept, absorbed, []);
    const { body } = await post(opportunityAt(other));

    expect((await patch(String(body.id), { companyId: absorbed })).status).toBe(200);
    expect((await read(String(body.id))).companyId).toBe(kept);
  });
});

/** Préparé pour la conversion d'un lead (4.2c) : un geste crée l'opportunité dans sa transaction, à son étape, liée à son lead. */
describe("création par un geste (CRM-104, D51, D55)", () => {
  it("crée dans la transaction du geste une opportunité à l'étape « Qualifié », issue du lead, sans exiger un champ personnalisé obligatoire", async () => {
    const bank = await newCompany("Banque X");
    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });
    await createDefinition({ objectType: "opportunity", label: "Canal", type: "text", required: true }, { id: memberId });
    await loadCustomFields();

    const created = await db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage: "qualifie", leadId: origin.id, customRequired: false }));
    expect(await read(created.id)).toMatchObject({ title: "Refonte Payroll", stage: "qualifie", leadId: origin.id });
  });

  it("relie le lead et l'opportunité : « Issu du lead » sur l'opportunité, « Opportunité » sur le lead, gardée archivée ; un lead sans opportunité n'en montre pas le groupe", async () => {
    const bank = await newCompany("Banque X");
    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });
    const alone = await createLead({ firstName: "Luc", lastName: "Seul", origin: "linkedin" }, { id: memberId });
    const created = await db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage: "qualifie", leadId: origin.id }));
    await archiveRecord("opportunity", created.id, { id: memberId });

    const fromLead = (await linkedGroups("opportunity", created.id)).find((group) => group.label === "Issu du lead");
    expect(fromLead?.records.map((record) => record.id)).toEqual([origin.id]);
    const onLead = (await linkedGroups("lead", origin.id)).find((group) => group.label === "Opportunité");
    expect(onLead?.records).toEqual([{ id: created.id, title: "Refonte Payroll", href: `/opportunites/${created.id}`, archived: "archivée" }]);
    expect((await linkedGroups("lead", alone.id)).map((group) => group.label)).not.toContain("Opportunité");
  });
});

/** D43, D59 : déclaré ici, prouvé avec ses gestes en 4.2c et 4.2d — une opportunité gagnée ou issue d'un lead s'archive. */
describe("refus de suppression à deux motifs (CRM-104, D43, D59)", () => {
  it("refuse (409) de supprimer une opportunité gagnée, puis une issue d'un lead, chacune avec sa phrase ; une opportunité en cours se supprime", async () => {
    const bank = await newCompany("Banque X");
    const won = await post(opportunityAt(bank));
    await db.update(opportunity).set({ stage: "gagnee" }).where(eq(opportunity.id, String(won.body.id)));
    await expect(deleteRecord("opportunity", String(won.body.id))).rejects.toMatchObject({ status: 409, message: "Une opportunité gagnée s'archive." });

    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });
    const converted = await db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage: "qualifie", leadId: origin.id }));
    await expect(deleteRecord("opportunity", converted.id)).rejects.toMatchObject({ status: 409, message: "Une opportunité issue d'un lead s'archive." });

    const open_ = await post(opportunityAt(bank));
    await deleteRecord("opportunity", String(open_.body.id));
    expect(await db.select({ id: opportunity.id }).from(opportunity).where(eq(opportunity.id, String(open_.body.id)))).toHaveLength(0);
  });
});

