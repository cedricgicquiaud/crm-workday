import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postActivity } from "@/app/api/objets/[type]/[id]/activites/route";
import { GET as getLead, PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { activity, auditLog, lead, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-api-lead@exemple.fr", firstName: "Nadia", lastName: "Keller", password: "MotDePasse-Lead-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const on = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

const patch = (id: string, input: Record<string, unknown>) => patchLead(jsonRequest("PATCH", `/api/leads/${id}`, input, memberCookie), byId(id));
const read = async (id: string) => (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

async function create(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(lead);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** Contrat 1 : un lead naît « Nouveau », son créateur en responsable. */
describe("création d'un lead (CRM-91, D4, contrat 1)", () => {
  it("crée « Julie Martin · Banque X » à l'avancement « nouveau », le créateur en responsable, l'email normalisé", async () => {
    const id = await create({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", email: " Julie.Martin@BanqueX.fr ", origin: "linkedin" });
    expect(await read(id)).toMatchObject({ title: "Julie Martin · Banque X", stage: "nouveau", ownerId: memberId, origin: "linkedin", email: "julie.martin@banquex.fr", score: null });
  });

  it("refuse (401) une création sans session", async () => {
    expect((await postLead(jsonRequest("POST", "/api/leads", { firstName: "Ano", origin: "autre" }))).status).toBe(401);
  });

  it("répond 404 à un identifiant mal formé", async () => {
    expect((await getLead(jsonRequest("GET", "/api/leads/pas-un-uuid", undefined, memberCookie), byId("pas-un-uuid"))).status).toBe(404);
  });
});

/** Contrat 3 : tout se règle sur la fiche, se relit, et chaque changement entre dans l'historique. */
describe("modification d'un lead et son historique (CRM-91, D7, contrat 3)", () => {
  it("relit le score, le besoin, le téléphone, le LinkedIn et le poste posés", async () => {
    const id = await create({ firstName: "Julie", lastName: "Martin", origin: "linkedin" });
    const res = await patch(id, { score: 2, need: "Migration Workday Paie en 2027", phone: "06 12 34 56 78", linkedin: "https://www.linkedin.com/in/julie-martin", jobTitle: "DRH" });
    expect(res.status).toBe(200);
    expect(await read(id)).toMatchObject({ score: 2, need: "Migration Workday Paie en 2027", phone: "06 12 34 56 78", linkedin: "https://www.linkedin.com/in/julie-martin", jobTitle: "DRH" });
  });

  it("passe l'avancement de nouveau à contacté, à qualifié, puis revient à nouveau, avec une ligne d'historique par passage", async () => {
    const id = await create({ firstName: "Paul", lastName: "Durand", origin: "recommandation" });
    for (const stage of ["contacte", "qualifie", "nouveau"]) expect((await patch(id, { stage })).status).toBe(200);
    expect((await read(id)).stage).toBe("nouveau");

    const passages = (await listHistory("lead", id)).filter((entry) => entry.field === "stage").map((entry) => [entry.oldValue, entry.newValue, entry.author?.name]);
    expect(passages.sort()).toEqual(
      [
        ["contacte", "qualifie", "Nadia Keller"],
        ["nouveau", "contacte", "Nadia Keller"],
        ["qualifie", "nouveau", "Nadia Keller"],
      ].sort(),
    );
  });
});

/** Contrat 4, D7 : aucun passage automatique — une activité ne fait pas avancer un lead. */
describe("activités sur un lead (CRM-91, D7, contrat 4)", () => {
  it("garde l'avancement « nouveau » après un appel et une tâche", async () => {
    const id = await create({ companyName: "Banque Y", origin: "partenaire" });
    const call = await postActivity(jsonRequest("POST", `/api/objets/lead/${id}/activites`, { type: "appel", body: "Premier appel, rappeler en octobre." }, memberCookie), on("lead", id));
    expect(call.status).toBe(201);
    const task = await postActivity(jsonRequest("POST", `/api/objets/lead/${id}/activites`, { type: "tache", title: "Envoyer la plaquette", assigneeId: memberId }, memberCookie), on("lead", id));
    expect(task.status).toBe(201);
    expect((await read(id)).stage).toBe("nouveau");
  });
});
