import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as archiver } from "@/app/api/objets/[type]/[id]/archiver/route";
import { POST as restaurer } from "@/app/api/objets/[type]/[id]/restaurer/route";
import { auditLog, company, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-archivage-api@exemple.fr", firstName: "Sofia", lastName: "Merle", password: "MotDePasse-Archivage-API-1", role: "membre" as const };

const UNKNOWN = "11111111-1111-1111-1111-111111111111";

let memberId: string;
let memberCookie: string;

const at = (type: string, id: string) => ({ params: Promise.resolve({ type, id }) });

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
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
