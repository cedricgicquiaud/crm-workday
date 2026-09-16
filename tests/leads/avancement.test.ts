import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postArchive } from "@/app/api/objets/[type]/[id]/archiver/route";
import { POST as postDiscard } from "@/app/api/leads/[id]/ecarter/route";
import { POST as postReopen } from "@/app/api/leads/[id]/rouvrir/route";
import { GET as getLead, PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { auditLog, lead, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { isLocked } from "@/features/objects/fields";
import { selectableValues } from "@/features/objects/labels";
import { getObject } from "@/features/objects/registry";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import "@/features/objects/manifest";

const MEMBER = { email: "membre-avancement-lead@exemple.fr", firstName: "Omar", lastName: "Sylla", password: "MotDePasse-Avancement-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const on = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

const patch = (id: string, input: Record<string, unknown>) => patchLead(jsonRequest("PATCH", `/api/leads/${id}`, input, memberCookie), byId(id));
const read = async (id: string) => (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;
const discard = (id: string, cookie: string | undefined = memberCookie) => postDiscard(jsonRequest("POST", `/api/leads/${id}/ecarter`, undefined, cookie), byId(id));
const reopen = (id: string) => postReopen(jsonRequest("POST", `/api/leads/${id}/rouvrir`, undefined, memberCookie), byId(id));

async function create(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const stagePassages = async (id: string) => (await listHistory("lead", id)).filter((entry) => entry.field === "stage").map((entry) => `${entry.oldValue} → ${entry.newValue}`);

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(lead);
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

/** D7, contrat 12 : « converti » et « écarté » sont des fins, posées par leur geste et jamais à la main. */
describe("avancements réservés d'un lead (CRM-91, D7, contrat 12)", () => {
  it("ne propose au sélecteur que nouveau, contacté et qualifié", () => {
    const stage = getObject("lead").fields.find((field) => field.key === "stage")!;
    expect(selectableValues(stage, "contacte").map((option) => option.label)).toEqual(["Nouveau", "Contacté", "Qualifié"]);
  });

  it("refuse (400) de poser « converti » ou « écarté » par l'API, et garde l'avancement", async () => {
    const id = await create({ firstName: "Julie", origin: "linkedin" });
    const converted = await patch(id, { stage: "converti" });
    expect(converted.status).toBe(400);
    expect(await converted.json()).toMatchObject({ fields: { stage: "« Converti » ne se pose pas à la main dans « Avancement »." } });
    expect((await patch(id, { stage: "ecarte" })).status).toBe(400);
    expect((await postLead(jsonRequest("POST", "/api/leads", { firstName: "Julie", origin: "linkedin", stage: "ecarte" }, memberCookie))).status).toBe(400);
    expect((await read(id)).stage).toBe("nouveau");
  });
});

/** D7, contrat 8 : écarter un lead, puis le rouvrir ; chaque passage entre dans l'historique. */
describe("écarter et rouvrir un lead (CRM-91, D7, contrat 8)", () => {
  it("écarte un lead contacté, fige son avancement en texte, puis le rouvre à « contacté », avec une ligne par passage", async () => {
    const id = await create({ firstName: "Paul", lastName: "Durand", origin: "recommandation" });
    expect((await patch(id, { stage: "contacte" })).status).toBe(200);

    const discarded = await discard(id);
    expect(discarded.status).toBe(200);
    const record = await read(id);
    expect(record.stage).toBe("ecarte");
    const stage = getObject("lead").fields.find((field) => field.key === "stage")!;
    expect(isLocked(stage, record)).toBe(true);

    const reopened = await reopen(id);
    expect(reopened.status).toBe(200);
    expect((await read(id)).stage).toBe("contacte");
    expect(await stagePassages(id)).toEqual(expect.arrayContaining(["contacte → ecarte", "ecarte → contacte"]));
  });

  it("refuse (409, « rouvrir d'abord ») de changer l'avancement d'un lead écarté, mais laisse modifier ses autres champs", async () => {
    const id = await create({ companyName: "Banque Y", origin: "partenaire" });
    expect((await discard(id)).status).toBe(200);

    const refused = await patch(id, { stage: "qualifie" });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { message: string }).message).toContain("rouvrir d'abord");
    expect((await patch(id, { need: "Recontacter après le budget 2027" })).status).toBe(200);
    expect(await read(id)).toMatchObject({ stage: "ecarte", need: "Recontacter après le budget 2027" });
  });
});

describe("refus d'écarter et de rouvrir (CRM-91, D7, contrat 12)", () => {
  it("refuse (409) de rouvrir un lead qui n'est pas écarté", async () => {
    const id = await create({ firstName: "Léa", origin: "autre" });
    expect((await reopen(id)).status).toBe(409);
    expect((await read(id)).stage).toBe("nouveau");
  });

  it("refuse (409) d'écarter une seconde fois un lead écarté, sans nouvelle ligne d'historique", async () => {
    const id = await create({ firstName: "Léo", origin: "autre" });
    expect((await discard(id)).status).toBe(200);
    expect((await discard(id)).status).toBe(409);
    expect(await stagePassages(id)).toEqual(["nouveau → ecarte"]);
  });

  it("refuse (409) d'écarter un lead converti", async () => {
    const id = await create({ firstName: "Inès", origin: "autre" });
    await db.update(lead).set({ stage: "converti", convertedAt: new Date() }).where(eq(lead.id, id));
    expect((await discard(id)).status).toBe(409);
    expect((await read(id)).stage).toBe("converti");
  });

  it("refuse (409) d'écarter ou de rouvrir un lead archivé", async () => {
    const live = await create({ firstName: "Zoé", origin: "autre" });
    expect((await postArchive(jsonRequest("POST", `/api/objets/lead/${live}/archiver`, undefined, memberCookie), on("lead", live))).status).toBe(200);
    expect((await discard(live)).status).toBe(409);

    const discarded = await create({ firstName: "Yann", origin: "autre" });
    expect((await discard(discarded)).status).toBe(200);
    expect((await postArchive(jsonRequest("POST", `/api/objets/lead/${discarded}/archiver`, undefined, memberCookie), on("lead", discarded))).status).toBe(200);
    expect((await reopen(discarded)).status).toBe(409);
    expect((await read(discarded)).stage).toBe("ecarte");
  });

  it("répond 404 à un lead inconnu et 401 sans session", async () => {
    expect((await discard("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await discard("pas-un-uuid")).status).toBe(404);
    const id = await create({ firstName: "Anonyme", origin: "autre" });
    expect((await discard(id, undefined)).status).toBe(401);
  });
});
