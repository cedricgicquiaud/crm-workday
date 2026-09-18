import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { GET as getOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, customFieldDefinition, customFieldValue, lead, opportunity, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { listHistory } from "@/features/history/history";
import { createLead } from "@/features/leads/leads";
import { createObject } from "@/features/objects/service";
import { createOpportunity } from "@/features/opportunities/opportunities";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-conversion-opportunite@exemple.fr", firstName: "Inès", lastName: "Carpentier", password: "MotDePasse-Conv-Opp-1", role: "membre" as const };

const OWNER = { email: "responsable-conversion-opportunite@exemple.fr", firstName: "Bruno", lastName: "Vasseur", password: "MotDePasse-Conv-Opp-2", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let ownerId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function postNewLead(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const setStage = async (id: string, stage: string) => expect((await patchLead(jsonRequest("PATCH", `/api/leads/${id}`, { stage }, memberCookie), byId(id))).status).toBe(200);
const convert = (id: string, body: unknown) => postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, body, memberCookie), byId(id));
const readOpportunity = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

const newCompany = async (name: string) => (await createObject("company", { name, type: "prospect" }, { id: memberId })).id;

const opportunityAt = (companyId: string) => ({ title: "Besoin Workday · Banque X", companyId, modules: ["hcm"], expectedClose: "2026-12-15" });

/** Les enfants avant les parents : une opportunité retient son lead, son contact et son entreprise (clés sans cascade). */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await loadCustomFields();
  await db.delete(opportunity);
  await db.delete(activity);
  await db.delete(lead);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await db.delete(user).where(eq(user.email, OWNER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  ownerId = (await createUserWithPassword(OWNER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D67 : le geste de création d'une opportunité (la conversion d'un lead) vérifie l'étape qu'il pose. */
describe("geste de création d'une opportunité (CRM-111, D67)", () => {
  it("refuse (400, sous « stage ») une étape réservée ou inconnue, et ne crée aucune opportunité", async () => {
    const bank = await newCompany("Banque X");
    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });

    for (const stage of ["gagnee", "perdue", "inventee"]) {
      const attempt = db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage, leadId: origin.id }));
      await expect(attempt, stage).rejects.toMatchObject({ status: 400, details: { fields: { stage: expect.any(String) } } });
    }
    expect(await db.select({ id: opportunity.id }).from(opportunity)).toHaveLength(0);
  });

  it("écrit une seule ligne d'historique pour l'étape posée, « Qualifié », à côté de la ligne de création", async () => {
    const bank = await newCompany("Banque X");
    const origin = await createLead({ firstName: "Julie", lastName: "Martin", origin: "linkedin" }, { id: memberId });

    const created = await db.transaction((tx) => createOpportunity(opportunityAt(bank), { id: memberId }, { exec: tx, stage: "qualifie", leadId: origin.id }));

    const history = await listHistory("opportunity", created.id);
    expect(history.filter((entry) => entry.field === "stage").map((entry) => [entry.oldValue, entry.newValue])).toEqual([[null, "qualifie"]]);
    expect(history.filter((entry) => entry.action === "creee")).toHaveLength(1);
  });
});

describe("convertir un lead qualifié en opportunité (CRM-111, D50, D51, contrat 55)", () => {
  it("crée l'opportunité « Qualifié » chez Banque X, avec la personne en contact, le besoin, les modules, la clôture et le responsable du lead, liée au lead", async () => {
    const id = await postNewLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", need: "Déploiement HCM pour 3 000 salariés", origin: "linkedin", ownerId });
    await setStage(id, "qualifie");

    const res = await convert(id, { opportunity: { title: "Besoin Workday · Banque X", modules: ["hcm"], expectedClose: "2026-12-15" } });
    expect(res.status).toBe(200);
    const { personId, companyId, opportunityId } = (await res.json()) as { personId: string; companyId: string; opportunityId: string };

    expect(await readOpportunity(opportunityId)).toMatchObject({
      title: "Besoin Workday · Banque X",
      stage: "qualifie",
      companyId,
      contactPersonId: personId,
      need: "Déploiement HCM pour 3 000 salariés",
      modules: ["hcm"],
      expectedClose: "2026-12-15",
      ownerId,
      leadId: id,
    });
  });

  it("écrit dans l'historique du lead « Converti en Julie Martin · Banque X · Besoin Workday · Banque X »", async () => {
    const id = await postNewLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", need: "Paie", origin: "linkedin" });

    expect((await convert(id, { opportunity: { title: "Besoin Workday · Banque X", modules: ["payroll"], expectedClose: "2026-12-15" } })).status).toBe(200);

    const conversion = (await listHistory("lead", id)).filter((entry) => entry.action === "conversion");
    expect(conversion.map((entry) => entry.newValue)).toEqual(["Julie Martin · Banque X · Besoin Workday · Banque X"]);
  });

  it("n'exige pas un champ personnalisé obligatoire des opportunités, qui reste vide", async () => {
    const channel = await createDefinition({ objectType: "opportunity", label: "Canal", type: "text", required: true }, { id: memberId });
    await loadCustomFields();
    const id = await postNewLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", need: "Paie", origin: "linkedin" });

    const res = await convert(id, { opportunity: { title: "Besoin Workday · Banque X", modules: ["payroll"], expectedClose: "2026-12-15" } });
    expect(res.status).toBe(200);
    const { opportunityId } = (await res.json()) as { opportunityId: string };
    expect((await readOpportunity(opportunityId))[customFieldKey(channel.id)] ?? null).toBeNull();
  });
});

describe("convertir en gardant une entreprise existante (CRM-112, D51, contrat 56)", () => {
  it("crée l'opportunité chez « Acme », que la personne garde, et jamais chez l'entreprise écrite sur le lead", async () => {
    const acme = await newCompany("Acme");
    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Yves", lastName: "Garnier", email: "yves.garnier@acme.fr", companyId: acme }, memberCookie));
    expect(created.status).toBe(201);
    const id = await postNewLead({ firstName: "Yves", lastName: "Garnier", companyName: "Banque Garde", email: "yves.garnier@acme.fr", need: "Paie", origin: "recommandation" });

    const res = await convert(id, { companyName: "Banque Garde", keepCompany: true, opportunity: { title: "Besoin Workday · Acme", modules: ["payroll"], expectedClose: "2026-12-15" } });
    expect(res.status).toBe(200);
    const { opportunityId } = (await res.json()) as { opportunityId: string };

    expect(await readOpportunity(opportunityId)).toMatchObject({ companyId: acme, title: "Besoin Workday · Acme" });
  });
});
