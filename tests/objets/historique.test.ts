import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchCompany } from "@/app/api/entreprises/[id]/route";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { DELETE as deleteHistory, GET as getHistory, PATCH as patchHistory } from "@/app/api/objets/[type]/[id]/historique/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory, recordHistory } from "@/features/history/history";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const AUTHOR = { email: "auteur-historique@exemple.fr", firstName: "Hugo", lastName: "Martin", password: "MotDePasse-Historique-1", role: "membre" as const };
const TYPE = "test_object";

let authorId: string;

beforeAll(async () => {
  await db.delete(auditLog);
  await db.delete(company);
  await db.delete(user).where(eq(user.email, AUTHOR.email));
  authorId = (await createUserWithPassword(AUTHOR)).id;
});
afterAll(async () => {
  await db.delete(auditLog);
  await db.delete(company);
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

describe("API générique de l'historique (CRM-36, contrat 15, D24)", () => {
  it("GET rend les entrées d'une fiche, chacune avec auteur et date ; PATCH et DELETE répondent 405 ; un type inconnu ou un identifiant qui n'est pas un UUID 404 ; sans session 401", async () => {
    const cookie = await sessionCookie(AUTHOR.email, AUTHOR.password);
    const created = await postCompany(jsonRequest("POST", "/api/entreprises", { name: "Historique SAS", type: "client" }, cookie));
    const { id } = (await created.json()) as { id: string };
    await patchCompany(jsonRequest("PATCH", `/api/entreprises/${id}`, { billingEmail: "compta@historique.fr" }, cookie), { params: Promise.resolve({ id }) });

    const context = { params: Promise.resolve({ type: "company", id }) };
    const res = await getHistory(jsonRequest("GET", `/api/objets/company/${id}/historique`, undefined, cookie), context);
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as { entries: { action: string; field: string | null; oldValue: string | null; newValue: string | null; createdAt: string; author: { name: string } | null }[] };
    expect(entries.map((e) => e.action)).toEqual(["modifiee", "creee"]);
    expect(entries[0]).toMatchObject({ field: "billingEmail", oldValue: null, newValue: "compta@historique.fr" });
    expect(entries.every((e) => e.author?.name === "Hugo Martin" && !Number.isNaN(Date.parse(e.createdAt)))).toBe(true);

    for (const handler of [patchHistory, deleteHistory]) {
      const refused = await handler(jsonRequest("PATCH", `/api/objets/company/${id}/historique`, { oldValue: "x" }, cookie), context);
      expect(refused.status).toBe(405);
      expect(refused.headers.get("allow")).toBe("GET");
    }
    expect((await getHistory(jsonRequest("GET", `/api/objets/inconnu/${id}/historique`, undefined, cookie), { params: Promise.resolve({ type: "inconnu", id }) })).status).toBe(404);
    const notUuid = await getHistory(jsonRequest("GET", "/api/objets/company/abc/historique", undefined, cookie), { params: Promise.resolve({ type: "company", id: "abc" }) });
    expect(notUuid.status).toBe(404);
    expect(await notUuid.json()).toMatchObject({ error: "fiche_introuvable" });
    expect((await getHistory(jsonRequest("GET", `/api/objets/company/${id}/historique`), context)).status).toBe(401);
  });
});
