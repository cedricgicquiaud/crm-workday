import { eq, inArray } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CircleDashedIcon } from "lucide-react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, customFieldDefinition, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { listFeed } from "@/features/activities/feed";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { archiveRecord } from "@/features/archive/archive";
import { deleteRecord } from "@/features/archive/delete";
import { listHistory, recordHistory } from "@/features/history/history";
import { collectBanners } from "@/features/objects/banners";
import { fieldsOf, isLocked } from "@/features/objects/fields";
import { selectableValues } from "@/features/objects/labels";
import { linkedGroups } from "@/features/objects/links-column";
import { listForState } from "@/features/lists/apply-filters";
import { mergeRecords, planMerge } from "@/features/merge/merge";
import { defaultColumnKeys } from "@/features/lists/columns";
import { parseListState } from "@/features/lists/url-state";
import { listLists, registerObject } from "@/features/objects/registry";
import { registerServerObject, visibleActions } from "@/features/objects/registry.server";
import { createObject, getObjectRecord, listObjectRecords, updateObject } from "@/features/objects/service";
import { search } from "@/features/search/search";
import { defaultView } from "@/features/views/views";
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
  phase: text("phase"),
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
    `CREATE TABLE IF NOT EXISTS ${TYPE} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, parent_id uuid, phase text, owner_id text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz)`,
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
      /* Complément : la fiche ne porte pas ce nom dans sa table, le chargeur `attach` le joint à chaque lecture (D19). */
      { key: "parentName", label: "Nom de la fiche mère", type: "text", editable: false, sortable: true, order: 40 },
      /* Une valeur réservée (D21) : elle se lit et se filtre, mais aucune écriture ne la pose — un geste de l'objet la posera. */
      {
        key: "phase",
        label: "Phase",
        type: "list",
        values: [{ value: "ouverte", label: "Ouverte" }, { value: "close", label: "Close", reserved: true }],
        /* Un champ figé selon la fiche (D21) : une fiche close ne change plus de phase tant qu'un geste ne la rouvre pas. */
        lockedWhen: { test: (record) => record.phase === "close", message: "Fiche close : la rouvrir d'abord." },
        order: 50,
      },
    ],
    /* `keepArchived` (D21) : une fiche fille archivée reste listée chez sa mère, marquée — la trace prime. */
    relations: [{ to: TYPE, fkColumn: "parentId", label: "Fiche mère", inverseLabel: "Fiches filles", prefill: "parentId", keepArchived: true }],
    /* Une fiche figée selon son état (D21) : ses champs ne s'écrivent plus, son fil reste ouvert. */
    frozen: { test: (record) => String(record.name ?? "").startsWith("Gelée"), message: "Fiche gelée : ses champs ne se modifient plus." },
    /* Une action d'historique propre à l'objet, et la phrase qui la raconte. */
    historyActions: { gel: (entry) => `Gelée en ${entry.newValue}` },
    quickCreate: ["name"],
    listColumns: ["ownerId"],
    /* Un objet qui ne se fusionne pas (D21) : il le déclare, la fusion commune le refuse. */
    mergeable: false,
    /* Une liste déclarée (D10) : un objet la pose comme le reste, sans qu'un mécanisme la nomme. */
    lists: [
      {
        key: "test_branche_orphelines",
        label: "Fiches orphelines",
        singular: "Fiche orpheline",
        icon: CircleDashedIcon,
        href: "/fiches-branchees-orphelines",
        order: 941,
        baseFilters: [{ field: "parentId", operator: "est_vide", value: "" }],
        columns: ["parentName"],
        defaultViewName: "Toutes les fiches orphelines",
      },
    ],
  });
  registerServerObject({
    key: TYPE,
    table: testTable,
    search: async (query) => {
      const rows = await db.select({ id: testTable.id, name: testTable.name }).from(testTable);
      return rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())).map((row) => ({ id: row.id, title: row.name }));
    },
    duplicateKey: (record) => String(record.name ?? "") || null,
    /* Des actions d'en-tête déclarées (D21), rangées par rang et visibles selon la fiche : « Clore » sur une fiche ouverte, « Rouvrir » sur une fiche close. */
    actions: [
      { key: "rouvrir", order: 20, visible: (record) => record.phase === "close", render: () => null },
      { key: "clore", order: 10, visible: (record) => record.phase !== "close", render: () => null },
      { key: "exporter", order: 5, visible: () => true, render: () => null },
    ],
    /* Refus de suppression selon la fiche (D21) : une fiche gelée s'archive, elle ne se supprime pas. */
    deletable: (record) => (String(record.name ?? "").startsWith("Gelée") ? "Une fiche gelée s'archive." : null),
    /* Une bannière déclarée, rangée entre « archivée » et « doublon probable » (D21), qui mène à deux fiches. */
    banners: [
      {
        rank: "gelee",
        order: 15,
        source: async (record) =>
          String(record.name ?? "").startsWith("Gelée") ? [{ rank: "gelee", tone: "info" as const, message: "Fiche gelée.", links: [{ label: "Fiche mère", href: `/fiches-branchees/${String(record.parentId)}` }] }] : [],
      },
    ],
    /* Le service appelle ce chargeur à chaque lecture — une fiche, une liste — et lui passe toutes les fiches d'un coup : un complément ne coûte pas une requête par ligne. */
    attach: async (records) => {
      const ids = records.map((record) => record.parentId).filter((id): id is string => typeof id === "string");
      const parents = ids.length === 0 ? [] : await db.select({ id: testTable.id, name: testTable.name }).from(testTable).where(inArray(testTable.id, ids));
      const names = new Map(parents.map((parent) => [parent.id, parent.name]));
      return records.map((record) => ({ ...record, parentName: names.get(String(record.parentId)) ?? null }));
    },
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

    /* Compléments : ce que la table ne porte pas arrive par le chargeur déclaré, à la création, à la lecture d'une fiche et à celle de la liste. */
    expect(record.parentName).toBe("Fiche mère branchée");
    expect((await getObjectRecord(TYPE, record.id)).parentName).toBe("Fiche mère branchée");
    const listed = await listObjectRecords(TYPE);
    expect(listed.find((entry) => entry.id === record.id)?.parentName).toBe("Fiche mère branchée");
    expect(listed.find((entry) => entry.id === mere.id)?.parentName).toBeNull();

    /* Liste déclarée : elle prend sa place dans la barre latérale, porte ses colonnes, sa vue par défaut nommée, et son filtre de base qu'aucune URL ne retire. */
    const declared = listLists().find((list) => list.key === "test_branche_orphelines")!;
    expect(declared).toMatchObject({ objectKey: TYPE, label: "Fiches orphelines", href: "/fiches-branchees-orphelines" });
    expect(defaultColumnKeys("test_branche_orphelines")).toEqual(["parentName", "updatedAt"]);
    expect(defaultView("test_branche_orphelines").name).toBe("Toutes les fiches orphelines");
    const all = await listObjectRecords(TYPE);
    const orphaned = listForState("test_branche_orphelines", all, parseListState("test_branche_orphelines", new URLSearchParams("f=name:contient:branchée")));
    expect(orphaned.map((entry) => entry.name)).toEqual(["Fiche mère branchée"]);

    /* Colonne des liens : la relation déclarée donne son groupe, avec la fiche désignée. */
    const groups = await linkedGroups(TYPE, record.id);
    expect(groups.map((group) => group.label)).toContain("Fiche mère");
    expect(groups.find((group) => group.label === "Fiche mère")?.records.map((linked) => linked.id)).toEqual([mere.id]);
  });
});

