import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory, recordHistory } from "@/features/history/history";
import { closeDb, db } from "@/lib/db";

const AUTHOR = { email: "auteur-historique@exemple.fr", firstName: "Hugo", lastName: "Martin", password: "MotDePasse-Historique-1", role: "membre" as const };
const TYPE = "test_object";

let authorId: string;

beforeAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.objectType, TYPE));
  await db.delete(user).where(eq(user.email, AUTHOR.email));
  authorId = (await createUserWithPassword(AUTHOR)).id;
});
afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.objectType, TYPE));
  await closeDb();
});

/** D12, CRM-33 : l'historique est un mécanisme commun, il ne connaît que la clé d'objet du registre. */
describe("historique des changements (CRM-33, D12)", () => {
  it("rend à un objet de test ses entrées, la plus récente d'abord, chacune avec son auteur nommé et sa date", async () => {
    const objectId = randomUUID();
    await recordHistory([{ objectType: TYPE, objectId, action: "creee", authorId }]);
    await recordHistory([{ objectType: TYPE, objectId, action: "modifiee", field: "name", oldValue: "Avant", newValue: "Après", authorId }]);

    const entries = await listHistory(TYPE, objectId);
    expect(entries.map((e) => e.action)).toEqual(["modifiee", "creee"]);
    expect(entries[0]).toMatchObject({ field: "name", oldValue: "Avant", newValue: "Après", author: { id: authorId, name: "Hugo Martin" } });
    expect(entries.every((e) => e.createdAt instanceof Date)).toBe(true);
  });
});
