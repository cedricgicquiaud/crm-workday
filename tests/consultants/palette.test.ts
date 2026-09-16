import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as patchConsultant } from "@/app/api/personnes/[id]/profil-consultant/route";
import { PATCH as patchContact } from "@/app/api/personnes/[id]/profil-contact/route";
import { POST as postPerson } from "@/app/api/personnes/route";
import { auditLog, company, consultantModule, consultantProfile, person, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createObject } from "@/features/objects/service";
import { CREATE_PARAM } from "@/features/objects/palette-entries";
import { search } from "@/features/search/search";
import { getPaletteEntries } from "@/features/shell/palette/registry";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-palette-consultant@exemple.fr", firstName: "Iris", lastName: "Payet", password: "MotDePasse-Palette-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let acmeId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

const patchProfile = (id: string, input: Record<string, unknown>) => patchConsultant(jsonRequest("PATCH", `/api/personnes/${id}/profil-consultant`, input, memberCookie), byId(id));

async function createPerson(input: Record<string, unknown>): Promise<string> {
  const res = await postPerson(jsonRequest("POST", "/api/personnes", input, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const subtitleOf = async (query: string, id: string) => (await search(query)).find((hit) => hit.id === id)?.subtitle;

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
  acmeId = (await createObject("company", { name: "Acme", type: "client" }, { id: memberId })).id;
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

/**
 * D14 : dans la palette, ce qu'on cherche d'un consultant c'est son statut et ses modules. Le profil
 * consultant prime donc sur l'entreprise du profil contact et sur l'adresse email.
 */
describe("sous-titre d'un consultant dans la palette (CRM-82, D14)", () => {
  it("écrit « Freelance · HCM, Integration » plutôt que l'entreprise, même quand la personne est aussi contact", async () => {
    const id = await createPerson({ firstName: "Chloé", lastName: "Dupont", email: "chloe.dupont@acme.fr" });
    expect((await patchContact(jsonRequest("PATCH", `/api/personnes/${id}/profil-contact`, { companyId: acmeId }, memberCookie), byId(id))).status).toBe(200);
    expect(await subtitleOf("dup", id)).toBe("Acme");

    await patchProfile(id, { status: "freelance", modules: ["hcm", "integration"] });
    expect(await subtitleOf("dup", id)).toBe("Freelance · HCM, Integration");
  });

  it("écrit le statut seul quand le consultant ne porte aucun module", async () => {
    const id = await createPerson({ firstName: "Karim", lastName: "Dupuis" });
    await patchProfile(id, { status: "portage" });
    expect(await subtitleOf("dupuis", id)).toBe("Portage");
  });

  it("laisse l'entreprise ou l'adresse aux personnes qui ne sont pas consultantes", async () => {
    const contact = await createPerson({ firstName: "Manon", lastName: "Duprat", email: "manon.duprat@acme.fr" });
    expect(await subtitleOf("duprat", contact)).toBe("manon.duprat@acme.fr");
  });
});

/**
 * D12, frontière F7 : la palette gagne une entrée de création par objet à création rapide, générée
 * depuis le registre. Aucune n'est écrite à la main dans la coque — déclarer un objet demain lui
 * donnera la sienne sans qu'on touche à la palette.
 */
describe("entrées de création de la palette (CRM-84, D12)", () => {
  it("propose une entrée par liste à création rapide, dans l'ordre des listes, et chacune ouvre la création de sa liste", async () => {
    await import("@/features/objects/palette-entries");
    const creations = getPaletteEntries().filter((entry) => entry.id.startsWith("creation-"));
    expect(creations.map((entry) => entry.label)).toEqual(["Nouvelle entreprise", "Nouvelle personne", "Nouveau consultant", "Nouveau lead"]);
    expect(creations.every((entry) => entry.group === "actions")).toBe(true);

    const opened: string[] = [];
    for (const entry of creations) entry.run({ navigate: (href) => opened.push(href), close: () => {} });
    expect(opened).toEqual([`/entreprises?${CREATE_PARAM}=1`, `/personnes?${CREATE_PARAM}=1`, `/consultants?${CREATE_PARAM}=1`, `/leads?${CREATE_PARAM}=1`]);
  });
});
