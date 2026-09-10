import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, objectRedirect, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { mergeRecords } from "@/features/merge/merge";
import { createObject, getObjectRecord, redirectedId } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-redirection@exemple.fr", firstName: "Rémi", lastName: "Fabre", password: "MotDePasse-Redirection-1", role: "membre" as const };

const UNKNOWN = "11111111-1111-1111-1111-111111111111";

let memberId: string;

async function cleanup() {
  await db.delete(objectRedirect);
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

describe("adresse d'une fiche absorbée (CRM-59, contrat 29)", () => {
  it("mène à la fiche conservée, et la fiche conservée ne mène nulle part ailleurs", async () => {
    const kept = await newCompany("Acme");
    const absorbed = await newCompany("ACME SAS");
    await mergeRecords("company", kept.id, absorbed.id, []);

    expect(await redirectedId("company", absorbed.id)).toBe(kept.id);
    expect(await redirectedId("company", kept.id)).toBeNull();
    expect(await redirectedId("company", UNKNOWN)).toBeNull();
  });

  it("rend la fiche conservée à qui lit la fiche absorbée : une référence ancienne ne tombe pas sur un 404", async () => {
    const kept = await newCompany("Banque Solveige");
    const absorbed = await newCompany("Banque Solveige SA");
    await mergeRecords("company", kept.id, absorbed.id, []);

    expect((await getObjectRecord("company", absorbed.id)).id).toBe(kept.id);
  });

  it("suit deux fusions de suite : la première absorbée mène à la dernière fiche conservée", async () => {
    const premiere = await newCompany("Fonderie Bertin");
    const seconde = await newCompany("Fonderie Bertin SARL");
    const derniere = await newCompany("Société Fonderie Bertin");

    await mergeRecords("company", seconde.id, premiere.id, []);
    await mergeRecords("company", derniere.id, seconde.id, []);

    expect(await redirectedId("company", premiere.id)).toBe(derniere.id);
    expect(await redirectedId("company", seconde.id)).toBe(derniere.id);
  });
});
