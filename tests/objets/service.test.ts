import { eq } from "drizzle-orm";
import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CircleDashedIcon } from "lucide-react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { serializeValue } from "@/features/objects/fields";
import { registerObject, type FieldDescriptor } from "@/features/objects/registry";
import { registerServerObject } from "@/features/objects/registry.server";
import { RECORD_OPTIONS_LIMIT, createObject, listRecordOptions, updateObject } from "@/features/objects/service";
import { closeDb, db, rawSql } from "@/lib/db";

const ACTOR = { email: "acteur-service@exemple.fr", firstName: "Nora", lastName: "Blanc", password: "MotDePasse-Service-1", role: "membre" as const };

let actorId: string;

/** Les fiches créées ici portent des clés étrangères vers `user` : on les efface avant de rendre la base aux autres tests. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

/**
 * Objet factice « typé » (D4, contrat 33) : il déclare un champ `date` et un champ `number`, que
 * l'entreprise n'a pas, pour prouver que les règles des cinq types sont complètes. Sa table n'est
 * pas une migration du produit : elle est créée et détruite par ce fichier, dans la base de test.
 */
const TYPED = "test_typed_object";
const typedTable = pgTable(TYPED, {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dueDate: date("due_date"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  ownerId: text("owner_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});
const DUE_DATE: FieldDescriptor = { key: "dueDate", label: "Échéance", type: "date", order: 20 };
const AMOUNT: FieldDescriptor = { key: "amount", label: "Montant", type: "number", order: 30 };
registerObject({
  key: TYPED,
  order: 930,
  labels: { singular: "Objet typé", plural: "Objets typés", article: "un" },
  icon: CircleDashedIcon,
  href: (id) => `/objets-types/${id}`,
  listHref: "/objets-types",
  apiBase: "/api/objets-types",
  titleField: "name",
  fields: [{ key: "name", label: "Nom", type: "text", required: true, order: 10 }, DUE_DATE, AMOUNT, { key: "ownerId", label: "Responsable", type: "user", required: true, default: "actor", order: 40 }],
  relations: [],
});
registerServerObject({ key: TYPED, table: typedTable, search: async () => [], duplicateKey: () => null });

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ACTOR.email));
  actorId = (await createUserWithPassword(ACTOR)).id;
  await rawSql().unsafe(
    `CREATE TABLE IF NOT EXISTS ${TYPED} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, due_date date, amount numeric(12, 2), owner_id text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz)`,
  );
});
afterAll(async () => {
  await rawSql().unsafe(`DROP TABLE IF EXISTS ${TYPED}`);
  await cleanup();
  await closeDb();
});

/**
 * CRM-33 : le service générique ne connaît que la clé d'objet ; il valide par les descripteurs du
 * registre, pose les colonnes de base et écrit l'historique. L'entreprise est le premier objet branché.
 */
describe("service générique — création (CRM-33, D4, D12)", () => {
  it("crée une fiche avec ses colonnes de base (créateur et responsable = l'acteur, valeurs par défaut) et une entrée « créée » signée dans l'historique", async () => {
    const record = await createObject("company", { name: "ACME", type: "client" }, { id: actorId });
    expect(record).toMatchObject({ name: "ACME", type: "client", createdBy: actorId, ownerId: actorId, paymentTerms: "30_jours", country: "France", archivedAt: null });
    expect(record.createdAt).toBeInstanceOf(Date);

    const history = await listHistory("company", record.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ action: "creee", author: { id: actorId, name: "Nora Blanc" } });
  });
});

describe("service générique — modification (CRM-33, D12)", () => {
  it("écrit une entrée d'historique par champ modifié, avec l'ancienne et la nouvelle valeur, et rien pour un champ inchangé", async () => {
    const created = await createObject("company", { name: "Banque Solveige", type: "prospect" }, { id: actorId });
    const updated = await updateObject("company", created.id, { type: "client", paymentTerms: "60_jours", name: "Banque Solveige" }, { id: actorId });
    expect(updated).toMatchObject({ type: "client", paymentTerms: "60_jours" });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());

    const changes = (await listHistory("company", created.id)).filter((e) => e.action === "modifiee");
    expect(changes.map((e) => [e.field, e.oldValue, e.newValue]).sort()).toEqual([
      ["paymentTerms", "30_jours", "60_jours"],
      ["type", "prospect", "client"],
    ]);
    expect(changes.every((e) => e.author?.id === actorId && e.createdAt instanceof Date)).toBe(true);
  });
});

describe("service générique — fiche archivée (CRM-33, D21)", () => {
  it("refuse (409) de modifier une fiche dont archived_at est posé, sans rien écrire dans l'historique", async () => {
    const created = await createObject("company", { name: "Archivée SA", type: "client" }, { id: actorId });
    await db.update(company).set({ archivedAt: new Date() }).where(eq(company.id, created.id));
    await expect(updateObject("company", created.id, { type: "prospect" }, { id: actorId })).rejects.toMatchObject({ status: 409, code: "fiche_archivee" });
    expect((await listHistory("company", created.id)).map((e) => e.action)).toEqual(["creee"]);
  });
});