/**
 * D21 : une valeur de liste peut être réservée à un geste de l'objet (« converti », « écarté » d'un
 * lead). Le mécanisme la connaît par déclaration : le sélecteur ne la propose pas, et l'écriture la
 * refuse, sans qu'un fichier des mécanismes nomme l'objet.
 */
describe("valeur de liste réservée, par déclaration (CRM-91, D21)", () => {
  it("n'est pas proposée au choix, se lit quand la fiche la porte, et l'écriture la refuse (400) sous le champ", async () => {
    const phase = fieldsOf(TYPE).find((field) => field.key === "phase")!;
    expect(selectableValues(phase, "ouverte").map((option) => option.value)).toEqual(["ouverte"]);
    /* Portée par la fiche, elle reste affichée, inerte : le sélecteur dit ce que la fiche porte sans le proposer. */
    expect(selectableValues(phase, "close")).toEqual([{ value: "ouverte", label: "Ouverte" }, { value: "close", label: "Close", disabled: true }]);

    const record = await createObject(TYPE, { name: "Fiche à phase", phase: "ouverte" }, { id: actorId });
    await expect(updateObject(TYPE, record.id, { phase: "close" }, { id: actorId })).rejects.toMatchObject({ status: 400, details: { fields: { phase: "« Close » ne se pose pas à la main dans « Phase »." } } });
    await expect(createObject(TYPE, { name: "Fiche close", phase: "close" }, { id: actorId })).rejects.toMatchObject({ status: 400 });
    expect((await getObjectRecord(TYPE, record.id)).phase).toBe("ouverte");
  });
});

