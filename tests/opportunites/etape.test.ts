import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postActivity } from "@/app/api/objets/[type]/[id]/activites/route";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { activity, auditLog, company, opportunity, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { listForState } from "@/features/lists/apply-filters";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { listStateWithView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-etape-opportunite@exemple.fr", firstName: "Nora", lastName: "Benali", password: "MotDePasse-Etape-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const on = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

const patch = (id: string, input: Record<string, unknown>) => patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

async function create(title = "Refonte Payroll"): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title, companyId: bankId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30" }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade) ; ses modules partent avec elle. */
async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(opportunity);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(company);
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.delete(company);
  await closeDb();
});

/** D32, contrat 34 : on passe librement entre les six étapes en cours, dans les deux sens. */
describe("passage d'étape (CRM-105, D32, contrat 34)", () => {
  it("passe de « Nouveau besoin » à « Entretien client », puis revient à « Qualifié »", async () => {
    const id = await create();
    expect((await patch(id, { stage: "entretien_client" })).status).toBe(200);
    expect((await read(id)).stage).toBe("entretien_client");
    expect((await patch(id, { stage: "qualifie" })).status).toBe(200);
    expect((await read(id)).stage).toBe("qualifie");
  });
});

/** D33, contrats 31 et 34 : la probabilité se déduit de l'étape, à chaque lecture. */
describe("probabilité (CRM-105, D33, contrats 31 et 34)", () => {
  it("vaut 10 à la création, 50 en « Entretien client », puis 20 au retour à « Qualifié »", async () => {
    const id = await create();
    expect((await read(id)).probability).toBe(10);
    await patch(id, { stage: "entretien_client" });
    expect((await read(id)).probability).toBe(50);
    await patch(id, { stage: "qualifie" });
    expect((await read(id)).probability).toBe(20);
  });
});

/** D32, D33, contrat 34 : chaque passage d'étape entre dans l'historique ; la probabilité qui le suit, jamais. */
describe("historique des passages d'étape (CRM-105, D32, D33, contrat 34)", () => {
  it("écrit une ligne par passage, avec ancienne et nouvelle étape, auteur et date, et aucune ligne de probabilité", async () => {
    const id = await create();
    const before = Date.now();
    await patch(id, { stage: "entretien_client" });
    await patch(id, { stage: "qualifie" });

    const history = await listHistory("opportunity", id);
    const passages = history.filter((entry) => entry.field === "stage").reverse();
    expect(passages.map((entry) => [entry.oldValue, entry.newValue])).toEqual([
      ["nouveau_besoin", "entretien_client"],
      ["entretien_client", "qualifie"],
    ]);
    for (const entry of passages) {
      expect(entry.author).toEqual({ id: memberId, name: "Nora Benali" });
      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
    expect(history.filter((entry) => entry.field === "probability")).toEqual([]);
  });
});

/** D32 : aucun passage automatique — une activité ne fait pas avancer une opportunité. */
describe("activités sur une opportunité (CRM-105, D32)", () => {
  it("garde l'étape « Nouveau besoin » après une note et une tâche", async () => {
    const id = await create();
    const note = await postActivity(jsonRequest("POST", `/api/objets/opportunity/${id}/activites`, { type: "note", body: "Besoin confirmé par la DRH." }, memberCookie), on("opportunity", id));
    expect(note.status).toBe(201);
    const task = await postActivity(jsonRequest("POST", `/api/objets/opportunity/${id}/activites`, { type: "tache", title: "Envoyer deux profils", assigneeId: memberId }, memberCookie), on("opportunity", id));
    expect(task.status).toBe(201);
    expect((await read(id)).stage).toBe("nouveau_besoin");
  });
});

/** D32, contrat 36 : trier par étape suit le rang du pipeline, pas l'alphabet des libellés. */
describe("tri par étape (CRM-105, D32, contrat 36)", () => {
  it("range Nouveau besoin avant Qualifié, puis jusqu'à Négociation, Gagnée et Perdue en dernier", async () => {
    /* Créées dans le désordre ; gagnée et perdue ne se posent que par leur geste (4.2d), posées ici en base. */
    for (const stage of ["perdue", "negociation", "qualifie", "gagnee", "entretien_client", "nouveau_besoin", "proposition_envoyee", "profils_proposes"]) {
      const id = await create(`Étape ${stage}`);
      await db.update(opportunity).set({ stage }).where(eq(opportunity.id, id));
    }
    const state = await listStateWithView("opportunity", new URLSearchParams("tri=stage:asc&f=title:contient:Étape"));
    const sorted = listForState("opportunity", await listObjectRecords("opportunity"), state);
    expect(sorted.map((record) => record.stage)).toEqual(["nouveau_besoin", "qualifie", "profils_proposes", "entretien_client", "proposition_envoyee", "negociation", "gagnee", "perdue"]);
  });
});
