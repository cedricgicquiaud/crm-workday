import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getDuplicates } from "@/app/api/objets/[type]/doublons/route";
import { POST as postLead } from "@/app/api/leads/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, lead, person, personEmail, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { discardLead } from "@/features/leads/leads";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-email-lead@exemple.fr", firstName: "Sacha", lastName: "Perrin", password: "MotDePasse-Email-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

type Hint = { id: string; title: string; href?: string; message?: string };

const on = (type: string) => ({ params: Promise.resolve({ type }) });

async function hintsFor(query: string): Promise<Hint[]> {
  const res = await getDuplicates(jsonRequest("GET", `/api/objets/lead/doublons?${query}`, undefined, memberCookie), on("lead"));
  expect(res.status).toBe(200);
  return ((await res.json()) as { duplicates: Hint[] }).duplicates;
}

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

const email = (address: string) => `email=${encodeURIComponent(address)}&firstName=Julie&origin=linkedin`;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(lead);
  await db.delete(personEmail);
  await db.delete(person);
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

/** D8, contrat 9 : une adresse déjà connue est signalée, sans jamais bloquer la création. */
describe("email déjà connu à la saisie d'un lead (CRM-93, D8, contrat 9)", () => {
  it("nomme la personne dont c'est l'autre adresse, quelle qu'en soit la casse, et propose d'ouvrir sa fiche", async () => {
    const personId = await createPerson({ firstName: "Julie", lastName: "Martin", email: "julie@perso.fr", otherEmails: "julie.martin@banquex.fr" });
    expect(await hintsFor(email("Julie.Martin@BanqueX.fr"))).toEqual([
      { id: personId, title: "Julie Martin", href: `/personnes/${personId}`, message: "L'adresse julie.martin@banquex.fr est déjà portée par « Julie Martin » (personne)." },
    ]);
    /* Le lead se crée quand même. */
    await createLead({ firstName: "Julie", lastName: "Martin", email: "Julie.Martin@BanqueX.fr", origin: "linkedin" });
  });

  it("nomme une personne archivée qui porte l'adresse", async () => {
    const personId = await createPerson({ firstName: "Marc", lastName: "Rangé", email: "marc.range@acme.fr" });
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, personId));
    expect((await hintsFor(email("marc.range@acme.fr"))).map((hint) => hint.message)).toEqual(["L'adresse marc.range@acme.fr est déjà portée par « Marc Rangé » (personne, fiche archivée)."]);
  });

  it("nomme un lead en cours qui porte l'adresse, et pas un lead écarté", async () => {
    const inProgress = await createLead({ companyName: "Banque Ondine", email: "achats@banque-ondine.fr", origin: "partenaire" });
    expect(await hintsFor(email("ACHATS@banque-ondine.fr"))).toEqual([
      { id: inProgress, title: "Banque Ondine", href: `/leads/${inProgress}`, message: "L'adresse achats@banque-ondine.fr est déjà portée par « Banque Ondine » (lead)." },
    ]);

    const discarded = await createLead({ companyName: "Banque Écartée", email: "rh@banque-ecartee.fr", origin: "autre" });
    await discardLead(discarded, { id: memberId });
    expect(await hintsFor(email("rh@banque-ecartee.fr"))).toEqual([]);
  });

  it("ne rappelle pas le lead lui-même quand on saisit son adresse sur sa fiche", async () => {
    const id = await createLead({ firstName: "Nina", email: "nina@solo.fr", origin: "autre" });
    expect(await hintsFor(`id=${id}&email=nina%40solo.fr`)).toEqual([]);
  });

  it("reste muet sans adresse, avec une adresse mal formée, et ne signale aucun doublon sur deux leads homonymes", async () => {
    await createLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque X", origin: "linkedin" });
    expect(await hintsFor("firstName=Julie&lastName=Martin&companyName=Banque%20X&origin=linkedin")).toEqual([]);
    expect(await hintsFor(email("pas-une-adresse"))).toEqual([]);
  });
});
