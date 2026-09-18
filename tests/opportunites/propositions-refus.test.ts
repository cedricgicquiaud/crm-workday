import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH as patchProposal } from "@/app/api/opportunites/[id]/propositions/[personId]/route";
import { POST as postProposal } from "@/app/api/opportunites/[id]/propositions/route";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createConsultant } from "@/features/consultants/consultants";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
import { listProposals } from "@/features/opportunities/proposals";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-propositions-refus@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Propositions-2", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let opportunityId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const propose = (id: string, input: unknown, cookie: string | undefined = memberCookie) => postProposal(jsonRequest("POST", `/api/opportunites/${id}/propositions`, input, cookie), byId(id));

const byProposal = (id: string, personId: string) => ({ params: Promise.resolve({ id, personId }) });

const change = (id: string, personId: string, input: unknown, cookie: string | undefined = memberCookie) =>
  patchProposal(jsonRequest("PATCH", `/api/opportunites/${id}/propositions/${personId}`, input, cookie), byProposal(id, personId));

const consultant = async (firstName: string, lastName: string) => (await createConsultant({ firstName, lastName, status: "freelance" }, { id: memberId })).id;

/** Les enfants avant les parents : les propositions partent avec l'opportunité (cascade), qui retient l'entreprise et les personnes. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

beforeEach(async () => {
  await cleanup();
  const bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
  opportunityId = (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650 }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D44, contrat 53 : seul un consultant se propose. */
describe("refus d'une personne sans profil consultant (CRM-107, D44)", () => {
  it("répond 400 sous « personId » pour un contact sans profil consultant, et ne propose rien", async () => {
    const paul = (await createObject("person", { firstName: "Paul", lastName: "Durand" }, { id: memberId })).id;

    const res = await propose(opportunityId, { personId: paul });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { personId: "Seul un consultant se propose sur une opportunité : « Paul Durand » n'a pas de profil consultant." } });
    expect(await listProposals(opportunityId)).toEqual([]);
  });
});

/** D44, contrat 53 : un consultant est proposé une fois par opportunité. */
describe("refus d'un consultant déjà proposé (CRM-107, D44)", () => {
  it("répond 409 au second ajout de Julie Martin, et garde une seule proposition et une seule ligne d'historique", async () => {
    const julie = await consultant("Julie", "Martin");
    expect((await propose(opportunityId, { personId: julie })).status).toBe(201);

    const res = await propose(opportunityId, { personId: julie });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ message: "« Julie Martin » figure déjà parmi les consultants proposés." });
    expect(await listProposals(opportunityId)).toHaveLength(1);
    expect((await listHistory("opportunity", opportunityId)).filter((entry) => entry.action === "proposition_ajoutee")).toHaveLength(1);
  });
});

/** D44, contrat 53 : un consultant archivé ne se propose pas. */
describe("refus d'un consultant archivé (CRM-107, D44)", () => {
  it("répond 409 en nommant Julie Martin archivée, et ne propose rien", async () => {
    const julie = await consultant("Julie", "Martin");
    await archiveRecord("person", julie, { id: memberId });

    const res = await propose(opportunityId, { personId: julie });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ message: "« Julie Martin » est archivée : restaurez sa fiche pour la proposer." });
    expect(await listProposals(opportunityId)).toEqual([]);
  });
});

/** D55 : l'entrée se valide avant la première requête ; une clé que l'ajout ne prévoit pas répond 400, jamais ignorée. */
describe("entrée de l'ajout (CRM-107, D55)", () => {
  it("répond 400 sous « result » : le résultat d'un ajout est toujours « Proposé »", async () => {
    const julie = await consultant("Julie", "Martin");

    const res = await propose(opportunityId, { personId: julie, result: "retenu" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { result: "« result » ne se donne pas à l'ajout d'un consultant." } });
    expect(await listProposals(opportunityId)).toEqual([]);
  });

  it.each([
    ["absent", {}],
    ["mal formé", { personId: "julie" }],
    ["d'un autre type", { personId: 42 }],
    ["inconnu", { personId: "00000000-0000-4000-8000-000000000000" }],
  ])("répond 400 sous « personId » pour un consultant %s", async (_case, input) => {
    const res = await propose(opportunityId, input);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { personId: "Choisissez un consultant." } });
  });
});

/** D45, contrat 53 : un seul consultant « Retenu » par opportunité. */
describe("refus d'un second « Retenu » (CRM-108, D45)", () => {
  it("répond 409 en nommant Julie Martin, retenue, quand Marc Petit passe à « Retenu », et le laisse « Entretien »", async () => {
    const julie = await consultant("Julie", "Martin");
    const marc = await consultant("Marc", "Petit");
    await propose(opportunityId, { personId: julie });
    await propose(opportunityId, { personId: marc });
    await change(opportunityId, julie, { result: "retenu" });
    await change(opportunityId, marc, { result: "entretien" });

    const res = await change(opportunityId, marc, { result: "retenu" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ message: "« Julie Martin » est déjà retenu sur cette opportunité : changez d'abord son résultat." });
    expect((await listProposals(opportunityId)).map(({ name, result }) => [name, result])).toEqual([
      ["Julie Martin", "retenu"],
      ["Marc Petit", "entretien"],
    ]);
  });
});

