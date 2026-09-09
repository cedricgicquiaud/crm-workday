import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as archiver } from "@/app/api/objets/[type]/[id]/archiver/route";
import { DELETE as supprimer } from "@/app/api/objets/[type]/[id]/route";
import { POST as restaurer } from "@/app/api/objets/[type]/[id]/restaurer/route";
import { activity, auditLog, company, contactProfile, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-archivage-api@exemple.fr", firstName: "Sofia", lastName: "Merle", password: "MotDePasse-Archivage-API-1", role: "membre" as const };
const ADMIN = { email: "admin-archivage-api@exemple.fr", firstName: "Yann", lastName: "Delaunay", password: "MotDePasse-Archivage-API-2", role: "administrateur" as const };

const UNKNOWN = "11111111-1111-1111-1111-111111111111";

let memberId: string;
let memberCookie: string;
let adminCookie: string;

const at = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(contactProfile);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  for (const account of [MEMBER, ADMIN]) await db.delete(user).where(eq(user.email, account.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  await createUserWithPassword(ADMIN);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: memberId });

const call = (handler: typeof archiver, action: string, type: string, id: string, cookie?: string) => handler(jsonRequest("POST", `/api/objets/${type}/${id}/${action}`, undefined, cookie), at(type, id));

describe("API d'archivage (CRM-61, contrat 30, D21)", () => {
  it("un membre archive une fiche (200, date d'archivage rendue) puis la restaure (200, date effacée)", async () => {
    const created = await newCompany("Papeterie Vidal");

    const archived = await call(archiver, "archiver", "company", created.id, memberCookie);
    expect(archived.status).toBe(200);
    expect(await archived.json()).toMatchObject({ id: created.id, archivedAt: expect.any(String) });

    const restored = await call(restaurer, "restaurer", "company", created.id, memberCookie);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ id: created.id, archivedAt: null });
  });

  it("refuse 401 sans session, 404 sur un type ou une fiche inconnus, 409 sur un geste déjà fait", async () => {
    const created = await newCompany("Presses Ollier");

    expect((await call(archiver, "archiver", "company", created.id)).status).toBe(401);
    expect((await call(archiver, "archiver", "objet_inconnu", created.id, memberCookie)).status).toBe(404);
    expect((await call(archiver, "archiver", "company", UNKNOWN, memberCookie)).status).toBe(404);
    expect((await call(restaurer, "restaurer", "company", created.id, memberCookie)).status).toBe(409);

    expect((await call(archiver, "archiver", "company", created.id, memberCookie)).status).toBe(200);
    const twice = await call(archiver, "archiver", "company", created.id, memberCookie);
    expect(twice.status).toBe(409);
    expect(await twice.json()).toMatchObject({ error: "deja_archivee" });
  });
});

const remove = (type: string, id: string, cookie?: string) => supprimer(jsonRequest("DELETE", `/api/objets/${type}/${id}`, undefined, cookie), at(type, id));

describe("API de suppression définitive (CRM-62, CRM-63, contrat 31)", () => {
  it("un administrateur supprime une fiche sans lien (200) et elle devient introuvable", async () => {
    const created = await newCompany("Presses Delcourt");
    const removed = await remove("company", created.id, adminCookie);
    expect(removed.status).toBe(200);
    await expect(getObjectRecord("company", created.id)).rejects.toMatchObject({ status: 404 });
  });

  it("refuse 401 sans session, 403 à un membre, 404 sur une fiche inconnue", async () => {
    const created = await newCompany("Presses Gardées");
    expect((await remove("company", created.id)).status).toBe(401);

    const refused = await remove("company", created.id, memberCookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: "reserve_aux_administrateurs" });
    expect((await getObjectRecord("company", created.id)).id).toBe(created.id);

    expect((await remove("company", UNKNOWN, adminCookie)).status).toBe(404);
  });

  it("refuse (409) une fiche retenue et rend la liste de ce qui la retient", async () => {
    const held = await newCompany("Presses Retenues");
    await createActivity("company", held.id, { type: "note", body: "Compte rendu" }, { id: memberId });

    const refused = await remove("company", held.id, adminCookie);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "fiche_liee", blockers: [{ key: "activites", label: "Activités", count: 1 }] });
  });
});
