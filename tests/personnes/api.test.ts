import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getPerson, PATCH as patchPerson } from "@/app/api/personnes/[id]/route";
import { GET as listPersons, POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-personnes@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Personnes-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(person);
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

describe("API des personnes — création (CRM-40, contrat 8)", () => {
  it("un membre crée une personne avec prénom et nom seuls (201) et la relit : Profils « aucun », aucune adresse, aucune entreprise, il en est le créateur et le responsable", async () => {
    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Jean", lastName: "Dupont" }, memberCookie));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const read = await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ id, firstName: "Jean", lastName: "Dupont", name: "Jean Dupont", email: null, otherEmails: "", profiles: "aucun", companyId: null, ownerId: memberId, createdBy: memberId, archivedAt: null });
  });

  it("répond 401 sans session sur la liste, la création et la modification, et 404 pour une personne inconnue ou un identifiant qui n'est pas un UUID", async () => {
    expect((await listPersons(jsonRequest("GET", "/api/personnes"))).status).toBe(401);
    expect((await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Anonyme", lastName: "Sans session" }))).status).toBe(401);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await patchPerson(jsonRequest("PATCH", `/api/personnes/${unknown}`, { phone: "01" }), byId(unknown))).status).toBe(401);
    const missing = await getPerson(jsonRequest("GET", `/api/personnes/${unknown}`, undefined, memberCookie), byId(unknown));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: "fiche_introuvable" });
    expect((await patchPerson(jsonRequest("PATCH", `/api/personnes/${unknown}`, { phone: "01" }, memberCookie), byId(unknown))).status).toBe(404);
    expect((await getPerson(jsonRequest("GET", "/api/personnes/abc", undefined, memberCookie), byId("abc"))).status).toBe(404);
  });
});

describe("API des personnes — liste (CRM-41, D6)", () => {
  it("liste les personnes non archivées par dernière modification décroissante : une fiche modifiée remonte en tête, avec son champ Profils", async () => {
    await cleanup();
    const ids: string[] = [];
    for (const lastName of ["Ancienne", "Moyenne", "Récente"]) {
      const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Liste", lastName }, memberCookie));
      ids.push(((await res.json()) as { id: string }).id);
    }
    const patched = await patchPerson(jsonRequest("PATCH", `/api/personnes/${ids[0]}`, { phone: "06 12 34 56 78" }, memberCookie), byId(ids[0]));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: ids[0], phone: "06 12 34 56 78" });
    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, ids[1]));

    const list = await listPersons(jsonRequest("GET", "/api/personnes", undefined, memberCookie));
    expect(list.status).toBe(200);
    const { persons } = (await list.json()) as { persons: { name: string; profiles: string }[] };
    expect(persons.map((p) => p.name)).toEqual(["Liste Ancienne", "Liste Récente"]);
    expect(persons.every((p) => p.profiles === "aucun")).toBe(true);
  });
});
