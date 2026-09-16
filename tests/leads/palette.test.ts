import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, lead, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { discardLead, updateLead } from "@/features/leads/leads";
import { createObject } from "@/features/objects/service";
import { search } from "@/features/search/search";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-palette-lead@exemple.fr", firstName: "Rémi", lastName: "Lagarde", password: "MotDePasse-Palette-1", role: "membre" as const };

let memberId: string;

const createLead = async (input: Record<string, unknown>) => (await createObject("lead", input, { id: memberId })).id;
const leadHits = async (query: string) => (await search(query)).filter((hit) => hit.type === "lead");

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(lead);
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

/** D12, contrat 7 : la palette retrouve un lead en cours ou écarté, jamais un converti ni un archivé. */
describe("un lead dans la palette ⌘K (CRM-93, D12, contrat 7)", () => {
  it("retrouve un lead qualifié par une sous-chaîne de son titre, sous-titré « Qualifié · LinkedIn », et mène à sa fiche", async () => {
    const id = await createLead({ firstName: "Julie", lastName: "Martin", companyName: "Banque Xénia", origin: "linkedin" });
    await updateLead(id, { stage: "qualifie" }, { id: memberId });
    expect(await leadHits("banq")).toEqual([{ type: "lead", id, title: "Julie Martin · Banque Xénia", subtitle: "Qualifié · LinkedIn", href: `/leads/${id}` }]);
  });

  it("retrouve un lead par une sous-chaîne de son email", async () => {
    const id = await createLead({ companyName: "Assurances Pélican", email: "contact@pelican-assurances.fr", origin: "partenaire" });
    expect((await leadHits("pelican-assu")).map((hit) => hit.id)).toEqual([id]);
  });

  it("suit le changement du nom d'entreprise", async () => {
    const id = await createLead({ firstName: "Paul", lastName: "Durand", companyName: "Mutuelle Orme", origin: "autre" });
    await updateLead(id, { companyName: "Mutuelle Chêne" }, { id: memberId });
    expect((await leadHits("mutuelle")).map((hit) => hit.title)).toEqual(["Paul Durand · Mutuelle Chêne"]);
  });

  it("garde un lead écarté, et exclut un lead converti ou archivé", async () => {
    const discarded = await createLead({ companyName: "Groupe Écarté Zinnia", origin: "autre" });
    await discardLead(discarded, { id: memberId });
    const converted = await createLead({ companyName: "Groupe Converti Zinnia", origin: "autre" });
    await db.update(lead).set({ stage: "converti", convertedAt: new Date() }).where(eq(lead.id, converted));
    const archived = await createLead({ companyName: "Groupe Archivé Zinnia", origin: "autre" });
    await db.update(lead).set({ archivedAt: new Date() }).where(eq(lead.id, archived));

    const hits = await leadHits("zinnia");
    expect(hits.map((hit) => hit.id)).toEqual([discarded]);
    expect(hits[0].subtitle).toBe("Écarté · Autre");
  });
});
