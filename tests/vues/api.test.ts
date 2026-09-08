import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getViews, POST as postView } from "@/app/api/vues/route";
import { DELETE as deleteViewRoute, PATCH as patchView } from "@/app/api/vues/[id]/route";
import { savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import type { ViewSummary } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

const ALICE = { email: "alice-api-vues@exemple.fr", firstName: "Alice", lastName: "Vidal", password: "MotDePasse-ApiVues-1", role: "membre" as const };
const BOB = { email: "bob-api-vues@exemple.fr", firstName: "Bob", lastName: "Nardin", password: "MotDePasse-ApiVues-2", role: "membre" as const };

const QUERY = "f=kind:est:client&tri=name:asc";

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
  await createUserWithPassword(ALICE);
  await createUserWithPassword(BOB);
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

    /* Sans session, rien n'est lisible ni écrit (D12). */
    expect((await listViews()).status).toBe(401);
    expect((await postView(jsonRequest("POST", "/api/vues", { objectType: TEST_TYPE, name: "Sans session", query: "" }))).status).toBe(401);
  });
});
