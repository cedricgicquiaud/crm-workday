import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, customFieldDefinition, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, retireValue } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { fieldsOf, sheetFieldsOf } from "@/features/objects/fields";
import { displayValue } from "@/features/objects/labels";
import { createObject, getObjectRecord, updateObject } from "@/features/objects/service";
import { HttpError } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-retiree@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-Retiree-1", role: "administrateur" as const };
const TYPE = "company";

let actor: { id: string };
let segmentId: string;
let segment: string;
let recordId: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(customFieldDefinition);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
  segmentId = (await createDefinition({ objectType: TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME"] }, actor)).id;
  segment = customFieldKey(segmentId);
  recordId = (await createObject(TYPE, { name: "ACME", type: "client", [segment]: "PME" }, actor)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Décision produit : retirer une valeur d'une liste ne touche pas aux fiches qui la portent. La
 * valeur s'y lit encore, marquée « retirée », et personne ne peut la choisir de nouveau.
 */
describe("valeur retirée d'une liste (CRM-56)", () => {
  it("laisse la valeur lisible marquée « retirée » sur la fiche qui la porte, et ne la propose ni ne l'accepte plus", async () => {
    const definition = await retireValue(segmentId, "PME");
    expect(definition.values).toEqual(["Grand compte"]);
    expect(definition.retiredValues).toEqual(["PME"]);

    const record = await getObjectRecord(TYPE, recordId);
    expect(record[segment]).toBe("PME");

    const field = sheetFieldsOf(TYPE, record).find((candidate) => candidate.key === segment)!;
    expect(displayValue(field, "PME", [])).toBe("PME (retirée)");
    expect(field.values?.map((value) => value.value)).toEqual(["Grand compte"]);
    expect(displayValue(field, "Grand compte", [])).toBe("Grand compte");

    const refused = await updateObject(TYPE, recordId, { [segment]: "PME" }, actor).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpError);
    expect((refused as HttpError).status).toBe(400);
    expect((refused as HttpError).details.fields).toMatchObject({ [segment]: "Valeur hors liste pour « Segment »." });

    /* Le champ reste vivant : une valeur encore proposée s'enregistre. */
    expect((await updateObject(TYPE, recordId, { [segment]: "Grand compte" }, actor))[segment]).toBe("Grand compte");
    expect(fieldsOf(TYPE).map((candidate) => candidate.key)).toContain(segment);
  });
});
