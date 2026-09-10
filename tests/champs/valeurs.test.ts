import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, company, customFieldDefinition, user } from "@/db/schema";
import { listFeed } from "@/features/activities/feed";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { createObject, getObjectRecord, updateObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const ADMIN = { email: "admin-valeurs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-Valeurs-1", role: "administrateur" as const };
const TYPE = "company";

let actor: { id: string };
let effectif: string;
let segment: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(customFieldDefinition);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
  effectif = customFieldKey((await createDefinition({ objectType: TYPE, label: "Effectif", type: "number" }, actor)).id);
  segment = customFieldKey((await createDefinition({ objectType: TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME"] }, actor)).id);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Contrat 17 : les champs définis par un administrateur se saisissent sur toute fiche de leur
 * objet, par le service générique, et leurs changements entrent dans l'historique sous leur libellé.
 */
describe("valeurs personnalisées sur la fiche (CRM-55, contrat 17)", () => {
  it("enregistre une valeur personnalisée sur une fiche, la relit et inscrit le changement dans l'historique sous le libellé du champ", async () => {
    const record = await createObject(TYPE, { name: "ACME", type: "client" }, actor);
    expect(record[effectif]).toBeNull();

    const updated = await updateObject(TYPE, record.id, { [effectif]: 120, [segment]: "PME" }, actor);
    expect(updated[effectif]).toBe("120");
    expect(updated[segment]).toBe("PME");

    const reread = await getObjectRecord(TYPE, record.id);
    expect(reread[effectif]).toBe("120");
    expect(reread[segment]).toBe("PME");

    const entries = await db.select().from(auditLog).where(eq(auditLog.objectId, record.id));
    expect(entries.filter((entry) => entry.action === "modifiee").map((entry) => ({ field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue }))).toEqual(
      expect.arrayContaining([
        { field: effectif, oldValue: null, newValue: "120" },
        { field: segment, oldValue: null, newValue: "PME" },
      ]),
    );

    /* Le fil nomme le libellé du champ, jamais sa clé enregistrée. */
    const feed = await listFeed(TYPE, record.id, []);
    expect(feed.items.map((item) => item.text)).toEqual(expect.arrayContaining(["Effectif : vide → 120", "Segment : vide → PME"]));
  });

  it("n'écrit rien et ne rejoue pas l'historique quand la valeur personnalisée ne change pas", async () => {
    const record = await createObject(TYPE, { name: "Stable", type: "client" }, actor);
    expect((await updateObject(TYPE, record.id, { [effectif]: 7 }, actor))[effectif]).toBe("7");
    const before = await db.select().from(auditLog).where(eq(auditLog.objectId, record.id));
    await updateObject(TYPE, record.id, { [effectif]: 7 }, actor);
    const after = await db.select().from(auditLog).where(eq(auditLog.objectId, record.id));
    expect(after).toHaveLength(before.length);
  });
});