/**
 * D21 : un champ peut se figer selon la fiche (l'avancement d'un lead écarté), sans que la fiche entière
 * passe en lecture seule. Le mécanisme lit la déclaration : la fiche le rend en texte, l'écriture le
 * refuse (409), et les autres champs de la même fiche restent modifiables.
 */
describe("champ figé selon la fiche, par déclaration (CRM-91, D21)", () => {
  it("se lit en texte sur la fiche qui le fige, l'écriture le refuse (409) sous le champ, et les autres champs restent modifiables", async () => {
    const record = await createObject(TYPE, { name: "Fiche à clore", phase: "ouverte" }, { id: actorId });
    const phase = fieldsOf(TYPE).find((field) => field.key === "phase")!;
    expect(isLocked(phase, record)).toBe(false);

    /* La phase réservée est posée par le geste de l'objet, qui écrit directement. */
    await db.update(testTable).set({ phase: "close" }).where(eq(testTable.id, record.id));
    const closed = await getObjectRecord(TYPE, record.id);
    expect(isLocked(phase, closed)).toBe(true);

    await expect(updateObject(TYPE, record.id, { phase: "ouverte" }, { id: actorId })).rejects.toMatchObject({ status: 409, details: { fields: { phase: "Fiche close : la rouvrir d'abord." } } });
    expect((await updateObject(TYPE, record.id, { name: "Fiche close renommée" }, { id: actorId })).name).toBe("Fiche close renommée");
    expect((await getObjectRecord(TYPE, record.id)).phase).toBe("close");
  });
});

/** D21 : un objet peut déclarer qu'il ne se fusionne pas ; l'aperçu comme la fusion répondent 405, avant de lire les fiches. */
describe("refus de fusion déclaré (CRM-93, D21)", () => {
  it("refuse (405) l'aperçu et la fusion de deux fiches d'un objet non fusionnable, sans rien écrire", async () => {
    const one = await createObject(TYPE, { name: "Jumelle non fusionnable" }, { id: actorId });
    const two = await createObject(TYPE, { name: "Jumelle non fusionnable" }, { id: actorId });
    await expect(planMerge(TYPE, one.id, two.id)).rejects.toMatchObject({ status: 405 });
    await expect(mergeRecords(TYPE, one.id, two.id, [])).rejects.toMatchObject({ status: 405 });
    expect((await getObjectRecord(TYPE, two.id)).name).toBe("Jumelle non fusionnable");
  });
});

/** D21 : une fiche figée selon son état ne s'écrit plus champ par champ, mais son fil reste ouvert (CRM-97, contrat 28). */
describe("fiche figée par déclaration (CRM-97, D18, D21)", () => {
  it("refuse (409) toute modification de champ d'une fiche figée, et y accepte encore une note", async () => {
    const record = await createObject(TYPE, { name: "Gelée à la source" }, { id: actorId });

    await expect(updateObject(TYPE, record.id, { ownerId: actorId, phase: "ouverte" }, { id: actorId })).rejects.toMatchObject({ status: 409, message: "Fiche gelée : ses champs ne se modifient plus." });
    await createActivity(TYPE, record.id, { type: "note", body: "Note sur une fiche gelée" }, { id: actorId });

    expect((await getObjectRecord(TYPE, record.id)).phase).toBeNull();
    expect((await listFeed(TYPE, record.id, [])).items.map((item) => item.text)).toContain("Note sur une fiche gelée");
  });
});

/** D21 : un objet déclare quand une fiche ne se supprime pas ; la suppression commune le lit (CRM-97, contrat 28). */
describe("refus de suppression déclaré (CRM-97, D18, D21)", () => {
  it("refuse (409) de supprimer une fiche que sa déclaration retient, avec la phrase déclarée", async () => {
    const record = await createObject(TYPE, { name: "Gelée indélébile" }, { id: actorId });

    await expect(deleteRecord(TYPE, record.id)).rejects.toMatchObject({ status: 409, message: "Une fiche gelée s'archive." });
    expect((await getObjectRecord(TYPE, record.id)).name).toBe("Gelée indélébile");
  });
});

