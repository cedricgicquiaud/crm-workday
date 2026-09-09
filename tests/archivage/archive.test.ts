import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, user } from "@/db/schema";
import { archiveRecord, restoreRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { getServerObject } from "@/features/objects/registry.server";
import { createObject, getObjectRecord, listObjectRecords, listRecordOptions } from "@/features/objects/service";
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

describe("restauration d'une fiche (CRM-61, contrat 30, D21)", () => {
  it("ramène la fiche telle qu'elle était, écrit une entrée « restaurée » signée, et refuse (409) de restaurer une fiche qui n'est pas archivée", async () => {
    const created = await newCompany("Ateliers Mireille");
    await expect(restoreRecord("company", created.id, { id: memberId })).rejects.toMatchObject({ status: 409, code: "non_archivee" });

    await archiveRecord("company", created.id, { id: memberId });
    const restored = await restoreRecord("company", created.id, { id: memberId });
    expect(restored.archivedAt).toBeNull();
    expect(restored).toMatchObject({ name: "Ateliers Mireille", type: "client", ownerId: memberId });
    expect((await getObjectRecord("company", created.id)).archivedAt).toBeNull();

    const history = await listHistory("company", created.id);
    expect(history.map((entry) => entry.action)).toEqual(["restauree", "archivee", "creee"]);
    expect(history[0]).toMatchObject({ field: null, author: { id: memberId } });
  });
});

describe("une fiche archivée sort des listes, des sélecteurs et de la palette (CRM-61, contrat 30)", () => {
  it("la retire de la liste par défaut, des options d'un sélecteur et de la recherche, et le filtre « archivées » la ramène ; la restauration la rend partout", async () => {
    const created = await newCompany("Verrerie Alazard");
    const ids = () => listObjectRecords("company").then((records) => records.map((record) => record.id));
    const options = () => listRecordOptions("company").then((records) => records.map((record) => record.id));
    const hits = () => getServerObject("company").search("Alazard").then((found) => found.map((hit) => hit.id));
    expect(await ids()).toContain(created.id);

    await archiveRecord("company", created.id, { id: memberId });
    expect(await ids()).not.toContain(created.id);
    expect(await options()).not.toContain(created.id);
    expect(await hits()).toEqual([]);
    expect((await listObjectRecords("company", { includeArchived: true })).map((record) => record.id)).toContain(created.id);

    await restoreRecord("company", created.id, { id: memberId });
    expect(await ids()).toContain(created.id);
    expect(await options()).toContain(created.id);
    expect(await hits()).toEqual([created.id]);
  });
});
