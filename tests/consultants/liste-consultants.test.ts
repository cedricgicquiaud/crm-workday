import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/features/objects/manifest.server";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { parisDay } from "@/features/activities/overdue";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listForState } from "@/features/lists/apply-filters";
import { columnsOf } from "@/features/lists/columns";
import { listUrl, parseListState } from "@/features/lists/url-state";
import { getObject } from "@/features/objects/registry";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const LIST = "consultants";

const MEMBER = { email: "membre-liste-filtrable@exemple.fr", firstName: "Hugo", lastName: "Vasseur", password: "MotDePasse-Filtrable-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

/** Le jour civil de Paris décalé de `days` jours, en `AAAA-MM-JJ`. */
function dayFromToday(days: number): string {
  const noon = new Date(`${parisDay()}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/** Crée une personne et, si on lui en donne un, son profil consultant par l'API du profil. */
async function seed(firstName: string, profile: Record<string, unknown> | null): Promise<string> {
  const created = await createObject("person", { firstName, lastName: "Liste" }, { id: memberId });
  if (profile) {
    const res = await patchConsultant(jsonRequest("PATCH", `/api/personnes/${created.id}/profil-consultant`, profile, memberCookie), byId(created.id));
    expect(res.status).toBe(200);
  }
  return created.id;
}

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
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);

  /*
   * Cinq consultants, un par case du rang (D6), et une personne sans profil :
   * Rémi salarié disponible (à replacer), Dina freelance disponible à date passée, Léo salarié en
   * mission dans vingt jours, Marc freelance en mission dans soixante, Iris portée indisponible.
   */
  await seed("Rémi", { status: "salarie", modules: ["hcm"], certifiedModules: ["hcm"] });
  await seed("Dina", { status: "freelance", modules: ["hcm", "integration"], certifiedModules: ["hcm"], availableFrom: dayFromToday(-3) });
  await seed("Léo", { status: "salarie", modules: ["integration"], availableFrom: dayFromToday(20) });
  await seed("Marc", { status: "freelance", modules: ["payroll"], availableFrom: dayFromToday(60) });
  await seed("Iris", { status: "portage", availableFrom: dayFromToday(-10), unavailable: "oui", unavailableReason: "congé parental" });
  await seed("Simple", null);
});

afterAll(async () => {
  await cleanup();
  await db.delete(user).where(eq(user.email, MEMBER.email));
  await closeDb();
});

/** Prénoms des consultants que la liste rend pour cette adresse, dans l'ordre de la liste. */
async function shown(query: string): Promise<string[]> {
  const state = parseListState(LIST, new URLSearchParams(query));
  const records = await listObjectRecords("person", { includeArchived: state.includeArchived });
  return listForState(LIST, records, state).map((record) => String(record.firstName));
}

/** Libellés des colonnes d'un état de liste, la colonne titre en tête, comme l'en-tête du tableau les montre. */
function headers(query: string): string[] {
  const columns = columnsOf(LIST);
  const title = columns.find((column) => column.key === getObject("person").titleField)!;
  return [title.label, ...parseListState(LIST, new URLSearchParams(query)).columns.map((key) => columns.find((column) => column.key === key)!.label)];
}

/** Contrat 14 (D10) : ce que la liste « Consultants » montre sans rien régler. */
describe("colonnes par défaut de la liste « Consultants » (CRM-86, contrat 14)", () => {
  it("montre Nom, Statut, Modules, Coût journalier, État, Responsable et Modifiée le", () => {
    expect(headers("")).toEqual(["Nom complet", "Statut", "Modules", "Coût journalier", "État", "Responsable", "Modifiée le"]);
  });
});

/** Contrat 14 (D11) : les filtres d'un ensemble cherchent une valeur que la fiche porte, entière. */
describe("filtres de la liste « Consultants » (CRM-86, contrat 14)", () => {
  it("« Modules contient Integration » ne garde que ceux qui ont ce module", async () => {
    expect((await shown("f=modules:contient:integration")).sort()).toEqual(["Dina", "Léo"]);
  });

  it("« Certifié sur contient HCM » ne garde que ceux certifiés HCM", async () => {
    expect((await shown("f=certifiedModules:contient:hcm")).sort()).toEqual(["Dina", "Rémi"]);
  });

  it("« État est disponible » ramène les disponibles, et « État est indisponible » laisse dehors un consultant à date passée", async () => {
    expect((await shown("f=state:est:disponible")).sort()).toEqual(["Dina", "Rémi"]);
    expect((await shown("f=state:est:en_mission")).sort()).toEqual(["Léo", "Marc"]);
    /* Dina a une date passée sans la case : elle est disponible, pas indisponible. */
    expect(await shown("f=state:est:indisponible")).toEqual(["Iris"]);
  });
});

/** Contrat 14 (D6) : le tri sur l'état suit le rang du métier ; l'alphabet mettrait « Disponible » (Dina) avant « Disponible · à replacer » (Rémi). */
describe("tri de la liste « Consultants » sur l'état (CRM-86, contrat 14)", () => {
  it("range à replacer, puis disponibles, puis en mission par date de retour croissante, puis indisponibles", async () => {
    expect(await shown("tri=state:asc")).toEqual(["Rémi", "Dina", "Léo", "Marc", "Iris"]);
  });
});

/** Contrat 14 (D18) : l'adresse porte tout l'état ; rouverte ailleurs (un autre onglet ne lit que l'adresse), elle rend la même liste. */
describe("adresse de la liste « Consultants » (CRM-86, contrat 14)", () => {
  it("écrit filtres, tri et colonnes dans l'URL, et la même adresse rouverte rend le même état et les mêmes fiches", async () => {
    const state = parseListState(LIST, new URLSearchParams("f=modules:contient:hcm&f=state:est:disponible&tri=state:asc&colonnes=state,status"));
    const url = listUrl(LIST, state);
    expect(url).toBe("/consultants?f=modules%3Acontient%3Ahcm&f=state%3Aest%3Adisponible&tri=state%3Aasc&colonnes=state%2Cstatus");

    const reopened = parseListState(LIST, new URL(url, "http://localhost").searchParams);
    expect(reopened).toEqual(state);
    expect(await shown(new URL(url, "http://localhost").search.slice(1))).toEqual(["Rémi", "Dina"]);
  });
});
