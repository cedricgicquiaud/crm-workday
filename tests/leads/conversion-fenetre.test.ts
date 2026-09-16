import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postArchive } from "@/app/api/objets/[type]/[id]/archiver/route";
import { GET as getPreview, POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { POST as postLead } from "@/app/api/leads/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, lead, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-conversion-fenetre@exemple.fr", firstName: "Aya", lastName: "Mercier", password: "MotDePasse-Fenetre-1", role: "membre" as const };

let memberCookie: string;
let memberId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createLead(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createPerson(input: Record<string, unknown>): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

type Preview = {
  person: { kind: string; id?: string; firstName: string | null; lastName: string | null; contact?: { companyName: string } | null; differences?: string[] };
  company: { query: string; proposals: { id: string; name: string; type: string; archived: boolean }[]; more: number; sameNameAs: string | null };
  jobTitle: string | null;
};

const preview = (id: string, query = "") => getPreview(jsonRequest("GET", `/api/leads/${id}/conversion${query}`, undefined, memberCookie), byId(id));
const previewOf = async (id: string, query = "") => {
  const res = await preview(id, query);
  expect(res.status).toBe(200);
  return (await res.json()) as Preview;
};

async function cleanup() {
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

describe("aperçu de la conversion : la personne (CRM-95, D15, contrats 15, 19, 20)", () => {
  it("annonce une nouvelle personne pré-remplie avec le prénom, le nom et le poste du lead quand personne ne porte son email (contrat 15)", async () => {
    const id = await createLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque Aperçu", jobTitle: "DRH", email: "julie@banque-apercu.fr", origin: "linkedin" });

    const { person: announced, jobTitle } = await previewOf(id);

    expect(announced).toMatchObject({ kind: "new", firstName: "Julie", lastName: "Martin" });
    expect(jobTitle).toBe("DRH");
  });

  it("annonce la personne retrouvée par son autre adresse, avec son prénom et son nom, et dit ce qui sera rempli et ce que la fiche garde (contrat 19)", async () => {
    const claire = await createPerson({ firstName: "Claire", lastName: "Dumas", email: "claire@perso-apercu.fr", otherEmails: "claire@banque-apercu.fr", linkedin: "https://www.linkedin.com/in/claire" });
    const id = await createLead({ firstName: "Clara", companyName: "Banque Aperçu", email: "claire@banque-apercu.fr", phone: "01 02 03 04 05", linkedin: "https://www.linkedin.com/in/autre", origin: "linkedin" });

    const { person: announced } = await previewOf(id);

    expect(announced).toMatchObject({ kind: "found", id: claire, firstName: "Claire", lastName: "Dumas", contact: null });
    expect(announced.differences).toEqual(["Téléphone : sera rempli", "LinkedIn : la fiche garde le sien"]);
  });

  it("dit chez quelle entreprise la personne retrouvée est déjà contact, pour demander laquelle garder (contrat 20)", async () => {
    const acme = await createObject("company", { name: "Acme Aperçu", type: "client" }, { id: memberId });
    await createPerson({ firstName: "Yves", lastName: "Garnier", email: "yves@acme-apercu.fr", companyId: acme.id });
    const id = await createLead({ companyName: "Banque Aperçu", email: "yves@acme-apercu.fr", origin: "linkedin" });

    const { person: announced } = await previewOf(id);

    expect(announced.contact).toMatchObject({ companyName: "Acme Aperçu" });
  });

  it("propose pour « Banque Proche SA » le client « Banque Proche », avec son type, marque une entreprise archivée, suit la frappe et signale un nom identique (contrat 18)", async () => {
    const client = await createObject("company", { name: "Banque Proche", type: "client" }, { id: memberId });
    const closed = await createObject("company", { name: "Banque Proche Épargne", type: "prospect" }, { id: memberId });
    expect((await postArchive(jsonRequest("POST", `/api/objets/company/${closed.id}/archiver`, undefined, memberCookie), { params: Promise.resolve({ type: "company", id: closed.id }) })).status).toBe(200);
    await createObject("company", { name: "Assurances Lointaines", type: "client" }, { id: memberId });
    const id = await createLead({ firstName: "Léna", companyName: "Banque Proche SA", origin: "linkedin" });

    const typed = await previewOf(id);
    expect(typed.company.query).toBe("Banque Proche SA");
    expect(typed.company.proposals).toEqual([{ id: client.id, name: "Banque Proche", type: "client", archived: false }]);
    expect(typed.company.sameNameAs).toBeNull();

    const shorter = await previewOf(id, "?entreprise=banque%20proche");
    expect(shorter.company.proposals.map((proposal) => [proposal.name, proposal.archived])).toEqual(
      expect.arrayContaining([["Banque Proche", false], ["Banque Proche Épargne", true]]),
    );
    expect(shorter.company.proposals).toHaveLength(2);
    expect(shorter.company.sameNameAs).toBe("Banque Proche");
  });

  it("propose 20 entreprises au plus et compte les autres (« et N autres »)", async () => {
    for (let index = 1; index <= 23; index += 1) await createObject("company", { name: `Borne Groupe ${index}`, type: "prospect" }, { id: memberId });
    const id = await createLead({ firstName: "Borne", companyName: "Borne", origin: "autre" });

    const { company: proposed } = await previewOf(id);

    expect(proposed.proposals).toHaveLength(20);
    expect(proposed.more).toBe(3);
  });

  it("refuse (409) l'aperçu d'un lead converti et répond 404 à un lead inconnu", async () => {
    const id = await createLead({ firstName: "Déjà", lastName: "Converti", companyName: "Banque Déjà", origin: "autre" });
    expect((await postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, {}, memberCookie), byId(id))).status).toBe(200);

    expect((await preview(id)).status).toBe(409);
    expect((await preview("pas-un-uuid")).status).toBe(404);
  });
});
