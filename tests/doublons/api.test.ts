import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as doublons } from "@/app/api/objets/[type]/doublons/route";
import { auditLog, company, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-doublons-api@exemple.fr", firstName: "Yann", lastName: "Ferrand", password: "MotDePasse-Doublons-API-1", role: "membre" as const };

const UNKNOWN = "11111111-1111-1111-1111-111111111111";

let memberId: string;
let memberCookie: string;

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

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: memberId });

/** GET /api/objets/<type>/doublons?<recherche> — la fiche par `fiche=`, un nom candidat par ses champs. */
const call = (type: string, query: string, cookie?: string) => doublons(jsonRequest("GET", `/api/objets/${type}/doublons?${query}`, undefined, cookie), { params: Promise.resolve({ type }) });

describe("API des doublons probables (CRM-58, CRM-60, contrat 28)", () => {
  it("rend les fiches que le nom saisi rejoindrait, et rien pour un nom qui ne ressemble à aucune", async () => {
    const acme = await newCompany("Acme");

    const found = await call("company", `name=${encodeURIComponent("ACME SAS")}`, memberCookie);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ duplicates: [{ id: acme.id, title: "Acme" }] });

    const alone = await call("company", `name=${encodeURIComponent("Acmé Conseil")}`, memberCookie);
    expect(await alone.json()).toEqual({ duplicates: [] });
  });

  it("rend les doublons d'une fiche existante, sans jamais la compter elle-même", async () => {
    const solveige = await newCompany("Banque Solveige");
    const jumelle = await newCompany("Banque Solveige SA");

    const res = await call("company", `fiche=${solveige.id}`, memberCookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicates: [{ id: jumelle.id, title: "Banque Solveige SA" }] });
  });

  it("refuse 401 sans session, et 404 sur un type ou une fiche inconnus", async () => {
    const created = await newCompany("Presses Aubry");

    expect((await call("company", `fiche=${created.id}`)).status).toBe(401);
    expect((await call("objet_inconnu", "name=Acme", memberCookie)).status).toBe(404);
    expect((await call("company", `fiche=${UNKNOWN}`, memberCookie)).status).toBe(404);
  });
});