/** D21, D27 : une relation déclarée « même archivée » garde ses fiches dans la colonne des liens, et le refus de suppression les nomme (CRM-97, contrat 29). */
describe("relation gardée même archivée, et bloqueurs nommés (CRM-97, D19, D21, D27)", () => {
  it("liste une fiche fille archivée chez sa mère, marquée archivée, et le refus de supprimer la mère la nomme, trois titres au plus", async () => {
    const mere = await createObject(TYPE, { name: "Mère retenue" }, { id: actorId });
    const filles = [];
    for (const name of ["Fille A", "Fille B", "Fille C", "Fille D"]) filles.push(await createObject(TYPE, { name, parentId: mere.id }, { id: actorId }));
    await archiveRecord(TYPE, filles[0].id, { id: actorId });

    const group = (await linkedGroups(TYPE, mere.id)).find((candidate) => candidate.label === "Fiches filles");
    expect(group?.records.find((linked) => linked.id === filles[0].id)).toMatchObject({ title: "Fille A", archived: true });

    const refusal = await deleteRecord(TYPE, mere.id).catch((error: { status: number; details: { blockers: { label: string; count: number; titles?: string[] }[] } }) => error);
    expect(refusal).toMatchObject({ status: 409 });
    const blocker = (refusal as { details: { blockers: { label: string; count: number; titles?: string[] }[] } }).details.blockers.find((candidate) => candidate.label === "Fiches filles");
    expect(blocker?.count).toBe(4);
    expect(blocker?.titles).toHaveLength(3);
  });
});

/** D21 : une bannière déclarée par l'objet se range parmi les communes, et une seule s'affiche (CRM-97, contrat 28). */
describe("bannière déclarée (CRM-97, D18, D21)", () => {
  it("range la bannière déclarée après « archivée » et avant « doublon probable », avec ses liens", async () => {
    const mere = await createObject(TYPE, { name: "Mère d'une gelée" }, { id: actorId });
    const gelee = await createObject(TYPE, { name: "Gelée jumelle", parentId: mere.id }, { id: actorId });
    await createObject(TYPE, { name: "Gelée jumelle" }, { id: actorId });

    const live = await collectBanners(TYPE, gelee.id);
    expect(live.map((banner) => banner.rank)).toEqual(["gelee", "doublon"]);
    expect(live[0].links).toEqual([{ label: "Fiche mère", href: `/fiches-branchees/${mere.id}` }]);

    await archiveRecord(TYPE, gelee.id, { id: actorId });
    expect((await collectBanners(TYPE, gelee.id))[0].rank).toBe("archivee");
  });
});

/** D21 : une action d'historique déclarée par l'objet se lit dans le fil par la phrase qu'il déclare (CRM-97, contrat 15). */
describe("action d'historique déclarée (CRM-97, D16, D21)", () => {
  it("écrit l'entrée d'une action propre à l'objet dans le fil avec la phrase déclarée", async () => {
    const record = await createObject(TYPE, { name: "Fiche racontée" }, { id: actorId });
    await recordHistory([{ objectType: TYPE, objectId: record.id, action: "gel", newValue: "glace", authorId: actorId }]);

    expect((await listFeed(TYPE, record.id, [])).items.map((item) => item.text)).toContain("Gelée en glace");
  });
});

/** D21 : un objet déclare ses gestes d'en-tête (Écarter, Rouvrir d'un lead) ; la fiche montre ceux que la fiche permet, par rang. */
describe("actions d'en-tête déclarées (CRM-91, D21)", () => {
  it("rend les actions visibles pour la fiche, par rang croissant, et aucune sur une fiche archivée", () => {
    expect(visibleActions(TYPE, { phase: "ouverte", archivedAt: null }).map((action) => action.key)).toEqual(["exporter", "clore"]);
    expect(visibleActions(TYPE, { phase: "close", archivedAt: null }).map((action) => action.key)).toEqual(["exporter", "rouvrir"]);
    expect(visibleActions(TYPE, { phase: "close", archivedAt: new Date() })).toEqual([]);
  });
});
