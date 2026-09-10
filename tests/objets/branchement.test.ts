import { eq } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CircleDashedIcon } from "lucide-react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, customFieldDefinition, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { listFeed } from "@/features/activities/feed";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { listHistory } from "@/features/history/history";
import { fieldsOf } from "@/features/objects/fields";
import { linkedGroups } from "@/features/objects/links-column";
import { registerObject } from "@/features/objects/registry";
import { registerServerObject } from "@/features/objects/registry.server";
import { createObject, getObjectRecord, updateObject } from "@/features/objects/service";
import { search } from "@/features/search/search";
import { closeDb, db, rawSql } from "@/lib/db";

const ACTOR = { email: "acteur-branchement@exemple.fr", firstName: "Nour", lastName: "Baz", password: "MotDePasse-Branchement-1", role: "membre" as const };

/**
 * Objet « Test » (contrat 33) : il se déclare auprès du registre comme le ferait l'objet d'une
 * feature suivante — opportunité, mission, facture — et rien d'autre. Aucun fichier des mécanismes
 * n'est touché. Sa table n'est pas une migration du produit : ce fichier la crée et la détruit.
 */
const TYPE = "test_branche";

const testTable = pgTable(TYPE, {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  ownerId: text("owner_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

let actorId: string;

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(customFieldDefinition);
}

beforeAll(async () => {
  await rawSql().unsafe(
    `CREATE TABLE IF NOT EXISTS ${TYPE} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, parent_id uuid, owner_id text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz)`,
  );
  await cleanup();
  await db.delete(user).where(eq(user.email, ACTOR.email));
  actorId = (await createUserWithPassword(ACTOR)).id;

  registerObject({
    key: TYPE,
    order: 940,
    labels: { singular: "Fiche branchée", plural: "Fiches branchées", article: "une" },
    icon: CircleDashedIcon,
    href: (id) => `/fiches-branchees/${id}`,
    listHref: "/fiches-branchees",
    apiBase: "/api/fiches-branchees",
    titleField: "name",
    fields: [
      { key: "name", label: "Nom", type: "text", required: true, sortable: true, order: 10 },
      { key: "ownerId", label: "Responsable", type: "user", required: true, default: "actor", order: 20 },
      /* La clé étrangère d'une relation est un champ déclaré, comme sur toute fiche liée : le service l'écrit, la colonne des liens la lit. */
      { key: "parentId", label: "Fiche mère", type: "text", order: 30 },
    ],
    relations: [{ to: TYPE, fkColumn: "parentId", label: "Fiche mère", inverseLabel: "Fiches filles", prefill: "parentId" }],
    quickCreate: ["name"],
    listColumns: ["ownerId"],
  });
  registerServerObject({
    key: TYPE,
    table: testTable,
    search: async (query) => {
      const rows = await db.select({ id: testTable.id, name: testTable.name }).from(testTable);
      return rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())).map((row) => ({ id: row.id, title: row.name }));
    },
    duplicateKey: (record) => String(record.name ?? "") || null,
  });
});

afterAll(async () => {
  await cleanup();
  await rawSql().unsafe(`DROP TABLE IF EXISTS ${TYPE}`);
  await closeDb();
});

/**
 * Contrat 33 : un objet des features suivantes obtient les mécanismes communs en se déclarant, sans
 * une ligne écrite dans leurs fichiers. Ce test est le garde-fou de la décision 4 : s'il faut
 * modifier un mécanisme pour brancher un objet de plus, il échoue avant le merge.
 */
describe("un objet déclaré obtient les mécanismes communs (CRM-57, contrat 33, D4)", () => {
  it("obtient l'historique, les champs personnalisés, le fil d'activité, la recherche de la palette et la colonne des liens, sans toucher aux mécanismes", async () => {
    const definition = await createDefinition({ objectType: TYPE, label: "Trigramme", type: "text" }, { id: actorId });
    const trigramme = customFieldKey(definition.id);

    /* Champs personnalisés : la définition devient un champ de l'objet, saisissable et relisible. */
    await loadCustomFields();
    expect(fieldsOf(TYPE).map((field) => field.key)).toContain(trigramme);

    const mere = await createObject(TYPE, { name: "Fiche mère branchée" }, { id: actorId });
    const record = await createObject(TYPE, { name: "Fiche branchée", parentId: mere.id, [trigramme]: "ABC" }, { id: actorId });
    expect(record[trigramme]).toBe("ABC");
    expect((await getObjectRecord(TYPE, record.id))[trigramme]).toBe("ABC");

    /* Historique : la création, puis un changement par champ — champ personnalisé compris. */
    await updateObject(TYPE, record.id, { name: "Fiche branchée (renommée)", [trigramme]: "XYZ" }, { id: actorId });
    const history = await listHistory(TYPE, record.id);
    expect(history.map((entry) => entry.action)).toContain("creee");
    expect(history.filter((entry) => entry.action === "modifiee").map((entry) => entry.field).sort()).toEqual([trigramme, "name"].sort());

    /* Fil d'activité : une note s'écrit sur la fiche et le fil la rend, avec les changements. */
    await createActivity(TYPE, record.id, { type: "note", body: "Première note branchée" }, { id: actorId });
    const feed = await listFeed(TYPE, record.id, []);
    expect(feed.items.map((item) => item.text)).toContain("Première note branchée");
    expect(feed.items.map((item) => item.text)).toContain("Trigramme : ABC → XYZ");

    /* Recherche de la palette : la fiche répond à la saisie, sous la clé de son objet. */
    const hits = await search("branchée (renommée)");
    expect(hits.filter((hit) => hit.type === TYPE).map((hit) => hit.id)).toEqual([record.id]);
    expect(hits.find((hit) => hit.id === record.id)?.href).toBe(`/fiches-branchees/${record.id}`);

    /* Colonne des liens : la relation déclarée donne son groupe, avec la fiche désignée. */
    const groups = await linkedGroups(TYPE, record.id);
    expect(groups.map((group) => group.label)).toContain("Fiche mère");
    expect(groups.find((group) => group.label === "Fiche mère")?.records.map((linked) => linked.id)).toEqual([mere.id]);
  });
});
