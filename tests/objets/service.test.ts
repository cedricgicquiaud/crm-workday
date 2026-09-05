import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const ACTOR = { email: "acteur-service@exemple.fr", firstName: "Nora", lastName: "Blanc", password: "MotDePasse-Service-1", role: "membre" as const };

let actorId: string;

/** Les fiches créées ici portent des clés étrangères vers `user` : on les efface avant de rendre la base aux autres tests. */
async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, ACTOR.email));
  actorId = (await createUserWithPassword(ACTOR)).id;
});
afterAll(async () => {
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
