import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getViews, POST as postView } from "@/app/api/vues/route";
import { DELETE as deleteViewRoute, PATCH as patchView } from "@/app/api/vues/[id]/route";
import { PATCH as reorderPinsRoute, POST as postPin } from "@/app/api/vues-epinglees/route";
import { DELETE as deletePin } from "@/app/api/vues-epinglees/[id]/route";
import { savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listPinnedViews } from "@/features/views/pinned";
import type { ViewSummary } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

const ALICE = { email: "alice-api-vues@exemple.fr", firstName: "Alice", lastName: "Vidal", password: "MotDePasse-ApiVues-1", role: "membre" as const };
const BOB = { email: "bob-api-vues@exemple.fr", firstName: "Bob", lastName: "Nardin", password: "MotDePasse-ApiVues-2", role: "membre" as const };

const QUERY = "f=kind:est:client&tri=name:asc";

let alice: string;
let bob: string;
let aliceCookie: string;
let bobCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

/** Vues d'un objet telles que l'écran les lit, avec le cookie donné. */
async function listViews(cookie?: string) {
  const res = await getViews(jsonRequest("GET", `/api/vues?objet=${TEST_TYPE}`, undefined, cookie));
  return { status: res.status, views: res.status === 200 ? ((await res.json()) as { views: ViewSummary[] }).views : [] };
}

beforeAll(async () => {
  registerTestObject();
  await db.delete(savedView);
  await db.delete(user).where(inArray(user.email, [ALICE.email, BOB.email]));
  alice = (await createUserWithPassword(ALICE)).id;
  bob = (await createUserWithPassword(BOB)).id;
  aliceCookie = await sessionCookie(ALICE.email, ALICE.password);
  bobCookie = await sessionCookie(BOB.email, BOB.password);
});
afterAll(async () => {
  await db.delete(savedView);
  await closeDb();
});

/**
 * API des vues (D24) : une vue appartient à l'équipe, pas à son auteur (D11). Tout membre connecté
 * la voit, la renomme, change son état et la supprime ; les refus portent des codes réels.
 */
describe("API des vues (CRM-51, contrat 24, contrat 26)", () => {
  it("enregistre une vue, la rend à toute l'équipe et laisse un collègue la modifier", async () => {
    const created = await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name: "Clients parisiens", query: QUERY }, aliceCookie));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    /* Le collègue voit la vue dans la liste des vues de l'objet, derrière la vue par défaut. */
    const seenByBob = await listViews(bobCookie);
    expect(seenByBob.status).toBe(200);
    expect(seenByBob.views).toEqual([
      { id: "default", objectType: TEST_TYPE, name: "Toutes les fiches de test", query: "" },
      { id, objectType: TEST_TYPE, name: "Clients parisiens", query: QUERY },
    ]);

    /* Il la modifie… */
    const patched = await patchView(jsonRequest("PATCH", `/api/vues/${id}`, { name: "Clients de l'Ouest", query: "f=city:contient:Nantes" }, bobCookie), byId(id));
    expect(patched.status).toBe(200);

    /* … et la première la relit modifiée (contrat 24). */
    expect((await listViews(aliceCookie)).views[1]).toEqual({ id, objectType: TEST_TYPE, name: "Clients de l'Ouest", query: "f=city:contient:Nantes" });

    const removed = await deleteViewRoute(jsonRequest("DELETE", `/api/vues/${id}`, undefined, bobCookie), byId(id));
    expect(removed.status).toBe(200);
    expect((await listViews(aliceCookie)).views).toHaveLength(1);
  });

  it("refuse un nom déjà pris, la vue par défaut, un nom hors règle, une vue inconnue et l'absence de session", async () => {
    const created = await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name: "Clients parisiens", query: "" }, aliceCookie));
    expect(created.status).toBe(201);

    const duplicate = await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name: "Clients parisiens", query: "" }, bobCookie));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: "nom_deja_pris", message: "« Clients parisiens » est déjà le nom d'une vue de cette liste." });

    expect((await patchView(jsonRequest("PATCH", "/api/vues/default", { name: "Ma liste" }, aliceCookie), byId("default"))).status).toBe(409);
    expect((await deleteViewRoute(jsonRequest("DELETE", "/api/vues/default", undefined, aliceCookie), byId("default"))).status).toBe(409);
    expect((await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name: "   ", query: "" }, aliceCookie))).status).toBe(400);
    const absent = randomUUID();
    expect((await patchView(jsonRequest("PATCH", `/api/vues/${absent}`, { name: "Ailleurs" }, aliceCookie), byId(absent))).status).toBe(404);

    /* Une liste qui n'existe pas est une ressource inexistante, jamais une panne (D24). */
    const unknownObject = await getViews(jsonRequest("GET", "/api/vues?objet=inconnu", undefined, aliceCookie));
    expect(unknownObject.status).toBe(404);

    /* Sans session, rien n'est lisible ni écrit (D12). */
    expect((await listViews()).status).toBe(401);
    expect((await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name: "Sans session", query: "" }))).status).toBe(401);
  });
});

