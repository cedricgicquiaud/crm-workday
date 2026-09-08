import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-archivage@exemple.fr", firstName: "Nadia", lastName: "Fabre", password: "MotDePasse-Archivage-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: memberId });

describe("archivage d'une fiche (CRM-61, contrat 30, D21)", () => {
  it("pose la date d'archivage, écrit une entrée « archivée » signée, et refuse (409) d'archiver une fiche déjà archivée", async () => {
    const created = await newCompany("Fonderie Vasseur");

    const archived = await archiveRecord("company", created.id, { id: memberId });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect((await getObjectRecord("company", created.id)).archivedAt).toBeInstanceOf(Date);

    const history = await listHistory("company", created.id);
    expect(history.map((entry) => entry.action)).toEqual(["archivee", "creee"]);
    expect(history[0]).toMatchObject({ field: null, oldValue: null, newValue: null, author: { id: memberId, name: "Nadia Fabre" } });

    await expect(archiveRecord("company", created.id, { id: memberId })).rejects.toMatchObject({ status: 409, code: "deja_archivee" });
    expect((await listHistory("company", created.id)).filter((entry) => entry.action === "archivee")).toHaveLength(1);
  });

  it("refuse (404) d'archiver une fiche inconnue", async () => {
    await expect(archiveRecord("company", "11111111-1111-1111-1111-111111111111", { id: memberId })).rejects.toMatchObject({ status: 404 });
  });
});
