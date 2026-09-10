import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getFields, POST as postField } from "@/app/api/champs/route";
import { PATCH as patchField } from "@/app/api/champs/[id]/route";
import { customFieldDefinition, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import type { CustomFieldDefinition } from "@/features/custom-fields/fields-source";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-api-champs@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-ApiChamps-1", role: "administrateur" as const };
const MEMBER = { email: "membre-api-champs@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-ApiChamps-2", role: "membre" as const };
const TYPE = "company";

let adminCookie: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await db.delete(customFieldDefinition);
  await db.delete(user).where(inArray(user.email, [ADMIN.email, MEMBER.email]));
  await createUserWithPassword(ADMIN);
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await db.delete(customFieldDefinition);
  await closeDb();
});

/**
 * API des champs personnalisés (CRM-54) : réservée aux administrateurs (contrat 20), avec les codes
 * de retour réels — 400 hors règle, 403 rôle insuffisant, 404 champ inconnu, 409 libellé déjà pris.
 */
describe("API des champs personnalisés (CRM-54, contrats 20 et 22)", () => {
  it("laisse un administrateur définir un champ, le renommer, retirer une valeur et l'archiver", async () => {
    const created = await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME"] }, adminCookie));
    expect(created.status).toBe(201);
    const { field } = (await created.json()) as { field: CustomFieldDefinition };
    expect(field).toMatchObject({ objectType: TYPE, label: "Segment", type: "list", values: ["Grand compte", "PME"], archived: false });

    const listed = await getFields(jsonRequest("GET", `/api/champs?objet=${TYPE}`, undefined, adminCookie));
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { fields: CustomFieldDefinition[] }).fields.map((entry) => entry.label)).toEqual(["Segment"]);

    const renamed = await patchField(jsonRequest("PATCH", `/api/champs/${field.id}`, { label: "Segment client", required: true }, adminCookie), byId(field.id));
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).field).toMatchObject({ label: "Segment client", required: true });

    /* Retirer une valeur, c'est envoyer la liste sans elle : la valeur passe dans les retirées, rien n'est effacé. */
    const shortened = await patchField(jsonRequest("PATCH", `/api/champs/${field.id}`, { values: ["Grand compte", "ETI"] }, adminCookie), byId(field.id));
    expect(shortened.status).toBe(200);
    expect((await shortened.json()).field).toMatchObject({ values: ["Grand compte", "ETI"], retiredValues: ["PME"] });

    const archived = await patchField(jsonRequest("PATCH", `/api/champs/${field.id}`, { archived: true }, adminCookie), byId(field.id));
    expect(archived.status).toBe(200);
    expect((await archived.json()).field).toMatchObject({ archived: true });
  });

  it("refuse deux champs de même libellé (409) et une définition hors règle (400)", async () => {
    const first = await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "Effectif", type: "number" }, adminCookie));
    expect(first.status).toBe(201);

    const twin = await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "Effectif", type: "text" }, adminCookie));
    expect(twin.status).toBe(409);
    expect((await twin.json()).message).toContain("Effectif");

    const invalid = await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "", type: "number" }, adminCookie));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).fields).toHaveProperty("label");

    const unknown = await patchField(jsonRequest("PATCH", "/api/champs/11111111-1111-4111-8111-111111111111", { label: "Ailleurs" }, adminCookie), byId("11111111-1111-4111-8111-111111111111"));
    expect(unknown.status).toBe(404);
  });

  it("réserve la définition des champs aux administrateurs : 403 pour un membre, 401 sans session (contrat 20)", async () => {
    const [field] = await db.select().from(customFieldDefinition).limit(1);
    expect((await getFields(jsonRequest("GET", `/api/champs?objet=${TYPE}`, undefined, memberCookie))).status).toBe(403);
    expect((await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "Interdit", type: "text" }, memberCookie))).status).toBe(403);
    expect((await patchField(jsonRequest("PATCH", `/api/champs/${field.id}`, { label: "Interdit" }, memberCookie), byId(field.id))).status).toBe(403);

    expect((await getFields(jsonRequest("GET", `/api/champs?objet=${TYPE}`))).status).toBe(401);
    expect((await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "Interdit", type: "text" }))).status).toBe(401);

    /* Le refus n'a rien créé. */
    const labels = (await db.select().from(customFieldDefinition)).map((entry) => entry.label);
    expect(labels).not.toContain("Interdit");
  });

  it("réordonne un champ depuis l'API : monter le second le passe en tête de son objet", async () => {
    await postField(jsonRequest("POST", "/api/champs", { objectType: TYPE, label: "Ancienneté", type: "number" }, adminCookie));
    const before = ((await (await getFields(jsonRequest("GET", `/api/champs?objet=${TYPE}`, undefined, adminCookie))).json()) as { fields: CustomFieldDefinition[] }).fields;
    const second = before[1];

    const moved = await patchField(jsonRequest("PATCH", `/api/champs/${second.id}`, { move: "up" }, adminCookie), byId(second.id));
    expect(moved.status).toBe(200);

    const after = ((await (await getFields(jsonRequest("GET", `/api/champs?objet=${TYPE}`, undefined, adminCookie))).json()) as { fields: CustomFieldDefinition[] }).fields;
    expect(after.map((field) => field.label)).toEqual([second.label, before[0].label, ...before.slice(2).map((field) => field.label)]);
  });
});