/**
 * API des épingles : la part personnelle des vues (contrat 24). Chacun n'écrit que dans sa propre
 * barre latérale, et supprimer une vue la retire de celle de tout le monde.
 */
describe("API des vues épinglées (CRM-52, CRM-53, contrat 24)", () => {
  const pinned = async (userId: string) => (await listPinnedViews(userId)).map((view) => view.name);

  async function create(name: string, cookie: string): Promise<string> {
    const res = await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name, query: "" }, cookie));
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it("épingle et désépingle dans sa seule barre latérale, dans l'ordre enregistré", async () => {
    const clients = await create("Clients à relancer", aliceCookie);
    const chantiers = await create("Chantiers ouverts", aliceCookie);

    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: clients }, aliceCookie))).status).toBe(201);
    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: chantiers }, aliceCookie))).status).toBe(201);
    expect(await pinned(alice)).toEqual(["Clients à relancer", "Chantiers ouverts"]);
    /* Le collègue voit ces vues dans la liste des vues, mais sa barre latérale reste la sienne. */
    expect(await pinned(bob)).toEqual([]);

    expect((await reorderPinsRoute(jsonRequest("PATCH", "/api/vues-epinglees", { viewIds: [chantiers, clients] }, aliceCookie))).status).toBe(200);
    expect(await pinned(alice)).toEqual(["Chantiers ouverts", "Clients à relancer"]);

    expect((await deletePin(jsonRequest("DELETE", `/api/vues-epinglees/${clients}`, undefined, aliceCookie), byId(clients))).status).toBe(200);
    expect(await pinned(alice)).toEqual(["Chantiers ouverts"]);

    /* Refus : vue inconnue, vue déjà épinglée, épingle absente, aucune session. */
    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: randomUUID() }, aliceCookie))).status).toBe(404);
    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: chantiers }, aliceCookie))).status).toBe(409);
    expect((await deletePin(jsonRequest("DELETE", `/api/vues-epinglees/${clients}`, undefined, aliceCookie), byId(clients))).status).toBe(404);
    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: chantiers }))).status).toBe(401);
  });

  it("retire une vue supprimée de la barre latérale de chacun", async () => {
    const partagee = await create("Vue partagée", aliceCookie);
    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: partagee }, aliceCookie))).status).toBe(201);
    expect((await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: partagee }, bobCookie))).status).toBe(201);
    expect(await pinned(bob)).toEqual(["Vue partagée"]);

    /* Un collègue la supprime : elle quitte les deux barres (CRM-53). */
    expect((await deleteViewRoute(jsonRequest("DELETE", `/api/vues/${partagee}`, undefined, bobCookie), byId(partagee))).status).toBe(200);
    expect(await pinned(alice)).not.toContain("Vue partagée");
    expect(await pinned(bob)).toEqual([]);
  });
});
