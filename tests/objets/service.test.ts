import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { createObject, updateObject } from "@/features/objects/service";
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
