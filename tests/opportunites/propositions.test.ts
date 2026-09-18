import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteProposal, PATCH as patchProposal } from "@/app/api/opportunites/[id]/propositions/[personId]/route";
import { POST as postProposal } from "@/app/api/opportunites/[id]/propositions/route";
import { auditLog, company, consultantModule, consultantProfile, opportunity, person, user } from "@/db/schema";
import { listFeed } from "@/features/activities/feed";
import { CHANGE } from "@/features/activities/schema";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { upsertConsultantProfile } from "@/features/consultants/consultant-profile";
import { createConsultant } from "@/features/consultants/consultants";
import { createObject } from "@/features/objects/service";
import { countProposals, listProposalCandidates, listProposals } from "@/features/opportunities/proposals";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-propositions@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Propositions-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const propose = (opportunityId: string, input: unknown) => postProposal(jsonRequest("POST", `/api/opportunites/${opportunityId}/propositions`, input, memberCookie), byId(opportunityId));

const byProposal = (id: string, personId: string) => ({ params: Promise.resolve({ id, personId }) });

const change = (opportunityId: string, personId: string, input: unknown) =>
  patchProposal(jsonRequest("PATCH", `/api/opportunites/${opportunityId}/propositions/${personId}`, input, memberCookie), byProposal(opportunityId, personId));

const withdraw = (opportunityId: string, personId: string) =>
  deleteProposal(jsonRequest("DELETE", `/api/opportunites/${opportunityId}/propositions/${personId}`, undefined, memberCookie), byProposal(opportunityId, personId));

async function createOpportunity(fields: Record<string, unknown> = {}): Promise<string> {
  return (await createObject("opportunity", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", ...fields }, { id: memberId })).id;
}

/** Un consultant freelance ; `profile` se règle ensuite sur son profil, comme sur sa fiche (la date de disponibilité ne se saisit pas à la création). */
async function consultant(firstName: string, lastName: string, profile: Record<string, unknown> = {}): Promise<string> {
  const { id } = await createConsultant({ firstName, lastName, status: "freelance" }, { id: memberId });
  if (Object.keys(profile).length > 0) await upsertConsultantProfile(id, profile, { id: memberId });
  return id;
}

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
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D44, D45, contrat 51 : un consultant ajouté est « Proposé », son TJM de vente proposé pré-rempli du TJM cible. */
describe("ajout d'un consultant sur une opportunité (CRM-107, D44, D45)", () => {
  it("relit Julie Martin « Proposé » à 650 € sur une opportunité au TJM cible de 650 €", async () => {
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    const julie = await consultant("Julie", "Martin");

    expect((await propose(opportunityId, { personId: julie })).status).toBe(201);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: julie, name: "Julie Martin", result: "propose", proposedDailyRate: 650 }]);
  });

  it("ajoute un consultant sans TJM proposé sur une opportunité sans TJM cible", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");

    expect((await propose(opportunityId, { personId: julie })).status).toBe(201);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: julie, result: "propose", proposedDailyRate: null }]);
  });

  /* Contrat 51 : une mission en cours n'empêche pas de proposer le consultant pour la suivante. */
  it("ajoute un consultant « En mission » jusqu'au 31 décembre 2099", async () => {
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    const marc = await consultant("Marc", "Petit", { availableFrom: "2099-12-31" });

    expect((await propose(opportunityId, { personId: marc })).status).toBe(201);

    expect(await listProposals(opportunityId)).toMatchObject([{ personId: marc, result: "propose" }]);
  });
});

/** D45, contrat 51 : le résultat passe d'une valeur à l'autre, dans tous les sens, tant que l'opportunité est en cours. */
describe("résultat d'une proposition (CRM-108, D45)", () => {
  it("passe Julie Martin de Proposé à Entretien, puis Retenu, puis Refusé, puis de nouveau Proposé", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");
    await propose(opportunityId, { personId: julie });
    const seen: string[] = [];

    for (const result of ["entretien", "retenu", "refuse", "propose"]) {
      expect((await change(opportunityId, julie, { result })).status).toBe(200);
      seen.push((await listProposals(opportunityId))[0].result);
    }

    expect(seen).toEqual(["entretien", "retenu", "refuse", "propose"]);
  });
});

/** D45, contrat 51 : le TJM de vente proposé se modifie, et se vide (il est facultatif). */
describe("TJM de vente proposé (CRM-108, D45)", () => {
  it("passe le TJM proposé de Julie Martin de 650 à 700 sans toucher à son résultat", async () => {
    const opportunityId = await createOpportunity({ targetDailyRate: 650 });
    const julie = await consultant("Julie", "Martin");
    await propose(opportunityId, { personId: julie });

    expect((await change(opportunityId, julie, { proposedDailyRate: 700 })).status).toBe(200);

    expect(await listProposals(opportunityId)).toMatchObject([{ result: "propose", proposedDailyRate: 700 }]);
  });
});

