import { eq } from "drizzle-orm";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getOpportunity, PATCH as patchOpportunity } from "@/app/api/opportunites/[id]/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { auditLog, company, opportunity, person, user } from "@/db/schema";
import { listFeed } from "@/features/activities/feed";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listForState } from "@/features/lists/apply-filters";
import { parseListState } from "@/features/lists/url-state";
import { fieldsOf } from "@/features/objects/fields";
import { cellText } from "@/features/objects/labels";
import { createObject, getObjectRecord, listObjectRecords, listRelationOptions } from "@/features/objects/service";
import { createPerson, updatePerson } from "@/features/persons/persons";
import { closeDb, db, rawSql } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-contact-opportunite@exemple.fr", firstName: "Hugo", lastName: "Lemaire", password: "MotDePasse-Contact-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;
let acmeId: string;

type Answer = { status: number; body: Record<string, unknown> & { fields?: Record<string, string>; message?: string } };

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function patch(id: string, input: Record<string, unknown>): Promise<Answer> {
  const res = await patchOpportunity(jsonRequest("PATCH", `/api/opportunites/${id}`, input, memberCookie), byId(id));
  return { status: res.status, body: (await res.json()) as Answer["body"] };
}

const getOpportunityRecord = (id: string) => getObjectRecord("opportunity", id);

