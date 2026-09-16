import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postConsultant } from "@/app/api/consultants/route";
import { GET as getPerson } from "@/app/api/personnes/[id]/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { prepareConsultantCreation, writeConsultantCreation } from "@/features/consultants/consultants";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-creation-consultant@exemple.fr", firstName: "Tao", lastName: "Riviere", password: "MotDePasse-Creation-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const create = (input: Record<string, unknown>) => postConsultant(jsonRequest("POST", "/api/consultants", input, memberCookie));
const readPerson = async (id: string) => (await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id))).json();
const countPersons = async () => (await db.select({ id: person.id }).from(person)).length;

async function cleanup() {
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(auditLog);
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

/**
 * D12 : créer un consultant est un seul geste. La personne et son profil naissent ensemble ou pas du
 * tout — une personne sans profil créée par un « Nouveau consultant » refusé serait un déchet que
 * personne ne saurait rattraper.
 */
describe("création d'un consultant (CRM-84, D12)", () => {
  it("crée la personne et son profil en un appel, et rend l'identifiant de la fiche à ouvrir", async () => {
    const created = await create({ firstName: "Chloé", lastName: "Dupont", email: "Chloe.Dupont@Acme.fr", status: "freelance", dailyCost: 650 });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    expect(await readPerson(id)).toMatchObject({
      firstName: "Chloé",
      lastName: "Dupont",
      /* L'adresse est normalisée comme à la création d'une personne (feature 2). */
      email: "chloe.dupont@acme.fr",
      profiles: ["consultant"],
      status: "freelance",
      dailyCost: 650,
      ownerId: memberId,
    });
  });

  it("n'écrit ni la personne ni le profil quand l'écriture échoue en chemin : les deux ou rien", async () => {
    const doomed = (await createObject("company", { name: "Éphémère Conseil", type: "societe_de_consultant" }, { id: memberId })).id;
    /* La société disparaît entre la validation et l'écriture : le rattachement échoue après l'insertion de la personne.
       Elle ne passe pas par l'entrée du dialogue, qui ne déclare pas ce champ : elle se pose sur les valeurs validées. */
    const prepared = await prepareConsultantCreation({ firstName: "Tout", lastName: "Ourien", status: "freelance" });
    prepared.profile.values.billingCompanyId = doomed;
    await db.delete(company).where(eq(company.id, doomed));
    const before = await countPersons();

    await expect(writeConsultantCreation(prepared, { id: memberId })).rejects.toThrow();

    expect(await countPersons()).toBe(before);
    expect(await db.select({ id: consultantProfile.id }).from(consultantProfile)).toHaveLength(1);
  });

  it("refuse (409) une adresse déjà portée, nomme la personne qui la porte, et ne crée ni personne ni profil", async () => {
    const existing = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Jean", lastName: "Dupont", email: "jean.dupont@acme.fr" }, memberCookie));
    expect(existing.status).toBe(201);
    const before = await countPersons();

    const refused = await create({ firstName: "Jean", lastName: "Dupont", email: "Jean.Dupont@Acme.fr", status: "salarie" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "valeur_deja_portee", message: "L'adresse jean.dupont@acme.fr est déjà portée par « Jean Dupont »." });
    expect(await countPersons()).toBe(before);
  });

  it("refuse (400) par champ une création sans statut, et n'écrit rien", async () => {
    const before = await countPersons();
    const refused = await create({ firstName: "Sans", lastName: "Statut", dailyCost: 500 });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ fields: { status: "« Statut » est obligatoire." } });
    expect(await countPersons()).toBe(before);
  });

  it("refuse (400) par champ un coût hors règle et un prénom vide, sans rien écrire", async () => {
    const before = await countPersons();
    expect(await (await create({ firstName: "Trop", lastName: "Cher", status: "freelance", dailyCost: 10_001 })).json()).toMatchObject({
      fields: { dailyCost: "« Coût journalier » doit être compris entre 0 et 10 000." },
    });
    expect(await (await create({ firstName: "", lastName: "Vide", status: "freelance" })).json()).toMatchObject({ fields: { firstName: "« Prénom » est obligatoire." } });
    expect(await countPersons()).toBe(before);
  });

  /*
   * Le dialogue « Nouveau consultant » déclare cinq champs (D12) : prénom, nom, email, statut, coût.
   * Une clé de plus n'a pas de place où aller — elle était jusqu'ici passée à la personne, qui
   * l'ignorait : « jobTitle » répondait 201 sans que le poste soit enregistré nulle part.
   */
  it("refuse (400) par champ une clé que le dialogue ne déclare pas, et n'écrit rien", async () => {
    const before = await countPersons();

    const withJobTitle = await create({ firstName: "Chef", lastName: "Information", status: "salarie", jobTitle: "DSI" });
    expect(withJobTitle.status).toBe(400);
    expect(await withJobTitle.json()).toMatchObject({ fields: { jobTitle: "« Poste » ne se saisit pas à la création d'un consultant : il se règle sur sa fiche." } });

    const withOtherEmails = await create({ firstName: "Autres", lastName: "Adresses", status: "salarie", otherEmails: "autre@exemple.fr" });
    expect(withOtherEmails.status).toBe(400);
    expect(await withOtherEmails.json()).toMatchObject({ fields: { otherEmails: "« Autres emails » ne se saisit pas à la création d'un consultant : il se règle sur sa fiche." } });

    /* Une clé du profil qui n'est pas au dialogue est refusée comme les autres : elle se règle sur la fiche. */
    const withLanguages = await create({ firstName: "Poly", lastName: "Glotte", status: "salarie", languages: "français" });
    expect(withLanguages.status).toBe(400);
    expect(await withLanguages.json()).toMatchObject({ fields: { languages: "« Langues » ne se saisit pas à la création d'un consultant : il se règle sur sa fiche." } });

    expect(await countPersons()).toBe(before);
  });

  it("refuse (401) une création sans session", async () => {
    expect((await postConsultant(jsonRequest("POST", "/api/consultants", { firstName: "Ano", lastName: "Nyme", status: "salarie" }))).status).toBe(401);
  });
});
