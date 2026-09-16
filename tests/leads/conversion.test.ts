import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { GET as getLead, PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { GET as getProfile } from "@/app/api/personnes/[id]/profil-contact/route";
import { GET as getPerson } from "@/app/api/personnes/[id]/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { POST as postConsultant } from "@/app/api/consultants/route";
import { createDefinition, loadCustomFields, updateDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { linkedGroups } from "@/features/objects/links-column";
import { GET as getCompany } from "@/app/api/entreprises/[id]/route";
import { activity, auditLog, company, customFieldDefinition, customFieldValue, lead, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { duplicatesOfRecord } from "@/features/duplicates/duplicates";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-conversion@exemple.fr", firstName: "Maëlle", lastName: "Riou", password: "MotDePasse-Conversion-1", role: "membre" as const };
const OWNER = { email: "responsable-conversion@exemple.fr", firstName: "Hugo", lastName: "Perrin", password: "MotDePasse-Conversion-2", role: "membre" as const };

let memberCookie: string;
let ownerId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createLead(input: Record<string, unknown>): Promise<string> {
  const res = await postLead(jsonRequest("POST", "/api/leads", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const setStage = async (id: string, stage: string) => expect((await patchLead(jsonRequest("PATCH", `/api/leads/${id}`, { stage }, memberCookie), byId(id))).status).toBe(200);
const convert = (id: string, body: Record<string, unknown>) => postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, body, memberCookie), byId(id));
const read = async (route: typeof getLead, path: string, id: string) => (await route(jsonRequest("GET", `${path}/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;
const readLead = (id: string) => read(getLead, "/api/leads", id);
const readPerson = (id: string) => read(getPerson, "/api/personnes", id);
const readCompany = (id: string) => read(getCompany, "/api/entreprises", id);
const readProfile = async (id: string) => (await getProfile(jsonRequest("GET", `/api/personnes/${id}/profil-contact`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown> | null>;

async function cleanup() {
  await db.delete(activity);
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await db.delete(auditLog);
  await db.delete(lead);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await db.delete(user).where(eq(user.email, OWNER.email));
  await createUserWithPassword(MEMBER);
  ownerId = (await createUserWithPassword(OWNER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("convertir un lead en nouvelle personne et nouvelle entreprise (CRM-95, D16, contrat 15)", () => {
  it("crée la personne et l'entreprise prospect au responsable du lead, avec un profil contact, et passe le lead « converti » avec l'entrée « Converti en Julie Martin · Banque X »", async () => {
    const id = await createLead({
      firstName: "Julie",
      lastName: "Martin",
      companyName: "Banque X",
      jobTitle: "Directrice SIRH",
      email: "julie.martin@banque-x.fr",
      phone: "06 12 34 56 78",
      linkedin: "https://www.linkedin.com/in/julie-martin",
      origin: "linkedin",
      ownerId,
    });
    await setStage(id, "qualifie");

    const res = await convert(id, { firstName: "Julie", lastName: "Martin", companyName: "Banque X", jobTitle: "Directrice SIRH" });
    expect(res.status).toBe(200);
    const { personId, companyId } = (await res.json()) as { personId: string; companyId: string };

    expect(await readPerson(personId)).toMatchObject({ firstName: "Julie", lastName: "Martin", email: "julie.martin@banque-x.fr", phone: "06 12 34 56 78", linkedin: "https://www.linkedin.com/in/julie-martin", ownerId, profiles: ["contact"], companyId });
    expect(await readProfile(personId)).toMatchObject({ companyName: "Banque X", jobTitle: "Directrice SIRH", decisionRole: "non_precise" });
    expect(await readCompany(companyId)).toMatchObject({ name: "Banque X", type: "prospect", ownerId });

    expect(await readLead(id)).toMatchObject({ stage: "converti", convertedPersonId: personId, convertedCompanyId: companyId });
    expect((await readLead(id)).convertedAt).not.toBeNull();
    const conversion = (await listHistory("lead", id)).find((entry) => entry.action === "conversion");
    expect(conversion?.newValue).toBe("Julie Martin · Banque X");
  });

  it("convertit de la même façon un lead « Nouveau » et un lead « Contacté » (contrat 16)", async () => {
    const fresh = await createLead({ firstName: "Nina", lastName: "Morel", companyName: "Assur Nord", origin: "partenaire" });
    const contacted = await createLead({ firstName: "Paul", lastName: "Leroy", companyName: "Assur Sud", origin: "autre" });
    await setStage(contacted, "contacte");

    expect((await convert(fresh, {})).status).toBe(200);
    expect((await convert(contacted, {})).status).toBe(200);
    expect(await readLead(fresh)).toMatchObject({ stage: "converti" });
    expect(await readLead(contacted)).toMatchObject({ stage: "converti" });
  });

  it("convertit un lead sans prénom ni nom après leur saisie dans la fenêtre, et les écrit sur la personne et sur le lead (contrat 17)", async () => {
    const id = await createLead({ companyName: "Banque Z", origin: "appel_d_offres" });

    const res = await convert(id, { firstName: "Sarah", lastName: "Klein" });
    expect(res.status).toBe(200);
    const { personId } = (await res.json()) as { personId: string };

    expect(await readPerson(personId)).toMatchObject({ firstName: "Sarah", lastName: "Klein" });
    expect(await readLead(id)).toMatchObject({ firstName: "Sarah", lastName: "Klein", title: "Sarah Klein · Banque Z" });
    const completed = (await listHistory("lead", id)).filter((entry) => entry.action === "modifiee").map((entry) => [entry.field, entry.oldValue, entry.newValue]);
    expect(completed).toEqual(expect.arrayContaining([["firstName", null, "Sarah"], ["lastName", null, "Klein"]]));
  });
});

describe("convertir un lead vers une personne retrouvée par son email (CRM-95, D15, D16, contrat 19)", () => {
  it("retrouve la personne par son autre adresse, remplit son téléphone vide sans toucher à son LinkedIn ni à son responsable, lui ajoute un profil contact et historise le téléphone", async () => {
    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Claire", lastName: "Dumas", email: "claire@perso.fr", otherEmails: "claire.dumas@banque-w.fr", linkedin: "https://www.linkedin.com/in/claire-dumas" }, memberCookie));
    expect(created.status).toBe(201);
    const { id: claireId } = (await created.json()) as { id: string };
    const claireOwner = (await readPerson(claireId)).ownerId;
    expect(claireOwner).not.toBe(ownerId);
    const id = await createLead({ companyName: "Banque W", email: "Claire.Dumas@banque-w.fr", phone: "01 23 45 67 89", linkedin: "https://www.linkedin.com/in/autre-claire", origin: "linkedin", ownerId });

    const res = await convert(id, { companyName: "Banque W" });
    expect(res.status).toBe(200);
    const { personId } = (await res.json()) as { personId: string };

    expect(personId).toBe(claireId);
    expect(await readPerson(claireId)).toMatchObject({ firstName: "Claire", lastName: "Dumas", phone: "01 23 45 67 89", linkedin: "https://www.linkedin.com/in/claire-dumas", ownerId: claireOwner, profiles: ["contact"] });
    expect(await readProfile(claireId)).toMatchObject({ companyName: "Banque W" });
    const phone = (await listHistory("person", claireId)).find((entry) => entry.field === "phone");
    expect([phone?.oldValue, phone?.newValue]).toEqual([null, "01 23 45 67 89"]);
    expect((await listHistory("lead", id)).find((entry) => entry.action === "conversion")?.newValue).toBe("Claire Dumas · Banque W");
  });
});

describe("convertir un lead dont la personne est déjà contact ailleurs (CRM-95, D15, contrat 20)", () => {
  async function contactAtAcme(email: string): Promise<{ personId: string; acmeId: string }> {
    const acme = await createObject("company", { name: `Acme ${email}`, type: "client" }, { id: ownerId });
    const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Yves", lastName: "Garnier", email, companyId: acme.id, jobTitle: "Acheteur IT" }, memberCookie));
    expect(res.status).toBe(201);
    return { personId: ((await res.json()) as { id: string }).id, acmeId: acme.id };
  }

  it("garder « Acme » laisse le profil et son poste inchangés, lie le lead à Acme et ne crée pas « Banque X »", async () => {
    const { personId, acmeId } = await contactAtAcme("yves.garnier@acme.fr");
    const id = await createLead({ firstName: "Yves", lastName: "Garnier", companyName: "Banque Garde", jobTitle: "DSI", email: "yves.garnier@acme.fr", origin: "recommandation" });

    const res = await convert(id, { companyName: "Banque Garde", keepCompany: true });
    expect(res.status).toBe(200);

    expect(await res.json()).toMatchObject({ personId, companyId: acmeId });
    expect(await readProfile(personId)).toMatchObject({ companyId: acmeId, jobTitle: "Acheteur IT" });
    expect((await db.select({ name: company.name }).from(company)).map((row) => row.name)).not.toContain("Banque Garde");
    expect(await readLead(id)).toMatchObject({ convertedCompanyId: acmeId, companyName: "Banque Garde" });
  });

  it("choisir « Banque X » fait passer le profil contact chez elle, et l'historique de la personne garde « Acme »", async () => {
    const { personId, acmeId } = await contactAtAcme("yves.garnier@acme-bis.fr");
    const id = await createLead({ firstName: "Yves", lastName: "Garnier", companyName: "Banque Passage", email: "yves.garnier@acme-bis.fr", origin: "recommandation" });

    const res = await convert(id, { companyName: "Banque Passage", keepCompany: false });
    expect(res.status).toBe(200);
    const { companyId } = (await res.json()) as { companyId: string };

    expect(companyId).not.toBe(acmeId);
    expect(await readProfile(personId)).toMatchObject({ companyId, companyName: "Banque Passage" });
    const moved = (await listHistory("person", personId)).find((entry) => entry.field === "companyId" && entry.newValue === "Banque Passage");
    expect(moved?.oldValue).toBe(`Acme yves.garnier@acme-bis.fr`);
  });

  it("refuse (400) de convertir sans dire quelle entreprise garder", async () => {
    await contactAtAcme("yves.garnier@acme-ter.fr");
    const id = await createLead({ firstName: "Yves", lastName: "Garnier", companyName: "Banque Choix", email: "yves.garnier@acme-ter.fr", origin: "recommandation" });

    const res = await convert(id, { companyName: "Banque Choix" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ fields: { keepCompany: expect.stringContaining("Acme yves.garnier@acme-ter.fr") } });
    expect(await readLead(id)).toMatchObject({ stage: "nouveau" });
  });
});

describe("convertir un lead vers un consultant, sans email, avec des champs personnalisés (CRM-95, D16, contrats 21 à 23)", () => {
  it("donne un profil contact à une personne qui n'était que consultant : « Contact, Consultant », section consultant inchangée, et elle figure parmi les contacts de l'entreprise (contrat 21)", async () => {
    const created = await postConsultant(jsonRequest("POST", "/api/consultants", { firstName: "Rémi", lastName: "Carré", email: "remi.carre@free.fr", status: "freelance", dailyCost: 650 }, memberCookie));
    expect(created.status).toBe(201);
    const { id: remiId } = (await created.json()) as { id: string };
    const id = await createLead({ companyName: "Banque Consult", email: "remi.carre@free.fr", origin: "partenaire" });

    const res = await convert(id, { companyName: "Banque Consult" });
    expect(res.status).toBe(200);
    const { companyId } = (await res.json()) as { companyId: string };

    expect(await readPerson(remiId)).toMatchObject({ profiles: ["contact", "consultant"], status: "freelance", dailyCost: 650 });
    const contacts = (await linkedGroups("company", companyId)).find((group) => group.label === "Contacts");
    expect(contacts?.records.map((record) => record.id)).toEqual([remiId]);
  });

  it("crée une nouvelle personne pour un lead sans email au nom d'une personne existante, que le signal « doublon probable » rapproche (contrat 22)", async () => {
    const existing = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Anne", lastName: "Lefèvre" }, memberCookie));
    const { id: anneId } = (await existing.json()) as { id: string };
    const id = await createLead({ firstName: "Anne", lastName: "Lefèvre", companyName: "Banque Homonyme", origin: "autre" });

    const res = await convert(id, {});
    expect(res.status).toBe(200);
    const { personId } = (await res.json()) as { personId: string };

    expect(personId).not.toBe(anneId);
    expect((await duplicatesOfRecord("person", personId)).map((duplicate) => duplicate.id)).toEqual([anneId]);
  });

  it("ne recopie pas les champs personnalisés du lead, et un champ personnalisé obligatoire des personnes n'empêche pas la conversion et reste vide (contrat 23)", async () => {
    const leadField = await createDefinition({ objectType: "lead", label: "Source précise", type: "text" }, { id: ownerId });
    const personField = await createDefinition({ objectType: "person", label: "Matricule", type: "text" }, { id: ownerId });
    await updateDefinition(personField.id, { required: true });
    await loadCustomFields();
    const id = await createLead({ firstName: "Iris", lastName: "Noël", companyName: "Banque Perso", origin: "autre", [customFieldKey(leadField.id)]: "Salon RH" });

    const res = await convert(id, {});
    expect(res.status).toBe(200);
    const { personId, companyId } = (await res.json()) as { personId: string; companyId: string };

    const personRead = await readPerson(personId);
    expect(personRead[customFieldKey(personField.id)] ?? null).toBeNull();
    expect(Object.values(personRead)).not.toContain("Salon RH");
    expect(Object.values(await readCompany(companyId))).not.toContain("Salon RH");
  });
});

describe("convertir un lead vers une entreprise existante (CRM-95, D15, contrat 18)", () => {
  it("rattache le contact au client choisi, qui reste client, sans créer d'entreprise, et le lead garde « Banque X SA » écrit", async () => {
    const client = await createObject("company", { name: "Banque X", type: "client" }, { id: ownerId });
    const id = await createLead({ firstName: "Léna", lastName: "Faure", companyName: "Banque X SA", origin: "linkedin" });
    const companiesBefore = (await db.select({ id: company.id }).from(company)).length;

    const res = await convert(id, { companyId: client.id });
    expect(res.status).toBe(200);
    const { personId, companyId } = (await res.json()) as { personId: string; companyId: string };

    expect(companyId).toBe(client.id);
    expect(await readCompany(client.id)).toMatchObject({ type: "client" });
    expect((await db.select({ id: company.id }).from(company)).length).toBe(companiesBefore);
    expect(await readProfile(personId)).toMatchObject({ companyId: client.id, companyName: "Banque X" });
    expect(await readLead(id)).toMatchObject({ companyName: "Banque X SA", convertedCompanyId: client.id });
  });

  it("crée une nouvelle « Banque Y » à côté du client homonyme quand on le choisit, et les deux fiches portent le signal « doublon probable »", async () => {
    const client = await createObject("company", { name: "Banque Y", type: "client" }, { id: ownerId });
    const id = await createLead({ firstName: "Marc", lastName: "Blanc", companyName: "Banque Y", origin: "linkedin" });

    const res = await convert(id, { companyName: "Banque Y" });
    expect(res.status).toBe(200);
    const { companyId } = (await res.json()) as { companyId: string };

    expect(companyId).not.toBe(client.id);
    expect((await duplicatesOfRecord("company", companyId)).map((duplicate) => duplicate.id)).toEqual([client.id]);
    expect((await duplicatesOfRecord("company", client.id)).map((duplicate) => duplicate.id)).toEqual([companyId]);
  });
});