/** D46, contrat 51 : une proposition se retire tant que l'opportunité est en cours, retenu compris. */
describe("retrait d'une proposition (CRM-108, D46)", () => {
  it("retire Julie Martin, retenue, et garde Marc Petit", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");
    const marc = await consultant("Marc", "Petit");
    await propose(opportunityId, { personId: julie });
    await propose(opportunityId, { personId: marc });
    await change(opportunityId, julie, { result: "retenu" });

    expect((await withdraw(opportunityId, julie)).status).toBe(200);

    expect((await listProposals(opportunityId)).map((proposal) => proposal.name)).toEqual(["Marc Petit"]);
  });
});

/** La section lit une page de propositions et annonce le reste (« et N autres ») : jamais toutes les propositions d'un coup. */
describe("lecture bornée des propositions (CRM-107)", () => {
  it("lit les deux premières propositions ajoutées sur trois, et en compte trois", async () => {
    const opportunityId = await createOpportunity();
    for (const [firstName, lastName] of [["Julie", "Martin"], ["Marc", "Petit"], ["Chloé", "Dupont"]]) await propose(opportunityId, { personId: await consultant(firstName, lastName) });

    const proposals = await listProposals(opportunityId, { limit: 2 });

    expect({ names: proposals.map((proposal) => proposal.name), total: await countProposals(opportunityId) }).toEqual({ names: ["Julie Martin", "Marc Petit"], total: 3 });
  });
});

/** Les lignes « changement » du fil d'une fiche, dans l'ordre où la fiche les montre. */
const changes = async (type: string, id: string) => (await listFeed(type, id, [])).items.filter((item) => item.kind === CHANGE).map((item) => item.text);

/** D46, contrat 51 : l'historique de l'opportunité montre une ligne par ajout ; la fiche du consultant n'en reçoit aucune. */
describe("historique d'un ajout (CRM-107, D46)", () => {
  it("écrit « Consultant proposé : … » une fois par ajout sur l'opportunité", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");
    const marc = await consultant("Marc", "Petit");

    await propose(opportunityId, { personId: julie });
    await propose(opportunityId, { personId: marc });

    expect((await changes("opportunity", opportunityId)).filter((text) => text?.startsWith("Consultant proposé"))).toEqual(["Consultant proposé : Marc Petit", "Consultant proposé : Julie Martin"]);
  });

  it("n'écrit rien sur la fiche du consultant", async () => {
    const opportunityId = await createOpportunity();
    const julie = await consultant("Julie", "Martin");
    const before = await changes("person", julie);

    await propose(opportunityId, { personId: julie });

    expect(await changes("person", julie)).toEqual(before);
  });
});

/** D44, contrat 51 : « Ajouter un consultant » ne propose que les consultants actifs qui ne sont pas encore sur l'opportunité. */
describe("consultants proposés par « Ajouter un consultant » (CRM-107, D44)", () => {
  it("propose Chloé et Julie, pas Marc déjà proposé, ni Iris archivée, ni Paul sans profil consultant", async () => {
    const opportunityId = await createOpportunity();
    await consultant("Julie", "Martin");
    await consultant("Chloé", "Dupont");
    const marc = await consultant("Marc", "Petit");
    await propose(opportunityId, { personId: marc });
    await archiveRecord("person", await consultant("Iris", "Blanc"), { id: memberId });
    await createObject("person", { firstName: "Paul", lastName: "Durand" }, { id: memberId });

    const { options } = await listProposalCandidates(opportunityId);

    expect(options.map((option) => option.name)).toEqual(["Chloé Dupont", "Julie Martin"]);
  });

  /* La borne réelle est de 200 (D44) ; ramenée à 2, trois consultants suffisent à la dépasser. */
  it("borne les consultants proposés et compte ceux qui restent (« et 1 autre »)", async () => {
    const opportunityId = await createOpportunity();
    await consultant("Julie", "Martin");
    await consultant("Chloé", "Dupont");
    await consultant("Marc", "Petit");

    const { options, more } = await listProposalCandidates(opportunityId, { limit: 2 });

    expect({ names: options.map((option) => option.name), more }).toEqual({ names: ["Chloé Dupont", "Julie Martin"], more: 1 });
  });

  it("donne l'état de chaque consultant à côté de son nom", async () => {
    const opportunityId = await createOpportunity();
    await consultant("Julie", "Martin");
    await consultant("Marc", "Petit", { availableFrom: "2099-12-31" });

    const { options } = await listProposalCandidates(opportunityId);

    expect(options.map(({ name, state }) => [name, state])).toEqual([
      ["Julie Martin", "Disponible"],
      ["Marc Petit", "En mission · disponible le 31 déc. 2099"],
    ]);
  });
});
