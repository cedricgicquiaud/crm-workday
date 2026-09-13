import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as apercu, POST as fusionner } from "@/app/api/objets/[type]/fusion/route";
import { activity, auditLog, company, contactProfile, objectRedirect, person, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject, getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const ADMIN = { email: "admin-fusion-api@exemple.fr", firstName: "Ada", lastName: "Roche", password: "MotDePasse-Fusion-API-1", role: "administrateur" as const };
const MEMBER = { email: "membre-fusion-api@exemple.fr", firstName: "Marc", lastName: "Leroy", password: "MotDePasse-Fusion-API-2", role: "membre" as const };

const UNKNOWN = "11111111-1111-1111-1111-111111111111";

let adminId: string;
let adminCookie: string;
let memberCookie: string;

async function cleanup() {
  await db.delete(objectRedirect);
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(contactProfile);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(inArray(user.email, [ADMIN.email, MEMBER.email]));
  adminId = (await createUserWithPassword(ADMIN)).id;
  await createUserWithPassword(MEMBER);
  adminCookie = await sessionCookie(ADMIN.email, ADMIN.password);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: adminId });

const at = (type: string) => ({ params: Promise.resolve({ type }) });
const preview = (type: string, query: string, cookie?: string) => apercu(jsonRequest("GET", `/api/objets/${type}/fusion?${query}`, undefined, cookie), at(type));
const merge = (type: string, body: unknown, cookie?: string) => fusionner(jsonRequest("POST", `/api/objets/${type}/fusion`, body, cookie), at(type));

describe("API de fusion (CRM-59, contrats 29, 31 et 32)", () => {
  it("annonce à un administrateur ce qui sera déplacé, puis fusionne : l'absorbée disparaît et son adresse mène à la conservée", async () => {
    const kept = await newCompany("Acme");
    const absorbed = await newCompany("ACME SAS");
    await createActivity("company", absorbed.id, { type: "note", body: "Premier rendez-vous" }, { id: adminId });

    const announced = await preview("company", `keptId=${kept.id}&absorbedId=${absorbed.id}`, adminCookie);
    expect(announced.status).toBe(200);
    expect(await announced.json()).toMatchObject({ moved: [{ key: "activites", label: "Activités", count: 1 }, { key: "historique", label: "Historique", count: 1 }] });

    const merged = await merge("company", { keptId: kept.id, absorbedId: absorbed.id }, adminCookie);
    expect(merged.status).toBe(200);
    expect(await merged.json()).toMatchObject({ id: kept.id, name: "Acme" });
    expect(await db.select().from(company).where(eq(company.id, absorbed.id))).toEqual([]);
    expect((await getObjectRecord("company", absorbed.id)).id).toBe(kept.id);
  });

  it("garde la valeur d'un champ pris à l'absorbée quand l'appel la demande", async () => {
    const kept = await newCompany("Fonderie Bertin");
    const absorbed = await createObject("company", { name: "Fonderie Bertin SARL", type: "client", city: "Lyon" }, { id: adminId });

    const merged = await merge("company", { keptId: kept.id, absorbedId: absorbed.id, take: ["city"] }, adminCookie);
    expect(merged.status).toBe(200);
    expect(await merged.json()).toMatchObject({ city: "Lyon" });
  });

  it("refuse 401 sans session et 403 à un membre : cacher la commande n'est jamais la protection (contrat 31)", async () => {
    const kept = await newCompany("Presses Aubry");
    const absorbed = await newCompany("Presses Aubry SAS");

    expect((await merge("company", { keptId: kept.id, absorbedId: absorbed.id })).status).toBe(401);
    const refused = await merge("company", { keptId: kept.id, absorbedId: absorbed.id }, memberCookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: "reserve_aux_administrateurs" });
    expect((await preview("company", `keptId=${kept.id}&absorbedId=${absorbed.id}`, memberCookie)).status).toBe(403);

    /* Rien n'a bougé : la fiche absorbée est toujours là. */
    expect((await getObjectRecord("company", absorbed.id)).id).toBe(absorbed.id);
  });

  it("refuse 400 de fusionner une fiche avec elle-même, et une personne avec une entreprise (contrat 32)", async () => {
    const alone = await newCompany("Papeterie Vidal");
    const someone = await createObject("person", { firstName: "Claire", lastName: "Bonnet" }, { id: adminId });

    const itself = await merge("company", { keptId: alone.id, absorbedId: alone.id }, adminCookie);
    expect(itself.status).toBe(400);
    expect(await itself.json()).toMatchObject({ error: "meme_fiche" });

    const crossed = await merge("company", { keptId: alone.id, absorbedId: someone.id, absorbedType: "person" }, adminCookie);
    expect(crossed.status).toBe(400);
    expect(await crossed.json()).toMatchObject({ error: "types_differents" });
    expect((await getObjectRecord("person", someone.id)).id).toBe(someone.id);
  });

  it("refuse 400 sur un appel sans les deux fiches, 404 sur un type ou une fiche inconnus, 409 sur une fiche archivée", async () => {
    const kept = await newCompany("Charpentes Ollivier");
    const absorbed = await newCompany("Charpentes Ollivier SAS");

    expect((await merge("company", { keptId: kept.id }, adminCookie)).status).toBe(400);
    expect((await merge("objet_inconnu", { keptId: kept.id, absorbedId: absorbed.id }, adminCookie)).status).toBe(404);
    expect((await merge("company", { keptId: kept.id, absorbedId: UNKNOWN }, adminCookie)).status).toBe(404);

    await archiveRecord("company", absorbed.id, { id: adminId });
    const archived = await merge("company", { keptId: kept.id, absorbedId: absorbed.id }, adminCookie);
    expect(archived.status).toBe(409);
    expect(await archived.json()).toMatchObject({ error: "fiche_archivee" });
  });
});
