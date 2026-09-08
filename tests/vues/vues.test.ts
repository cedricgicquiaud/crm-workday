import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createView, DEFAULT_VIEW, listViews } from "@/features/views/views";
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
});
