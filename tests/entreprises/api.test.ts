import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getCompany, PATCH as patchCompany } from "@/app/api/entreprises/[id]/route";
import { GET as listCompanies, POST as postCompany } from "@/app/api/entreprises/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-entreprises@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Entreprises-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanup() {
  await db.delete(auditLog);
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

describe("API des entreprises — création (CRM-34, D1, D11)", () => {
  it("un membre crée une entreprise avec raison sociale et type (201), la relit par son identifiant : il en est le créateur et le responsable", async () => {
    const created = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "ACME SAS", type: "client" }, memberCookie));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const read = await getCompany(jsonRequest("GET", `/api/entreprises/${id}`, undefined, memberCookie), byId(id));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ id, name: "ACME SAS", type: "client", paymentTerms: "30_jours", country: "France", ownerId: memberId, createdBy: memberId, archivedAt: null });
  });
});

describe("API des entreprises — SIREN (CRM-34, contrat 4)", () => {
  it("accepte « 123 456 789 » et l'enregistre « 123456789 »", async () => {
    const created = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Siren Espaces", type: "prospect", siren: "123 456 789" }, memberCookie));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const read = await getCompany(jsonRequest("GET", `/api/entreprises/${id}`, undefined, memberCookie), byId(id));
    expect(await read.json()).toMatchObject({ siren: "123456789" });
  });
});

describe("API des entreprises — raison sociale (CRM-35, contrat 4)", () => {
  it("refuse (400) une raison sociale vide ou de 121 caractères, avec le message rattaché au champ, et n'enregistre rien", async () => {
    const before = (await db.select({ id: company.id }).from(company)).length;
    const empty = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "   ", type: "client" }, memberCookie));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: "donnees_invalides", fields: { name: "« Raison sociale » est obligatoire." } });

    const tooLong = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "a".repeat(121), type: "client" }, memberCookie));
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ fields: { name: "« Raison sociale » dépasse 120 caractères." } });

    const exact = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "b".repeat(120), type: "client" }, memberCookie));
    expect(exact.status).toBe(201);
    expect((await db.select({ id: company.id }).from(company)).length).toBe(before + 1);
  });
});

describe("API des entreprises — forme du SIREN (CRM-34, contrat 4)", () => {
  it("refuse (400) un SIREN de huit chiffres avec le message de la règle, sous le champ", async () => {
    const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Siren Court", type: "client", siren: "12345678" }, memberCookie));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "donnees_invalides", message: "Le SIREN doit contenir neuf chiffres.", fields: { siren: "Le SIREN doit contenir neuf chiffres." } });
  });
});

describe("API des entreprises — listes fermées (CRM-34, contrat 5)", () => {
  it("refuse (400) un type ou des conditions de paiement hors liste, par le serveur", async () => {
    const type = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Type Inconnu", type: "fournisseur" }, memberCookie));
    expect(type.status).toBe(400);
    expect(await type.json()).toMatchObject({ fields: { type: "Valeur hors liste pour « Type »." } });

    const terms = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Conditions Inconnues", type: "client", paymentTerms: "90_jours" }, memberCookie));
    expect(terms.status).toBe(400);
    expect(await terms.json()).toMatchObject({ fields: { paymentTerms: "Valeur hors liste pour « Conditions de paiement »." } });
  });
});

describe("API des entreprises — SIREN déjà porté (CRM-34, D19, contrat 4)", () => {
  it("refuse (409) un SIREN déjà porté par une autre entreprise, archivée comprise, et le message nomme cette entreprise", async () => {
    const first = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Première Titulaire", type: "client", siren: "552 081 317" }, memberCookie));
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };

    const active = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Seconde", type: "client", siren: "552081317" }, memberCookie));
    expect(active.status).toBe(409);
    expect(await active.json()).toMatchObject({ error: "valeur_deja_portee", message: "Le SIREN 552081317 est déjà porté par « Première Titulaire ».", field: "siren", existingId: id, existingName: "Première Titulaire", archived: false });

    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, id));
    const archived = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Seconde", type: "client", siren: "552081317" }, memberCookie));
    expect(archived.status).toBe(409);
    expect(await archived.json()).toMatchObject({ message: "Le SIREN 552081317 est déjà porté par « Première Titulaire » (fiche archivée).", archived: true });
  });
});

describe("API des entreprises — liste et modification (CRM-34, CRM-35, D6)", () => {
  it("liste les entreprises non archivées par dernière modification décroissante : une fiche modifiée remonte en tête", async () => {
    await cleanup();
    const ids: string[] = [];
    for (const name of ["Ancienne", "Moyenne", "Récente"]) {
      const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name, type: "client" }, memberCookie));
      ids.push(((await res.json()) as { id: string }).id);
    }
    const patched = await patchCompany(jsonRequest("PATCH", `/api/entreprises/${ids[0]}`, { paymentTerms: "60_jours" }, memberCookie), byId(ids[0]));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: ids[0], paymentTerms: "60_jours" });
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, ids[1]));

    const list = await listCompanies(jsonRequest("GET", "/api/entreprises", undefined, memberCookie));
    expect(list.status).toBe(200);
    const { companies } = (await list.json()) as { companies: { name: string }[] };
    expect(companies.map((c) => c.name)).toEqual(["Ancienne", "Récente"]);
  });
});

describe("API des entreprises — accès et inconnues (CRM-34, D24)", () => {
  it("répond 401 sans session sur la liste, la création et la modification, et 404 pour une entreprise inconnue", async () => {
    expect((await listCompanies(jsonRequest("GET", "/api/entreprises"))).status).toBe(401);
    expect((await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Anonyme", type: "client" }))).status).toBe(401);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await patchCompany(jsonRequest("PATCH", `/api/entreprises/${unknown}`, { type: "client" }), byId(unknown))).status).toBe(401);
    const missing = await getCompany(jsonRequest("GET", `/api/entreprises/${unknown}`, undefined, memberCookie), byId(unknown));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: "fiche_introuvable" });
    const patchMissing = await patchCompany(jsonRequest("PATCH", `/api/entreprises/${unknown}`, { type: "client" }, memberCookie), byId(unknown));
    expect(patchMissing.status).toBe(404);
  });
});
