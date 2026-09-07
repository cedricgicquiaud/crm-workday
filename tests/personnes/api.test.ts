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

describe("API des personnes — refus 400 (CRM-40, CRM-41, contrat 10)", () => {
  it("refuse (400) une adresse mal formée avant toute écriture, un prénom vide, un LinkedIn qui n'est pas une URL, et la saisie de Profils ou du nom complet", async () => {
    const before = (await db.select({ id: person.id }).from(person)).length;
    const malformed = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Mal", lastName: "Formée", email: "jean.dupont@" }, memberCookie));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "donnees_invalides", fields: { email: "Cette adresse n'est pas valide." } });

    const empty = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "  ", lastName: "Dupont" }, memberCookie));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ fields: { firstName: "« Prénom » est obligatoire." } });

    const linkedin = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Lien", lastName: "Cassé", linkedin: "linkedin.com/in/jean" }, memberCookie));
    expect(linkedin.status).toBe(400);
    expect(await linkedin.json()).toMatchObject({ fields: { linkedin: "Le lien LinkedIn doit être une adresse web (https://…)." } });

    const derived = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Profil", lastName: "Saisi", profiles: "contact" }, memberCookie));
    expect(derived.status).toBe(400);
    expect(await derived.json()).toMatchObject({ error: "champ_derive", fields: { profiles: "« Profils » se déduit des profils attachés et ne se saisit pas." } });
    expect((await db.select({ id: person.id }).from(person)).length).toBe(before);

    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Bien", lastName: "Formée" }, memberCookie));
    const { id } = (await created.json()) as { id: string };
    const patchedProfiles = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { profiles: "contact" }, memberCookie), byId(id));
    expect(patchedProfiles.status).toBe(400);
    expect(await patchedProfiles.json()).toMatchObject({ error: "champ_derive", fields: { profiles: "« Profils » se déduit des profils attachés et ne se saisit pas." } });
    const patchedName = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { name: "Autre Nom" }, memberCookie), byId(id));
    expect(patchedName.status).toBe(400);
    expect(await patchedName.json()).toMatchObject({ error: "champ_derive", fields: { name: "« Nom complet » se déduit du prénom et du nom et ne se saisit pas." } });
    const patchedEmail = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { email: "pas une adresse" }, memberCookie), byId(id));
    expect(patchedEmail.status).toBe(400);
    expect(await patchedEmail.json()).toMatchObject({ fields: { email: "Cette adresse n'est pas valide." } });
    const read = await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id));
    expect(await read.json()).toMatchObject({ name: "Bien Formée", profiles: "aucun", email: null });
  });
});

describe("API des personnes — adresse déjà portée (CRM-40, D19, contrat 9)", () => {
  it("enregistre « Jean.Dupont@Acme.fr » en minuscules et refuse (409) « jean.dupont@acme.fr » à une autre personne, archivée comprise, en la nommant ; le PATCH d'une adresse vers une adresse portée est refusé pareil", async () => {
    const first = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Jean", lastName: "Dupont", email: "Jean.Dupont@Acme.fr" }, memberCookie));
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };
    const read = await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id));
    expect(await read.json()).toMatchObject({ email: "jean.dupont@acme.fr" });

    const before = (await db.select({ id: person.id }).from(person)).length;
    const active = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Jeanne", lastName: "Dupont", email: "jean.dupont@acme.fr" }, memberCookie));
    expect(active.status).toBe(409);
    expect(await active.json()).toMatchObject({ error: "valeur_deja_portee", message: "L'adresse jean.dupont@acme.fr est déjà portée par « Jean Dupont ».", field: "email", existingId: id, existingName: "Jean Dupont", archived: false });
    const spaced = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Jeanne", lastName: "Dupont", email: " JEAN.DUPONT@acme.fr " }, memberCookie));
    expect(spaced.status).toBe(409);
    expect((await db.select({ id: person.id }).from(person)).length).toBe(before);

    const other = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Paul", lastName: "Martin", email: "paul.martin@acme.fr" }, memberCookie));
    const { id: paulId } = (await other.json()) as { id: string };
    const moved = await patchPerson(jsonRequest("PATCH", `/api/personnes/${paulId}`, { email: "Jean.Dupont@Acme.fr" }, memberCookie), byId(paulId));
    expect(moved.status).toBe(409);
    expect(await moved.json()).toMatchObject({ error: "valeur_deja_portee", existingId: id, existingName: "Jean Dupont" });
    const unchanged = await getPerson(jsonRequest("GET", `/api/personnes/${paulId}`, undefined, memberCookie), byId(paulId));
    expect(await unchanged.json()).toMatchObject({ email: "paul.martin@acme.fr" });
    /* Sa propre adresse, autrement écrite, n'est pas un conflit. */
    const same = await patchPerson(jsonRequest("PATCH", `/api/personnes/${paulId}`, { email: "Paul.Martin@Acme.fr" }, memberCookie), byId(paulId));
    expect(same.status).toBe(200);

    await db.update(person).set({ archivedAt: new Date() }).where(eq(person.id, id));
    const archived = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Jeanne", lastName: "Dupont", email: "jean.dupont@acme.fr" }, memberCookie));
    expect(archived.status).toBe(409);
    expect(await archived.json()).toMatchObject({ message: "L'adresse jean.dupont@acme.fr est déjà portée par « Jean Dupont » (fiche archivée).", archived: true });
  });
});

