import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postArchive } from "@/app/api/objets/[type]/[id]/archiver/route";
import { POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { POST as postDiscard } from "@/app/api/leads/[id]/ecarter/route";
import { GET as getLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { activity, auditLog, company, lead, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { closeDb, db, rawSql } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-conversion-refus@exemple.fr", firstName: "Lou", lastName: "Marchand", password: "MotDePasse-Refus-Conv-1", role: "membre" as const };

let memberCookie: string;
let memberId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const on = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

async function createLead(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const convert = (id: string, body: unknown) => postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, body, memberCookie), byId(id));
const readLead = async (id: string) => (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;
const archive = async (type: string, id: string) => expect((await postArchive(jsonRequest("POST", `/api/objets/${type}/${id}/archiver`, undefined, memberCookie), on(type, id))).status).toBe(200);
const personNames = async () => (await listObjectRecords("person", { includeArchived: true })).map((record) => record.name);
const companyNames = async () => (await listObjectRecords("company", { includeArchived: true })).map((record) => record.name);

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(lead);
  await db.delete(person);
  await db.delete(company);
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

describe("refus de convertir selon l'état du lead (CRM-95, D14, contrat 24)", () => {
  it("refuse (409) de convertir une seconde fois un lead converti, en disant pourquoi, sans créer de personne ni d'entreprise", async () => {
    const id = await createLead({ firstName: "Théo", lastName: "Robin", companyName: "Banque Rejeu", origin: "autre" });
    expect((await convert(id, {})).status).toBe(200);
    const persons = await personNames();

    const replay = await convert(id, {});
    expect(replay.status).toBe(409);
    expect(((await replay.json()) as { message: string }).message).toBe("Ce lead est déjà converti.");
    expect(await personNames()).toEqual(persons);
  });

  it("refuse (409) de convertir un lead écarté ou archivé, en disant pourquoi, et le laisse tel quel", async () => {
    const discarded = await createLead({ firstName: "Eva", lastName: "Petit", companyName: "Banque Écartée", origin: "autre" });
    expect((await postDiscard(jsonRequest("POST", `/api/leads/${discarded}/ecarter`, undefined, memberCookie), byId(discarded))).status).toBe(200);
    const archived = await createLead({ firstName: "Noé", lastName: "Simon", companyName: "Banque Archivée", origin: "autre" });
    await archive("lead", archived);

    const refusedDiscarded = await convert(discarded, {});
    expect(refusedDiscarded.status).toBe(409);
    expect(((await refusedDiscarded.json()) as { message: string }).message).toContain("écarté");
    const refusedArchived = await convert(archived, {});
    expect(refusedArchived.status).toBe(409);
    expect(((await refusedArchived.json()) as { message: string }).message).toContain("archivé");
    expect(await readLead(discarded)).toMatchObject({ stage: "ecarte", convertedPersonId: null });
    expect(await companyNames()).not.toContain("Banque Écartée");
  });

  it("ne réussit qu'une conversion sur deux simultanées du même lead : l'autre répond 409", async () => {
    const id = await createLead({ firstName: "Jade", lastName: "Roux", companyName: "Banque Course", origin: "autre" });

    const statuses = (await Promise.all([convert(id, {}), convert(id, {})])).map((res) => res.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect((await companyNames()).filter((name) => name === "Banque Course")).toHaveLength(1);
  });
});

describe("refus de convertir vers une fiche archivée (CRM-95, D17, contrat 25)", () => {
  it("refuse (409) quand la personne retrouvée par l'email est archivée : le message la nomme et propose de la restaurer, rien n'est écrit", async () => {
    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Hélène", lastName: "Morin", email: "helene.morin@banque-a.fr" }, memberCookie));
    const { id: heleneId } = (await created.json()) as { id: string };
    await archive("person", heleneId);
    const id = await createLead({ companyName: "Banque Personne Archivée", email: "helene.morin@banque-a.fr", origin: "autre" });

    const res = await convert(id, {});
    expect(res.status).toBe(409);
    const { message } = (await res.json()) as { message: string };
    expect(message).toContain("« Hélène Morin »");
    expect(message).toContain("restaur");
    expect(await readLead(id)).toMatchObject({ stage: "nouveau" });
    expect(await companyNames()).not.toContain("Banque Personne Archivée");
  });

  it("refuse (409) quand l'entreprise choisie est archivée : le message la nomme et propose de la restaurer, ni personne ni avancement ne sont écrits", async () => {
    const archivedCompany = await createObject("company", { name: "Banque Fermée", type: "client" }, { id: memberId });
    await archive("company", archivedCompany.id);
    const id = await createLead({ firstName: "Victor", lastName: "Lambert", origin: "autre" });

    const res = await convert(id, { companyId: archivedCompany.id });
    expect(res.status).toBe(409);
    const { message } = (await res.json()) as { message: string };
    expect(message).toContain("« Banque Fermée »");
    expect(message).toContain("restaur");
    expect(await readLead(id)).toMatchObject({ stage: "nouveau" });
    expect(await personNames()).not.toContain("Victor Lambert");
  });
});

describe("refus de la saisie de la fenêtre (CRM-95, D15, contrat 26)", () => {
  it("refuse (400) sous le champ une nouvelle personne sans prénom, sans nom ou sans entreprise, et un rôle hors liste, sans rien créer", async () => {
    const id = await createLead({ companyName: "Banque Vide", origin: "autre" });

    const noNames = await convert(id, { firstName: "", lastName: " ", companyName: "" });
    expect(noNames.status).toBe(400);
    expect(((await noNames.json()) as { fields: Record<string, string> }).fields).toEqual({
      firstName: "« Prénom » est obligatoire.",
      lastName: "« Nom » est obligatoire.",
      companyName: "« Entreprise » est obligatoire.",
    });
    const badRole = await convert(id, { firstName: "Ana", lastName: "Diaz", decisionRole: "roi" });
    expect(badRole.status).toBe(400);
    expect(((await badRole.json()) as { fields: Record<string, string> }).fields).toEqual({ decisionRole: "Valeur hors liste pour « Rôle dans la décision »." });
    expect(await readLead(id)).toMatchObject({ stage: "nouveau" });
    expect(await personNames()).not.toContain("Ana Diaz");
  });

  it("répond 404 à un lead inconnu ou mal formé, et 401 sans session", async () => {
    expect((await convert("00000000-0000-4000-8000-000000000000", {})).status).toBe(404);
    expect((await convert("pas-un-uuid", {})).status).toBe(404);
    const id = await createLead({ firstName: "Sans", lastName: "Session", origin: "autre" });
    expect((await postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, {}), byId(id))).status).toBe(401);
  });
});

describe("une conversion qui échoue en chemin ne laisse rien (CRM-95, D16, contrat 27)", () => {
  it("n'écrit ni l'entreprise créée, ni la personne, ni l'avancement quand la personne est refusée par la base après la création de l'entreprise", async () => {
    await rawSql().unsafe(`ALTER TABLE person ADD CONSTRAINT conversion_refus_test CHECK (first_name <> 'Refusée')`);
    try {
      const id = await createLead({ firstName: "Refusée", lastName: "Par la base", companyName: "Banque Échec", origin: "autre" });

      /* L'échec de la base remonte en exception jusqu'au gestionnaire de Next, qui répond 500. */
      const outcome = await convert(id, {}).then((res) => res.status, () => 500);
      expect(outcome).toBe(500);

      expect(await companyNames()).not.toContain("Banque Échec");
      expect(await readLead(id)).toMatchObject({ stage: "nouveau", convertedCompanyId: null });
    } finally {
      await rawSql().unsafe(`ALTER TABLE person DROP CONSTRAINT IF EXISTS conversion_refus_test`);
    }
  });
});