/** D45, contrat 53 : le TJM de vente proposé a les bornes du TJM cible — plus de 0, 5 000 au plus, deux décimales au plus. */
describe("refus d'un TJM proposé hors bornes (CRM-108, D45)", () => {
  it.each([
    ["0", 0, "« TJM de vente proposé » doit être supérieur à 0 et au plus 5 000."],
    ["5 000,01", 5000.01, "« TJM de vente proposé » doit être supérieur à 0 et au plus 5 000."],
    ["650,125", 650.125, "« TJM de vente proposé » ne prend pas plus de 2 décimales."],
  ])("répond 400 sous « proposedDailyRate » pour %s, et garde 650", async (_case, proposedDailyRate, message) => {
    const julie = await consultant("Julie", "Martin");
    await propose(opportunityId, { personId: julie });

    const res = await change(opportunityId, julie, { proposedDailyRate });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { proposedDailyRate: message } });
    expect(await listProposals(opportunityId)).toMatchObject([{ proposedDailyRate: 650 }]);
  });
});

/** D55 : une modification règle le résultat ou le TJM proposé, rien d'autre ; une autre clé répond 400, jamais ignorée. */
describe("entrée d'une modification de proposition (CRM-108, D55)", () => {
  it("répond 400 sous « personId » : le consultant d'une proposition ne se change pas", async () => {
    const julie = await consultant("Julie", "Martin");
    const marc = await consultant("Marc", "Petit");
    await propose(opportunityId, { personId: julie });

    const res = await change(opportunityId, julie, { result: "entretien", personId: marc });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { personId: "« personId » ne se donne pas à la modification d'une proposition." } });
    expect(await listProposals(opportunityId)).toMatchObject([{ personId: julie, result: "propose" }]);
  });

  it("répond 400 à une modification qui ne donne ni résultat ni TJM proposé", async () => {
    const julie = await consultant("Julie", "Martin");
    await propose(opportunityId, { personId: julie });

    const res = await change(opportunityId, julie, {});

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ message: "Donnez un résultat ou un TJM de vente proposé." });
  });
});

/** D55 : la proposition visée existe ; sinon 404, jamais un 200 qui n'a rien écrit. */
describe("proposition visée par une modification (CRM-108, D55)", () => {
  it.each([
    ["mal formé", "julie"],
    ["inconnu", "00000000-0000-4000-8000-000000000000"],
  ])("répond 404 pour un consultant %s", async (_case, personId) => {
    expect((await change(opportunityId, personId, { result: "entretien" })).status).toBe(404);
  });

  it("répond 404 pour Marc Petit, consultant qui n'est pas proposé sur l'opportunité", async () => {
    const marc = await consultant("Marc", "Petit");

    expect((await change(opportunityId, marc, { result: "entretien" })).status).toBe(404);
  });

  it("répond 409 sur une opportunité archivée, et garde Julie Martin « Proposé »", async () => {
    const julie = await consultant("Julie", "Martin");
    await propose(opportunityId, { personId: julie });
    await archiveRecord("opportunity", opportunityId, { id: memberId });

    const res = await change(opportunityId, julie, { result: "entretien" });

    expect(res.status).toBe(409);
    expect(await listProposals(opportunityId)).toMatchObject([{ result: "propose" }]);
  });

  it("répond 401 sans session", async () => {
    const julie = await consultant("Julie", "Martin");
    await propose(opportunityId, { personId: julie });

    expect((await change(opportunityId, julie, { result: "entretien" }, "")).status).toBe(401);
  });
});

/** D21, D55 : l'opportunité visée existe, n'est pas archivée, et le membre est connecté. */
describe("opportunité visée par l'ajout (CRM-107, D55)", () => {
  it("répond 409 sur une opportunité archivée, et ne propose rien", async () => {
    const julie = await consultant("Julie", "Martin");
    await archiveRecord("opportunity", opportunityId, { id: memberId });

    const res = await propose(opportunityId, { personId: julie });

    expect(res.status).toBe(409);
    expect(await listProposals(opportunityId)).toEqual([]);
  });

  it("répond 404 pour un identifiant d'opportunité mal formé ou inconnu", async () => {
    const julie = await consultant("Julie", "Martin");

    expect((await propose("refonte-payroll", { personId: julie })).status).toBe(404);
    expect((await propose("00000000-0000-4000-8000-000000000000", { personId: julie })).status).toBe(404);
  });

  it("répond 401 sans session, et ne propose rien", async () => {
    const julie = await consultant("Julie", "Martin");

    expect((await propose(opportunityId, { personId: julie }, "")).status).toBe(401);
    expect(await listProposals(opportunityId)).toEqual([]);
  });
});
