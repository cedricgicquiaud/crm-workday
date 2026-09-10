import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, company, customFieldDefinition, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { createObject, updateObject } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-refus-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-Refus-1", role: "administrateur" as const };
const TYPE = "company";

let actor: { id: string };
let effectif: string;
let segment: string;
let ouverture: string;
let recordId: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(customFieldDefinition);
}

/** Le refus attendu, avec le message rattaché au champ fautif — c'est lui que la fiche affiche sous le champ. */
async function refusalOf(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.then(() => null).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
  effectif = customFieldKey((await createDefinition({ objectType: TYPE, label: "Effectif", type: "number" }, actor)).id);
  segment = customFieldKey((await createDefinition({ objectType: TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME"] }, actor)).id);
  ouverture = customFieldKey((await createDefinition({ objectType: TYPE, label: "Ouverture", type: "date" }, actor)).id);
  recordId = (await createObject(TYPE, { name: "ACME", type: "client" }, actor)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Contrat 21 : une saisie hors règle est refusée sous le champ, avec le message de la règle du
 * champ — les mêmes règles que celles des champs déclarés, appliquées par les mêmes descripteurs.
 */
describe("refus de saisie d'une valeur personnalisée (CRM-55, contrat 21)", () => {
  it("refuse « douze » dans un champ nombre, une date invalide et une valeur hors liste, en nommant le champ fautif", async () => {
    const cases: [string, unknown, string][] = [
      [effectif, "douze", "« Effectif » doit être un nombre."],
      [ouverture, "32/13/2026", "« Ouverture » doit être une date au format AAAA-MM-JJ."],
      [ouverture, "2026-02-30", "« Ouverture » doit être une date au format AAAA-MM-JJ."],
      [segment, "Inconnu", "Valeur hors liste pour « Segment »."],
    ];
    for (const [field, value, message] of cases) {
      const refusal = await refusalOf(updateObject(TYPE, recordId, { [field]: value }, actor));
      expect(refusal.status).toBe(400);
      expect(refusal.details.fields).toMatchObject({ [field]: message });
    }
  });
});
