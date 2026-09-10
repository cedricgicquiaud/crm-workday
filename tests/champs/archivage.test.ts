import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getList } from "@/app/api/objets/[type]/route";
import { auditLog, company, customFieldDefinition, savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { archiveDefinition, createDefinition } from "@/features/custom-fields/definitions";
import { customFieldKey, setCustomFields } from "@/features/custom-fields/fields-source";
import { fieldsOf, historyFieldsOf, sheetFieldsOf } from "@/features/objects/fields";
import { createObject, getObjectRecord, updateObject } from "@/features/objects/service";
import { createView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-archivage-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-ArchChamps-1", role: "administrateur" as const };
const TYPE = "company";

let cookie: string;
let actor: { id: string };
let effectifId: string;
let effectif: string;
let renseignee: string;
let vierge: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(customFieldDefinition);
  await db.delete(savedView);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ADMIN.email));
  actor = { id: (await createUserWithPassword(ADMIN)).id };
  cookie = await sessionCookie(ADMIN.email, ADMIN.password);
  effectifId = (await createDefinition({ objectType: TYPE, label: "Effectif", type: "number" }, actor)).id;
  effectif = customFieldKey(effectifId);
  renseignee = (await createObject(TYPE, { name: "Avec effectif", type: "client", [effectif]: 120 }, actor)).id;
  vierge = (await createObject(TYPE, { name: "Sans effectif", type: "client" }, actor)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Contrat 19 : archiver un champ ferme sa saisie et le retire des filtres, sans rien effacer. Ce
 * qui a été saisi reste lisible sur les fiches qui en portent une, et les vues déjà enregistrées
 * s'ouvrent encore — avec leur avertissement « filtre inactif ».
 */
describe("champ personnalisé archivé (CRM-56, contrat 19)", () => {
  it("laisse la valeur lisible en texte sur les fiches qui en ont une, et sort le champ des champs saisissables", async () => {
    const filtreDeVue = await createView({ objectType: TYPE, name: "Grosses structures", query: `f=${effectif}:plus_grand:100` }, actor);
    await archiveDefinition(effectifId);

    const record = await getObjectRecord(TYPE, renseignee);
    expect(record[effectif]).toBe("120");
    expect(fieldsOf(TYPE).map((field) => field.key)).not.toContain(effectif);

    /* La fiche qui porte une valeur montre le champ, en lecture seule ; celle qui n'en a pas ne le montre plus. */
    expect(sheetFieldsOf(TYPE, record).find((field) => field.key === effectif)).toMatchObject({ label: "Effectif", editable: false });
    expect(sheetFieldsOf(TYPE, await getObjectRecord(TYPE, vierge)).map((field) => field.key)).not.toContain(effectif);

    /* L'historique nomme toujours le libellé du champ, longtemps après son archivage. */
    expect(historyFieldsOf(TYPE).find((field) => field.key === effectif)?.label).toBe("Effectif");

    /* Le champ ne se saisit plus : une écriture sur lui ne change rien à la valeur enregistrée. */
    const untouched = await updateObject(TYPE, renseignee, { [effectif]: 999 }, actor);
    expect(untouched[effectif]).toBe("120");

    expect(filtreDeVue.id).toBeTruthy();
  });

  it("ouvre encore une vue épinglée qui filtrait sur ce champ, avec l'avertissement « filtre inactif »", async () => {
    const view = await createView({ objectType: TYPE, name: "Effectif connu", query: `f=${effectif}:plus_grand:100` }, actor);
    setCustomFields([]);
    const res = await getList(jsonRequest("GET", `/api/objets/${TYPE}?vue=${view.id}`, undefined, cookie), { params: Promise.resolve({ type: TYPE }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { records: { id: string }[]; inactive: { message: string }[] };
    expect(body.inactive).toHaveLength(1);
    expect(body.inactive[0].message).toContain("Filtre inactif");
    expect(body.inactive[0].message).toContain("Effectif");
    expect(body.records.map((record) => record.id).sort()).toEqual([renseignee, vierge].sort());
  });
});
