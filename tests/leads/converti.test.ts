import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postConversion } from "@/app/api/leads/[id]/conversion/route";
import { GET as getLead, PATCH as patchLead } from "@/app/api/leads/[id]/route";
import { POST as postLead } from "@/app/api/leads/route";
import { activity, auditLog, company, customFieldDefinition, customFieldValue, lead, person, user } from "@/db/schema";
import { createActivity, setTaskDone } from "@/features/activities/activities";
import { listFeed } from "@/features/activities/feed";
import { TASK } from "@/features/activities/schema";
import { archiveRecord, restoreRecord } from "@/features/archive/archive";
import { deleteRecord } from "@/features/archive/delete";
import { createUserWithPassword } from "@/features/auth/accounts";
import { createDefinition, loadCustomFields } from "@/features/custom-fields/definitions";
import { customFieldKey } from "@/features/custom-fields/fields-source";
import { collectBanners } from "@/features/objects/banners";
import { visibleActions } from "@/features/objects/registry.server";
import { getObjectRecord } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-lead-converti@exemple.fr", firstName: "Iban", lastName: "Oller", password: "MotDePasse-Converti-1", role: "membre" as const };

let memberCookie: string;
let memberId: string;

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, input: Record<string, unknown>) => patchLead(jsonRequest("PATCH", `/api/leads/${id}`, input, memberCookie), byId(id));
const readLead = async (id: string) => (await getLead(jsonRequest("GET", `/api/leads/${id}`, undefined, memberCookie), byId(id))).json() as Promise<Record<string, unknown>>;

/** Un lead « Julie Martin · Banque X » converti par l'API, avec la personne et l'entreprise créées. */
async function convertedLead(suffix: string): Promise<{ leadId: string; personId: string; companyId: string }> {
  const created = await postLead(jsonRequest("POST", "/api/leads", { firstName: "Julie", lastName: "Martin", companyName: `Banque ${suffix}`, origin: "linkedin" }, memberCookie));
  const { id } = (await created.json()) as { id: string };
  const res = await postConversion(jsonRequest("POST", `/api/leads/${id}/conversion`, {}, memberCookie), byId(id));
  expect(res.status).toBe(200);
  return (await res.json()) as { leadId: string; personId: string; companyId: string };
}

async function cleanup() {
  await db.delete(activity);
  await db.delete(customFieldValue);
  await db.delete(customFieldDefinition);
  await db.delete(auditLog);
  await db.delete(lead);
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

describe("un lead converti se fige, son fil reste vivant (CRM-97, D18, contrats 23, 24, 28)", () => {
  it("refuse (409) de modifier un champ, un champ personnalisé, l'avancement ou le responsable d'un lead converti, et le garde tel quel", async () => {
    const definition = await createDefinition({ objectType: "lead", label: "Salon", type: "text" }, { id: memberId });
    await loadCustomFields();
    const { leadId } = (await convertedLead("Figée")) as unknown as { leadId: string };

    for (const input of [{ need: "Nouveau besoin" }, { [customFieldKey(definition.id)]: "Salon RH" }, { stage: "qualifie" }, { ownerId: memberId }]) {
      const res = await patch(leadId, input);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { message: string }).message).toBe("Lead converti : ses champs ne se modifient plus.");
    }
    expect(await readLead(leadId)).toMatchObject({ stage: "converti", need: null });
  });

  it("accepte encore une note et le cochage d'une tâche sur un lead converti, qui restent dans son seul fil", async () => {
    const { leadId, personId } = (await convertedLead("Vivante")) as unknown as { leadId: string; personId: string };

    await createActivity("lead", leadId, { type: "note", body: "Rappeler après la signature" }, { id: memberId });
    const task = await createActivity("lead", leadId, { type: TASK, title: "Envoyer la plaquette", assigneeId: memberId }, { id: memberId });
    await setTaskDone(task.id, true);

    const texts = (await listFeed("lead", leadId, [])).items.map((item) => item.text);
    expect(texts).toEqual(expect.arrayContaining(["Rappeler après la signature", "Envoyer la plaquette", "Converti en Julie Martin · Banque Vivante"]));
    expect((await listFeed("person", personId, [])).items.map((item) => item.text)).not.toContain("Rappeler après la signature");
  });

  it("n'offre plus « Convertir » ni « Écarter » sur un lead converti, écarté ou archivé, et l'offre sur un lead en cours", async () => {
    expect(visibleActions("lead", { stage: "qualifie", archivedAt: null }).map((action) => action.key)).toContain("convertir");
    expect(visibleActions("lead", { stage: "converti", archivedAt: null })).toEqual([]);
    expect(visibleActions("lead", { stage: "ecarte", archivedAt: null }).map((action) => action.key)).not.toContain("convertir");
    expect(visibleActions("lead", { stage: "nouveau", archivedAt: new Date() })).toEqual([]);
  });
});

describe("un lead converti ne se supprime pas, s'archive et se restaure (CRM-97, D18, contrat 28)", () => {
  it("refuse (409) la suppression définitive d'un lead converti : « un lead converti s'archive »", async () => {
    const { leadId } = (await convertedLead("Indélébile")) as unknown as { leadId: string };

    await expect(deleteRecord("lead", leadId)).rejects.toMatchObject({ status: 409, message: "Un lead converti ne se supprime pas : il s'archive." });
    expect((await getObjectRecord("lead", leadId)).stage).toBe("converti");
  });

  it("porte le bandeau « Converti le … » vers la personne et l'entreprise, n'affiche que « archivée » une fois archivé, et reste converti après restauration", async () => {
    const { leadId, personId, companyId } = (await convertedLead("Bandeau")) as unknown as { leadId: string; personId: string; companyId: string };

    const [banner, ...others] = await collectBanners("lead", leadId);
    expect(others).toEqual([]);
    expect(banner.message).toMatch(/^Converti le \d{1,2} [a-zéû.]+ \d{4}\.$/);
    expect(banner.links).toEqual([
      { label: "Julie Martin", href: `/personnes/${personId}` },
      { label: "Banque Bandeau", href: `/entreprises/${companyId}` },
    ]);

    await archiveRecord("lead", leadId, { id: memberId });
    expect((await collectBanners("lead", leadId)).map((entry) => entry.rank)).toEqual(["archivee"]);

    await restoreRecord("lead", leadId, { id: memberId });
    expect((await readLead(leadId)).stage).toBe("converti");
    expect((await collectBanners("lead", leadId))[0].message).toMatch(/^Converti le /);
  });
});
