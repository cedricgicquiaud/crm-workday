import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { POST as postLead } from "@/app/api/leads/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, lead, objectRedirect, person, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { deleteRecord } from "@/features/archive/delete";
import { createUserWithPassword } from "@/features/auth/accounts";
import { linkedGroups } from "@/features/objects/links-column";
import { mergeRecords } from "@/features/merge/merge";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-issus-lead@exemple.fr", firstName: "Oda", lastName: "Varin", password: "MotDePasse-Issus-1", role: "membre" as const };

let memberCookie: string;
let memberId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

type Converted = { leadId: string; personId: string; companyId: string };

async function convertedLead(companyName: string): Promise<Converted> {
  const created = await postLead(jsonRequest("POST", "/api/leads", { firstName: "Julie", lastName: "Martin", companyName, origin: "linkedin" }, memberCookie));
  const { id } = (await created.json()) as { id: string };
  const res = await postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, {}, memberCookie), byId(id));
  expect(res.status).toBe(200);
  return (await res.json()) as Converted;
}

type Blocker = { label: string; count: number; titles?: string[] };
const blockersOf = async (type: string, id: string) => {
  const refusal = (await deleteRecord(type, id).then(() => null, (error: { status: number; details: { blockers: Blocker[] } }) => error))!;
  expect(refusal.status).toBe(409);
  return refusal.details.blockers;
};

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(objectRedirect);
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

describe("les fiches issues d'un lead (CRM-97, D18, D19, D21, contrats 15, 28, 29)", () => {
  it("montre sur le lead sa personne et son entreprise, et sur elles « Issu du lead Julie Martin · Banque X », même une fois le lead archivé, marqué archivé", async () => {
    const { leadId, personId, companyId } = await convertedLead("Banque Liens");

    const leadGroups = await linkedGroups("lead", leadId);
    expect(leadGroups.find((group) => group.label === "Personne")?.records.map((record) => record.id)).toEqual([personId]);
    expect(leadGroups.find((group) => group.label === "Entreprise")?.records.map((record) => record.id)).toEqual([companyId]);
    const origin = (type: string, id: string) => linkedGroups(type, id).then((groups) => groups.find((group) => group.label === "Issu du lead")?.records);
    expect(await origin("person", personId)).toMatchObject([{ id: leadId, title: "Julie Martin · Banque Liens", archived: false }]);
    expect(await origin("company", companyId)).toMatchObject([{ id: leadId, title: "Julie Martin · Banque Liens" }]);

    await archiveRecord("lead", leadId, { id: memberId });
    expect(await origin("person", personId)).toMatchObject([{ id: leadId, archived: true }]);
  });

  it("refuse (409) de supprimer la personne ou l'entreprise issue d'un lead archivé, en nommant ce lead", async () => {
    const { leadId, personId, companyId } = await convertedLead("Banque Retenue");
    await archiveRecord("lead", leadId, { id: memberId });

    expect((await blockersOf("person", personId)).find((blocker) => blocker.label === "Issu du lead")).toMatchObject({ count: 1, titles: ["Julie Martin · Banque Retenue"] });
    expect((await blockersOf("company", companyId)).find((blocker) => blocker.label === "Issu du lead")).toMatchObject({ count: 1, titles: ["Julie Martin · Banque Retenue"] });
  });

  it("fait suivre le lien « Issu du lead » vers la personne conservée quand on fusionne la personne issue du lead dans une autre", async () => {
    const { leadId, personId } = await convertedLead("Banque Fusion");
    const other = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Julie", lastName: "Martin", email: "julie.martin@conservee.fr" }, memberCookie));
    const { id: keptId } = (await other.json()) as { id: string };

    await mergeRecords("person", keptId, personId, []);

    expect((await linkedGroups("person", keptId)).find((group) => group.label === "Issu du lead")?.records.map((record) => record.id)).toEqual([leadId]);
  });
});