const read = async (id: string) => (await getOpportunity(jsonRequest("GET", `/api/opportunites/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

async function opportunityAt(companyId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title: "Refonte Payroll", companyId, modules: ["payroll"], expectedClose: "2026-10-30", ...extra }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** Une personne portant un profil contact chez l'entreprise donnée. */
const contactAt = async (companyId: string, firstName: string, lastName: string) => (await createPerson({ firstName, lastName, companyId }, { id: memberId })).id;

/** Les enfants avant les parents : l'opportunité retient son contact et son entreprise, la personne son entreprise. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(opportunity);
  await db.delete(person);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(company);
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
  acmeId = (await createObject("company", { name: "Acme", type: "prospect" }, { id: memberId })).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.delete(company);
  await closeDb();
});

/** D35, contrat 35 : le contact d'une opportunité est un contact de son entreprise. */
describe("contact d'une opportunité (CRM-104, D35)", () => {
  it("désigne Julie Martin, contact de Banque X, comme contact d'une opportunité de Banque X", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId);

    expect((await patch(id, { contactPersonId: julie })).status).toBe(200);
    expect((await read(id)).contactPersonId).toBe(julie);
  });

  it("refuse sous le champ une personne sans profil contact, ou contact d'une autre entreprise, et garde le contact vide", async () => {
    const sansProfil = (await createPerson({ firstName: "Paul", lastName: "Sansprofil" }, { id: memberId })).id;
    const chezAcme = await contactAt(acmeId, "Marc", "Acme");
    const id = await opportunityAt(bankId);

    for (const contactPersonId of [sansProfil, chezAcme]) {
      const refusal = await patch(id, { contactPersonId });
      expect(refusal.status, contactPersonId).toBe(400);
      expect(Object.keys(refusal.body.fields ?? {}), contactPersonId).toEqual(["contactPersonId"]);
    }
    expect((await read(id)).contactPersonId).toBeNull();
  });

  it("juge le contact contre la nouvelle entreprise quand la même écriture change l'entreprise (contrat 41)", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const marc = await contactAt(acmeId, "Marc", "Acme");
    const id = await opportunityAt(bankId);

    const refusal = await patch(id, { companyId: acmeId, contactPersonId: julie });
    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.body.fields ?? {})).toEqual(["contactPersonId"]);
    expect(await read(id)).toMatchObject({ companyId: bankId, contactPersonId: null });

    expect((await patch(id, { companyId: acmeId, contactPersonId: marc })).status).toBe(200);
    expect(await read(id)).toMatchObject({ companyId: acmeId, contactPersonId: marc });
  });
  it("vide le contact quand l'entreprise change sans nouveau contact (contrat 35)", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId, { contactPersonId: julie });

    expect((await patch(id, { companyId: acmeId })).status).toBe(200);
    expect(await read(id)).toMatchObject({ companyId: acmeId, contactPersonId: null });
  });
  it("écrit une ligne d'historique par champ, avec le nom des fiches liées : l'entreprise et l'ancien contact (D35, contrat 35)", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId, { contactPersonId: julie });

    await patch(id, { companyId: acmeId });
    const changes = (await listFeed("opportunity", id, [])).items.filter((item) => item.kind === "changement" && item.text !== "Fiche créée").map((item) => item.text);
    expect(changes.sort()).toEqual(["Contact : Julie Martin → vide", "Entreprise : Banque X → Acme"]);
  });
});

/**
 * Attend qu'une écriture de l'opportunité bute sur le verrou de la ligne, plutôt qu'un délai fixe :
 * la course se joue alors dans le même ordre sur une machine lente comme sur une rapide.
 */
async function waitForBlockedWriter(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const blocked = await rawSql()`SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query ILIKE ${"%opportunity%"}`;
    if (blocked.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Aucune écriture n'a buté sur le verrou de l'opportunité.");
}

/**
 * Rejoue une course sur une même opportunité : l'écriture testée part et bute sur la ligne verrouillée,
 * l'écriture concurrente passe et s'engage, l'écriture testée n'aboutit qu'après elle. C'est l'ordre du
 * défaut : la fiche a changé entre la lecture de l'écriture testée et son écriture.
 */
async function raceOnRow<T>(id: string, tested: () => Promise<T>, concurrent: (sql: TransactionSql) => Promise<unknown>): Promise<T> {
  let pending!: Promise<T>;
  await rawSql().begin(async (sql) => {
    await sql`SELECT id FROM opportunity WHERE id = ${id} FOR UPDATE`;
    pending = tested();
    await waitForBlockedWriter();
    await concurrent(sql);
  });
  return pending;
}

/**
 * D35, contrat 35 : deux écritures simultanées sur la même opportunité. La condition du contact et le
 * vidage qu'elle entraîne se jugent sur la fiche relue sous verrou, dans la transaction de l'écriture ;
 * jugés sur la lecture d'avant, ils laisseraient l'opportunité chez Acme avec un contact de Banque X.
 */
describe("écriture concurrente sur l'entreprise et le contact (CRM-104, D35)", () => {
  it("refuse (400) Julie Martin, contact de Banque X, quand l'opportunité est passée chez Acme entre la lecture et l'écriture", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId);

    const refusal = await raceOnRow(
      id,
      () => patch(id, { contactPersonId: julie }),
      (sql) => sql`UPDATE opportunity SET company_id = ${acmeId} WHERE id = ${id}`,
    );

    expect(refusal.status).toBe(400);
    expect(Object.keys(refusal.body.fields ?? {})).toEqual(["contactPersonId"]);
    expect(await read(id)).toMatchObject({ companyId: acmeId, contactPersonId: null });
  });

  it("vide le contact posé entre-temps quand l'écriture déplace l'opportunité chez Acme", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId);

    const answer = await raceOnRow(
      id,
      () => patch(id, { companyId: acmeId }),
      (sql) => sql`UPDATE opportunity SET contact_person_id = ${julie} WHERE id = ${id}`,
    );

    expect(answer.status).toBe(200);
    expect(await read(id)).toMatchObject({ companyId: acmeId, contactPersonId: null });
  });
});

/** D35, contrat 35 : le sélecteur de contact ne propose que les contacts actifs de l'entreprise, borné, et dit le reste. */
describe("options du sélecteur de contact (CRM-104, D35, contrat 35)", () => {
  it("propose Julie Martin et Luc Petit, contacts de Banque X, sans le contact d'Acme, la personne sans profil ni le contact archivé ; au-delà de la borne, compte les autres", async () => {
    await contactAt(bankId, "Julie", "Martin");
    await contactAt(bankId, "Luc", "Petit");
    await contactAt(acmeId, "Marc", "Acme");
    await createPerson({ firstName: "Paul", lastName: "Sansprofil" }, { id: memberId });
    await archiveRecord("person", await contactAt(bankId, "Zoé", "Partie"), { id: memberId });
    const opportunity_ = await getOpportunityRecord(await opportunityAt(bankId));

    const all = await listRelationOptions("opportunity", "contactPersonId", opportunity_);
    expect(all.options.map((option) => option.name).sort()).toEqual(["Julie Martin", "Luc Petit"]);
    expect(all.more).toBe(0);

    const bounded = await listRelationOptions("opportunity", "contactPersonId", opportunity_, { limit: 1 });
    expect(bounded.options).toHaveLength(1);
    expect(bounded.more).toBe(1);
  });
});

/** D36, contrat 41 : un contact archivé ne se choisit plus ; celui qu'on a lié avant son archivage reste lié. */
describe("contact archivé (CRM-104, D36, contrat 41)", () => {
  it("refuse (409) un contact archivé à la création comme en modification, en le nommant", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    await archiveRecord("person", julie, { id: memberId });

    const creation = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title: "Refonte Payroll", companyId: bankId, modules: ["payroll"], expectedClose: "2026-10-30", contactPersonId: julie }, memberCookie));
    expect(creation.status).toBe(409);
    expect(((await creation.json()) as { message: string }).message).toContain("« Julie Martin »");

    const id = await opportunityAt(bankId);
    const modification = await patch(id, { contactPersonId: julie });
    expect(modification.status).toBe(409);
    expect(modification.body.message).toContain("« Julie Martin »");
  });

  it("garde lié un contact archivé après coup, même quand l'écriture le renvoie tel quel", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId, { contactPersonId: julie });
    await archiveRecord("person", julie, { id: memberId });

    expect((await patch(id, { title: "Refonte Payroll 2027", contactPersonId: julie })).status).toBe(200);
    expect(await read(id)).toMatchObject({ title: "Refonte Payroll 2027", contactPersonId: julie });
  });
});

/** D35, D36, contrat 41 : un lien fait reste lié quand la fiche liée change ensuite ; sa lecture le dit. */
describe("lecture d'une fiche liée qui a changé (CRM-104, D35, D36, contrat 41)", () => {
  it("garde lié un contact passé chez Acme, lu « Julie Martin (a quitté Banque X) »", async () => {
    const julie = await contactAt(bankId, "Julie", "Martin");
    const id = await opportunityAt(bankId, { contactPersonId: julie });
    await updatePerson(julie, { companyId: acmeId }, { id: memberId });

    expect(await read(id)).toMatchObject({ contactPersonId: julie, contactPersonIdLabel: "Julie Martin (a quitté Banque X)" });
  });

  it("garde liées une entreprise et un contact archivés après coup, marqués « archivée » et « archivé »", async () => {
    const other = (await createObject("company", { name: "Banque Fermée", type: "prospect" }, { id: memberId })).id;
    const julie = await contactAt(other, "Julie", "Martin");
    const id = await opportunityAt(other, { contactPersonId: julie });
    await archiveRecord("person", julie, { id: memberId });
    await archiveRecord("company", other, { id: memberId });

    expect(await read(id)).toMatchObject({ companyId: other, companyIdLabel: "Banque Fermée (archivée)", contactPersonId: julie, contactPersonIdLabel: "Julie Martin (archivée)" });
  });
});

/** D60 : dans la liste, une fiche liée se lit par son titre et se trie sur lui. */
describe("entreprise en colonne de liste (CRM-104, D60)", () => {
  it("écrit « Banque X » dans la cellule de l'entreprise, et trie Acme avant Banque X", async () => {
    const atBank = await opportunityAt(bankId);
    const atAcme = await opportunityAt(acmeId);
    const records = await listObjectRecords("opportunity");
    const companyField = fieldsOf("opportunity").find((field) => field.key === "companyId")!;

    expect(cellText(companyField, records.find((record) => record.id === atBank)!, [])).toBe("Banque X");
    const sorted = listForState("opportunity", records, parseListState("opportunity", new URLSearchParams("tri=companyId:asc")));
    expect(sorted.map((record) => record.id)).toEqual([atAcme, atBank]);
  });
});

