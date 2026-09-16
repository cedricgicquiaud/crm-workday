import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, customFieldDefinition, customFieldValue, lead, pinnedView, savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { updateLead } from "@/features/leads/leads";
import { listForState } from "@/features/lists/apply-filters";
import { columnsOf, defaultColumnKeys } from "@/features/lists/columns";
import { listStateToParams, listUrl } from "@/features/lists/url-state";
import { getList } from "@/features/objects/registry";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { listPinnedViews, pinView } from "@/features/views/pinned";
import { createView, defaultView, deleteView, listStateWithView, listViews, updateView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-liste-leads@exemple.fr", firstName: "Célia", lastName: "Vasseur", password: "MotDePasse-Liste-1", role: "membre" as const };

const LIST = "lead";

let memberId: string;

/** Un lead créé à une date donnée : l'ordre « plus récemment créé » ne dépend pas de la milliseconde d'écriture. */
async function leadCreatedOn(day: string, input: Record<string, unknown>, stage?: string): Promise<string> {
  const record = await createObject("lead", input, { id: memberId });
  await db
    .update(lead)
    .set({ createdAt: new Date(`${day}T09:00:00Z`), ...(stage ? { stage } : {}) })
    .where(eq(lead.id, record.id));
  return record.id;
}

const titlesFor = async (query: string) => {
  const state = await listStateWithView(LIST, new URLSearchParams(query));
  return listForState(LIST, await listObjectRecords("lead", { includeArchived: state.includeArchived }), state).map((record) => record.title);
};

async function cleanup() {
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await db.delete(pinnedView);
  await db.delete(savedView);
  await db.delete(auditLog);
  await db.delete(lead);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;

  await leadCreatedOn("2026-09-01", { firstName: "Ancien", lastName: "Contacté", origin: "linkedin", score: 3 }, "contacte");
  await leadCreatedOn("2026-09-03", { firstName: "Converti", lastName: "Déjà", origin: "recommandation", score: 3 }, "converti");
  await leadCreatedOn("2026-09-04", { firstName: "Écarté", lastName: "Hier", origin: "recommandation", score: 2 }, "ecarte");
  await leadCreatedOn("2026-09-05", { firstName: "Reco", lastName: "Faible", origin: "recommandation", score: 1 });
  await leadCreatedOn("2026-09-06", { firstName: "Reco", lastName: "Forte", origin: "recommandation", score: 2 }, "qualifie");
  const archived = await leadCreatedOn("2026-09-07", { firstName: "Rangé", lastName: "Archivé", origin: "autre" });
  await db.update(lead).set({ archivedAt: new Date() }).where(eq(lead.id, archived));
  await leadCreatedOn("2026-09-08", { companyName: "Banque Récente", origin: "partenaire" });
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/** D10, contrat 5 : la liste « Leads » s'ouvre sur « Leads en cours », les plus récemment créés d'abord. */
describe("liste « Leads » et sa vue « Leads en cours » (CRM-92, D10, contrat 5)", () => {
  it("se range après « Consultants » dans la barre latérale, sous son adresse", () => {
    expect(getList(LIST)).toMatchObject({ label: "Leads", href: "/leads", objectKey: "lead" });
  });

  it("porte les colonnes Avancement, Origine, Score, Responsable, Créé le après le titre", () => {
    expect(defaultColumnKeys(LIST)).toEqual(["stage", "origin", "score", "ownerId", "createdAt"]);
  });

  it("s'ouvre sur « Leads en cours » : ni converti, ni écarté, ni archivé, du plus récemment créé au plus ancien", async () => {
    expect(defaultView(LIST).name).toBe("Leads en cours");
    const state = await listStateWithView(LIST, new URLSearchParams());
    expect(state.filters).toEqual([
      { field: "stage", operator: "n_est_pas", value: "converti" },
      { field: "stage", operator: "n_est_pas", value: "ecarte" },
    ]);
    expect(await titlesFor("")).toEqual(["Banque Récente", "Reco Forte", "Reco Faible", "Ancien Contacté"]);
  });

  it("montre convertis et écartés quand on retire ses deux puces", async () => {
    const state = await listStateWithView(LIST, new URLSearchParams());
    const url = listUrl(LIST, { ...state, filters: [] });
    expect(await titlesFor(url.split("?")[1] ?? "")).toEqual(["Banque Récente", "Reco Forte", "Reco Faible", "Écarté Hier", "Converti Déjà", "Ancien Contacté"]);
  });

  it("combine « Origine est recommandation » et « Score plus grand que 1 », l'enregistre sous un nom, l'épingle et la rouvre à l'identique", async () => {
    const state = await listStateWithView(LIST, new URLSearchParams());
    const refined = { ...state, filters: [...state.filters, { field: "origin", operator: "est" as const, value: "recommandation" }, { field: "score", operator: "plus_grand" as const, value: "1" }] };
    expect(await titlesFor(listStateToParams(LIST, refined).toString())).toEqual(["Reco Forte"]);

    const view = await createView({ objectType: LIST, name: "Recommandations sérieuses", query: listStateToParams(LIST, refined, { absolute: true }).toString() }, { id: memberId });
    await pinView(memberId, view.id);
    expect((await listPinnedViews(memberId)).map((pinned) => pinned.name)).toEqual(["Recommandations sérieuses"]);

    const reopened = await listStateWithView(LIST, new URLSearchParams(`vue=${view.id}`));
    expect(reopened.filters).toEqual(refined.filters);
    expect(reopened.sort).toEqual({ field: "createdAt", direction: "desc" });
    expect(await titlesFor(`vue=${view.id}`)).toEqual(["Reco Forte"]);
    expect((await listViews(LIST)).map((entry) => entry.name)).toEqual(["Leads en cours", "Recommandations sérieuses"]);
  });

  it("refuse (409) de renommer ou de supprimer « Leads en cours »", async () => {
    await expect(updateView("default", { name: "Mes leads" })).rejects.toMatchObject({ status: 409 });
    await expect(deleteView("default")).rejects.toMatchObject({ status: 409 });
    await expect(createView({ objectType: LIST, name: "Leads en cours", query: "" }, { id: memberId })).rejects.toMatchObject({ status: 409 });
  });

  it("reçoit un champ personnalisé « Événement » : il se saisit sur un lead, devient colonne et filtre de la liste", async () => {
    const definition = await createDefinition({ objectType: "lead", label: "Événement", type: "text" }, { id: memberId });
    await loadCustomFields();
    const key = customFieldKey(definition.id);
    expect(columnsOf(LIST).map((column) => column.label)).toContain("Événement");

    const id = await leadCreatedOn("2026-09-09", { companyName: "Banque du Salon", origin: "autre" });
    await updateLead(id, { [key]: "Salon HR Tech 2026" }, { id: memberId });
    expect(await titlesFor(`f=${key}:contient:hr tech`)).toEqual(["Banque du Salon"]);
    await db.delete(customFieldValue);
    await db.delete(customFieldDefinition);
    await loadCustomFields();
  });

  it("écarte « Avancement est converti » de la liste des personnes avec un avertissement, jamais une erreur", async () => {
    const state = await listStateWithView("person", new URLSearchParams("f=stage:est:converti"));
    expect(state.filters).toEqual([]);
    expect(state.inactive.map((entry) => entry.message)).toEqual(["Filtre inactif : « stage » n'est pas un champ de cette liste."]);
  });
});