describe("API des personnes — autres adresses (CRM-40, CRM-41, D2, contrat 8 et 9)", () => {
  it("PATCH « Autres emails » enregistre deux adresses normalisées, les relit, les historise ; une adresse mal formée → 400, une adresse portée ailleurs → 409 dans les deux sens ; vider retire tout", async () => {
    await cleanup();
    const created = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Léa", lastName: "Bernard", email: "lea.bernard@acme.fr" }, memberCookie));
    const { id } = (await created.json()) as { id: string };

    const patched = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { otherEmails: "Lea@Perso.fr ; l.bernard@autre.fr, lea.bernard@acme.fr" }, memberCookie), byId(id));
    expect(patched.status).toBe(200);
    /* L'adresse principale répétée n'est pas une autre adresse ; les autres sont normalisées et dédoublonnées. */
    expect(await patched.json()).toMatchObject({ otherEmails: "lea@perso.fr, l.bernard@autre.fr" });
    const read = await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id));
    expect(await read.json()).toMatchObject({ email: "lea.bernard@acme.fr", otherEmails: "lea@perso.fr, l.bernard@autre.fr" });
    const history = await db.select({ field: auditLog.field, oldValue: auditLog.oldValue, newValue: auditLog.newValue }).from(auditLog).where(eq(auditLog.objectId, id));
    expect(history).toContainEqual({ field: "otherEmails", oldValue: null, newValue: "lea@perso.fr, l.bernard@autre.fr" });

    const malformed = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { otherEmails: "lea@perso.fr, pas-une-adresse" }, memberCookie), byId(id));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "donnees_invalides", fields: { otherEmails: "Cette adresse n'est pas valide : pas-une-adresse." } });

    const other = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Tom", lastName: "Petit", email: "Lea@Perso.fr" }, memberCookie));
    expect(other.status).toBe(409);
    expect(await other.json()).toMatchObject({ error: "valeur_deja_portee", message: "L'adresse lea@perso.fr est déjà portée par « Léa Bernard ».", existingId: id });
    const tom = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Tom", lastName: "Petit", email: "tom.petit@acme.fr" }, memberCookie));
    const { id: tomId } = (await tom.json()) as { id: string };
    const stolen = await patchPerson(jsonRequest("PATCH", `/api/personnes/${tomId}`, { otherEmails: "LEA.BERNARD@acme.fr" }, memberCookie), byId(tomId));
    expect(stolen.status).toBe(409);
    expect(await stolen.json()).toMatchObject({ error: "valeur_deja_portee", field: "otherEmails", existingName: "Léa Bernard" });
    expect(await getPerson(jsonRequest("GET", `/api/personnes/${tomId}`, undefined, memberCookie), byId(tomId)).then((r) => r.json())).toMatchObject({ otherEmails: "" });

    const cleared = await patchPerson(jsonRequest("PATCH", `/api/personnes/${id}`, { otherEmails: "" }, memberCookie), byId(id));
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ otherEmails: "" });
    const freed = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Tom", lastName: "Libre", email: "lea@perso.fr" }, memberCookie));
    expect(freed.status).toBe(201);
  });
});
