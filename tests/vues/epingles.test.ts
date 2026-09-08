import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createView } from "@/features/views/views";
import { listPinnedViews, pinView, reorderPins, unpinView } from "@/features/views/pinned";
import { closeDb, db } from "@/lib/db";
import { registerTestObject, TEST_TYPE } from "../listes/objet-de-test";

const INES = { email: "ines-epingles@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Epingles-1", role: "membre" as const };
const OMAR = { email: "omar-epingles@exemple.fr", firstName: "Omar", lastName: "Bassine", password: "MotDePasse-Epingles-2", role: "membre" as const };

let ines: string;
let omar: string;

beforeAll(async () => {
  registerTestObject();
  await db.delete(savedView);
  await db.delete(user).where(inArray(user.email, [INES.email, OMAR.email]));
  ines = (await createUserWithPassword(INES)).id;
  omar = (await createUserWithPassword(OMAR)).id;
});
afterAll(async () => {
  await db.delete(savedView);
  await closeDb();
});

const names = async (userId: string) => (await listPinnedViews(userId)).map((view) => view.name);

/**
 * L'épingle est personnelle (contrat 24) : chacun met dans sa barre latérale les vues qu'il veut,
 * dans l'ordre qu'il choisit, et cet ordre est enregistré — il ne se déduit de rien.
 */
describe("vues épinglées dans la barre latérale (CRM-52, contrat 24)", () => {
  it("épingle une vue dans la barre du seul utilisateur qui l'épingle, dans l'ordre qu'il enregistre", async () => {
    const clients = await createView({ objectType: TEST_TYPE, name: "Clients parisiens", query: "f=kind:est:client" }, { id: ines });
    const recentes = await createView({ objectType: TEST_TYPE, name: "Fiches récentes", query: "" }, { id: ines });

    await pinView(ines, clients.id);
    await pinView(ines, recentes.id);
    expect(await names(ines)).toEqual(["Clients parisiens", "Fiches récentes"]);
    /* Un collègue voit la vue dans la liste des vues, mais pas dans sa barre tant qu'il ne l'épingle pas. */
    expect(await listPinnedViews(omar)).toEqual([]);

    /* Chaque épingle porte de quoi ouvrir la liste dans cette vue. */
    expect(await listPinnedViews(ines)).toMatchObject([{ id: clients.id, objectType: TEST_TYPE }, { id: recentes.id }]);

    await reorderPins(ines, [recentes.id, clients.id]);
    expect(await names(ines)).toEqual(["Fiches récentes", "Clients parisiens"]);

    await unpinView(ines, clients.id);
    expect(await names(ines)).toEqual(["Fiches récentes"]);

    /* Refus : une vue inconnue ne s'épingle pas, une vue déjà épinglée ne s'épingle pas deux fois, une vue absente de la barre ne s'en retire pas. */
    await expect(pinView(ines, randomUUID())).rejects.toMatchObject({ status: 404, code: "vue_introuvable" });
    await expect(pinView(ines, recentes.id)).rejects.toMatchObject({ status: 409, code: "deja_epinglee" });
    await expect(unpinView(ines, clients.id)).rejects.toMatchObject({ status: 404, code: "epingle_introuvable" });
  });
});
