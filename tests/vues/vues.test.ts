import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createView, DEFAULT_VIEW, deleteView, listViews, updateView } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

const ALICE = { email: "alice-vues@exemple.fr", firstName: "Alice", lastName: "Vidal", password: "MotDePasse-Vues-1", role: "membre" as const };

const QUERY = "f=kind:est:client&tri=name:asc&colonnes=city,kind";

let alice: string;

beforeAll(async () => {
  registerTestObject();
  await db.delete(savedView);
  await db.delete(user).where(eq(user.email, ALICE.email));
  alice = (await createUserWithPassword(ALICE)).id;
});
afterAll(async () => {
  await db.delete(savedView);
  await closeDb();
});

/**
 * Une vue sauvegardée est l'état d'une liste — filtres, tri, colonnes — rangé sous un nom (D18) :
 * on la rouvre au même état, et toute l'équipe la voit.
 */
describe("vues sauvegardées d'un objet (CRM-51, contrat 24)", () => {
  it("enregistre l'état d'une liste sous un nom, derrière la vue par défaut de l'objet", async () => {
    const view = await createView({ objectType: TEST_TYPE, name: "Clients parisiens", query: QUERY }, { id: alice });
    expect(view.query).toBe(QUERY);

    const views = await listViews(TEST_TYPE);
    expect(views.map((entry) => entry.id)).toEqual([DEFAULT_VIEW, view.id]);
    /* La vue par défaut est synthétique : aucune ligne en base, aucun paramètre, elle rend la liste nue. */
    expect(views[0]).toMatchObject({ name: "Toutes les fiches de test", query: "" });
    expect(views[1]).toMatchObject({ name: "Clients parisiens", query: QUERY });

    /* Les vues d'un autre objet ne sont pas les siennes. */
    await createView({ objectType: "autre_objet", name: "Clients parisiens", query: "" }, { id: alice });
    expect(await listViews(TEST_TYPE)).toHaveLength(2);
  });

  it("refuse de toucher à la vue par défaut, un nom déjà pris sur le même objet et un nom hors règle", async () => {
    const view = await createView({ objectType: TEST_TYPE, name: "Clients lyonnais", query: "" }, { id: alice });

    /* La vue par défaut n'est pas une ligne : elle ne se renomme ni ne se supprime (contrat 26). */
    await expect(updateView(DEFAULT_VIEW, { name: "Ma liste" })).rejects.toMatchObject({ status: 409, code: "vue_par_defaut" });
    await expect(deleteView(DEFAULT_VIEW)).rejects.toMatchObject({ status: 409, code: "vue_par_defaut" });

    /* Deux vues du même nom sur le même objet seraient indiscernables dans la barre (contrat 26). */
    await expect(createView({ objectType: TEST_TYPE, name: "Clients lyonnais", query: "" }, { id: alice })).rejects.toMatchObject({ status: 409, code: "nom_deja_pris" });
    await expect(updateView(view.id, { name: "Clients parisiens" })).rejects.toMatchObject({ status: 409, code: "nom_deja_pris" });
    /* Le nom de la vue par défaut se lit dans la même barre : il n'est pas libre non plus. */
    await expect(createView({ objectType: TEST_TYPE, name: "Toutes les fiches de test", query: "" }, { id: alice })).rejects.toMatchObject({ status: 409, code: "nom_deja_pris" });
    /* Le même nom sur un autre objet reste libre. */
    await createView({ objectType: "autre_objet", name: "Clients lyonnais", query: "" }, { id: alice });

    await expect(createView({ objectType: TEST_TYPE, name: "   ", query: "" }, { id: alice })).rejects.toMatchObject({ status: 400, code: "donnees_invalides" });
    await expect(createView({ objectType: TEST_TYPE, name: "V".repeat(121), query: "" }, { id: alice })).rejects.toMatchObject({ status: 400, code: "donnees_invalides" });
    await expect(updateView(view.id, { name: "" })).rejects.toMatchObject({ status: 400, code: "donnees_invalides" });

    /* Une vue inconnue est une ressource inexistante, et un identifiant qui n'est pas un UUID aussi. */
    await expect(updateView(randomUUID(), { name: "Ailleurs" })).rejects.toMatchObject({ status: 404, code: "vue_introuvable" });
    await expect(deleteView("pas-un-uuid")).rejects.toMatchObject({ status: 404, code: "vue_introuvable" });
  });
});
