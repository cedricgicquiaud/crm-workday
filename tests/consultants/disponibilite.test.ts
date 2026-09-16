import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { GET as getPerson } from "@/app/api/personnes/[id]/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { parisDay } from "@/features/activities/overdue";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listHistory } from "@/features/history/history";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-disponibilite@exemple.fr", firstName: "Inès", lastName: "Morel", password: "MotDePasse-Disponible-1", role: "membre" as const };

let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

/** Le jour civil de Paris décalé de `days` jours, en `AAAA-MM-JJ` : « dans quinze jours », « hier ». */
function dayFromToday(days: number): string {
  const noon = new Date(`${parisDay()}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

async function createConsultant(lastName: string, status: string): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", { firstName: "Test", lastName }, memberCookie));
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  expect((await patchProfile(id, { status })).status).toBe(200);
  return id;
}

const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));
const readPerson = async (id: string) => (await (await getPerson(jsonRequest("GET", `/api/personnes/${id}`, undefined, memberCookie), byId(id))).json()) as Record<string, unknown>;

/** Les enfants avant les parents : les clés étrangères de ces tables sont sans cascade côté personne. */
async function cleanup() {
  await db.delete(consultantModule);
  await db.delete(consultantProfile);
  await db.delete(auditLog);
  await db.delete(person);
  await db.delete(company);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await createUserWithPassword(MEMBER);
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * Contrat 11 (D6) : l'état se déduit à chaque lecture de la date et de la case ; il n'est jamais
 * enregistré. On le lit par l'API de la personne, comme la liste et la fiche le lisent.
 */
describe("état d'un consultant lu sur sa fiche (CRM-85, contrat 11)", () => {
  it("passe « en mission » quand la date est dans quinze jours, puis « disponible » quand elle est hier", async () => {
    const id = await createConsultant("Quinze", "freelance");
    expect((await patchProfile(id, { availableFrom: dayFromToday(15) })).status).toBe(200);
    expect(await readPerson(id)).toMatchObject({ state: "en_mission" });

    expect((await patchProfile(id, { availableFrom: dayFromToday(-1) })).status).toBe(200);
    expect(await readPerson(id)).toMatchObject({ state: "disponible" });
  });

  it("passe « indisponible » quelle que soit la date quand la case est cochée, efface le motif au décochage, et écrit une ligne d'historique par champ", async () => {
    const id = await createConsultant("Parental", "salarie");
    expect((await patchProfile(id, { availableFrom: dayFromToday(15) })).status).toBe(200);
    expect((await patchProfile(id, { unavailable: "oui", unavailableReason: "congé parental" })).status).toBe(200);
    expect(await readPerson(id)).toMatchObject({ state: "indisponible", unavailableReason: "congé parental" });

    expect((await patchProfile(id, { unavailable: "non" })).status).toBe(200);
    expect(await readPerson(id)).toMatchObject({ state: "en_mission", unavailable: "non", unavailableReason: null });

    const lines = (await listHistory("person", id)).filter((entry) => entry.action === "modifiee" && ["availableFrom", "unavailable", "unavailableReason"].includes(entry.field ?? ""));
    expect(lines.map((entry) => `${entry.field}: ${entry.oldValue} → ${entry.newValue}`).sort()).toEqual(
      [`availableFrom: null → ${dayFromToday(15)}`, "unavailable: non → oui", "unavailable: oui → non", "unavailableReason: null → congé parental", "unavailableReason: congé parental → null"].sort(),
    );
  });
});