describe("service générique — champs date et number (CRM-33, D4, D12)", () => {
  it("accepte une date AAAA-MM-JJ et un nombre fini, les historise avec des valeurs lisibles et stables, et n'écrit rien pour une valeur identique", async () => {
    const created = await createObject(TYPED, { name: "Contrat", dueDate: "2026-09-05", amount: 12.5 }, { id: actorId });
    expect(created).toMatchObject({ dueDate: "2026-09-05", amount: "12.50", ownerId: actorId });

    await updateObject(TYPED, created.id, { dueDate: "2026-10-01", amount: 99 }, { id: actorId });
    const changes = () => listHistory(TYPED, created.id).then((entries) => entries.filter((e) => e.action === "modifiee").map((e) => [e.field, e.oldValue, e.newValue]));
    expect((await changes()).sort()).toEqual([
      ["amount", "12.5", "99"],
      ["dueDate", "2026-09-05", "2026-10-01"],
    ]);

    /* La même date et le même nombre (relu « 99.00 » en base) ne sont pas des changements. */
    const unchanged = await updateObject(TYPED, created.id, { dueDate: "2026-10-01", amount: 99 }, { id: actorId });
    expect(unchanged).toMatchObject({ dueDate: "2026-10-01", amount: "99.00" });
    expect(await changes()).toHaveLength(2);

    /* Vider un champ facultatif est accepté et historisé. */
    await updateObject(TYPED, created.id, { dueDate: null, amount: "" }, { id: actorId });
    expect((await changes()).sort()).toEqual([
      ["amount", "12.5", "99"],
      ["amount", "99", null],
      ["dueDate", "2026-09-05", "2026-10-01"],
      ["dueDate", "2026-10-01", null],
    ]);
  });

  it("refuse (400, message sur le champ) une date mal formée ou impossible, et tout ce qui n'est pas un nombre fini", async () => {
    const created = await createObject(TYPED, { name: "Refus" }, { id: actorId });
    for (const dueDate of ["2026-13-45", "05/09/2026", "2026-9-5", "hier", 20260905]) {
      await expect(updateObject(TYPED, created.id, { dueDate }, { id: actorId }), JSON.stringify(dueDate)).rejects.toMatchObject({ status: 400, details: { fields: { dueDate: "« Échéance » doit être une date au format AAAA-MM-JJ." } } });
    }
    for (const amount of ["12", "abc", true, {}, [1]]) {
      await expect(updateObject(TYPED, created.id, { amount }, { id: actorId }), JSON.stringify(amount)).rejects.toMatchObject({ status: 400, details: { fields: { amount: "« Montant » doit être un nombre." } } });
    }
    expect((await listHistory(TYPED, created.id)).map((e) => e.action)).toEqual(["creee"]);
  });

  it("sérialise une date lue comme Date en jour ISO et un nombre en décimal canonique, pour la comparaison comme pour l'historique", () => {
    expect(serializeValue(DUE_DATE, new Date("2026-09-05T10:00:00Z"))).toBe("2026-09-05");
    expect(serializeValue(DUE_DATE, "2026-09-05")).toBe("2026-09-05");
    expect(serializeValue(AMOUNT, "12.50")).toBe("12.5");
    expect(serializeValue(AMOUNT, 12.5)).toBe("12.5");
    expect(serializeValue(AMOUNT, null)).toBeNull();
    expect(serializeValue(AMOUNT, "")).toBeNull();
  });
});

/** Un sélecteur ne charge ni toutes les fiches ni toutes leurs colonnes : identifiant et titre, bornés. */
describe("service générique — options d'un sélecteur (CRM-42, D7)", () => {
  it("ne rend que l'identifiant et le titre des fiches actives, la dernière modifiée en tête, dans la limite demandée", async () => {
    const noms = ["Alpha", "Beta", "Gamma"];
    for (const name of noms) await createObject(TYPED, { name }, { id: actorId });
    const archivée = await createObject(TYPED, { name: "Archivée" }, { id: actorId });
    await db.update(typedTable).set({ archivedAt: new Date() }).where(eq(typedTable.id, archivée.id));

    const options = await listRecordOptions(TYPED);
    expect(options.slice(0, 3).map((o) => o.name)).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(Object.keys(options[0]).sort()).toEqual(["id", "name"]);
    expect(options.map((o) => o.id)).not.toContain(archivée.id);

    expect(await listRecordOptions(TYPED, { limit: 2 })).toHaveLength(2);
    expect(RECORD_OPTIONS_LIMIT).toBeGreaterThan(0);
  });
});
