import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, customFieldDefinition, customFieldValue, user } from "@/db/schema";
import { deleteRecord } from "@/features/archive/delete";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-suppression-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-SuppChamps-1", role: "administrateur" as const };
const TYPE = "company";

let actor: { id: string };
let effectif: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(customFieldDefinition);
}

/** Valeurs personnalisées encore enregistrées pour une fiche, quelle que soit leur définition. */
async function valuesOf(id: string): Promise<string[]> {
  const rows = await db
    .select({ value: customFieldValue.value })
    .from(customFieldValue)
    .where(and(eq(customFieldValue.objectType, TYPE), eq(customFieldValue.objectId, id)));
  return rows.map((row) => row.value);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
  effectif = customFieldKey((await createDefinition({ objectType: TYPE, label: "Effectif", type: "number" }, actor)).id);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Contrat 31 : une fiche supprimée définitivement n'apparaît plus nulle part. `custom_field_value`
 * ne porte aucune clé étrangère vers la fiche — aucune table ne les porte toutes — donc rien ne la
 * nettoie tout seul : ses valeurs resteraient orphelines et reviendraient sur la fiche suivante qui
 * hériterait de l'identifiant.
 */
describe("suppression définitive d'une fiche qui porte des valeurs personnalisées (CRM-55, contrat 31)", () => {
  it("emporte les valeurs personnalisées de la fiche, et seulement les siennes", async () => {
    const supprimee = await createObject(TYPE, { name: "Éphémère", type: "client", [effectif]: 12 }, actor);
    const gardee = await createObject(TYPE, { name: "Gardée", type: "client", [effectif]: 34 }, actor);
    expect(await valuesOf(supprimee.id)).toEqual(["12"]);

    await deleteRecord(TYPE, supprimee.id);

    expect(await valuesOf(supprimee.id)).toEqual([]);
    expect(await valuesOf(gardee.id)).toEqual(["34"]);
  });
});
