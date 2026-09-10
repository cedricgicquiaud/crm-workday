import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, person, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { duplicatesOfRecord, duplicatesOfValues } from "@/features/duplicates/duplicates";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-doublons@exemple.fr", firstName: "Iris", lastName: "Naudin", password: "MotDePasse-Doublons-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: memberId });

describe("doublons probables d'une fiche (CRM-58, CRM-60, contrat 28)", () => {
  it("nomme l'autre fiche de même clé, des deux côtés, sans jamais se compter elle-même", async () => {
    const acme = await newCompany("Acme");
    const acmeSas = await newCompany("ACME SAS");

    expect(await duplicatesOfRecord("company", acme.id)).toEqual([{ id: acmeSas.id, title: "ACME SAS" }]);
    expect(await duplicatesOfRecord("company", acmeSas.id)).toEqual([{ id: acme.id, title: "Acme" }]);
  });

  it("ne signale rien pour une fiche dont le nom ne se réduit à celui d'aucune autre", async () => {
    const conseil = await newCompany("Acmé Conseil");
    expect(await duplicatesOfRecord("company", conseil.id)).toEqual([]);
  });

  it("laisse de côté les fiches archivées : une fiche rangée ne se signale plus (D21)", async () => {
    const vivante = await newCompany("Fonderie Bertin");
    const rangee = await newCompany("Fonderie Bertin SARL");
    expect(await duplicatesOfRecord("company", vivante.id)).toEqual([{ id: rangee.id, title: "Fonderie Bertin SARL" }]);

    await archiveRecord("company", rangee.id, { id: memberId });
    expect(await duplicatesOfRecord("company", vivante.id)).toEqual([]);
    expect(await duplicatesOfRecord("company", rangee.id)).toEqual([]);
  });
});

describe("doublons probables d'un nom candidat (CRM-58, contrat 28)", () => {
  it("nomme les fiches existantes que le nom saisi rejoindrait, avant qu'aucune fiche n'existe", async () => {
    const solveige = await newCompany("Banque Solveige");

    expect(await duplicatesOfValues("company", { name: "Société Banque Solveige" })).toEqual([{ id: solveige.id, title: "Banque Solveige" }]);
    expect(await duplicatesOfValues("company", { name: "Banque Solveige Conseil" })).toEqual([]);
    expect(await duplicatesOfValues("company", { name: "  " })).toEqual([]);
  });

  it("rapproche deux personnes de même prénom et nom", async () => {
    const created = await createObject("person", { firstName: "Jean-Pierre", lastName: "Léger" }, { id: memberId });
    expect(await duplicatesOfValues("person", { firstName: "jean pierre", lastName: "leger" })).toEqual([{ id: created.id, title: "Jean-Pierre Léger" }]);
    expect(await duplicatesOfValues("person", { firstName: "Jean", lastName: "Léger" })).toEqual([]);
  });
});
