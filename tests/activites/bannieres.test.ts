import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCompany } from "@/app/api/entreprises/route";
import { activity, auditLog, company, user } from "@/db/schema";
import { createActivity, setTaskDone } from "@/features/activities/activities";
import { parisDay } from "@/features/activities/overdue";
import { collectBanners, sortBanners } from "@/features/objects/banners";
import { createUserWithPassword } from "@/features/auth/accounts";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-bannieres@exemple.fr", firstName: "Inès", lastName: "Roux", password: "MotDePasse-Bannieres-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;

/** Jour à Paris, décalé de `days` jours (négatif = dans le passé). */
const dayShift = (days: number) => parisDay(new Date(Date.now() + days * 86_400_000));

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(company);
}

async function createCompany(name: string): Promise<string> {
  const res = await postCompany(jsonRequest("POST", "/api/entreprises", { name, type: "client" }, memberCookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
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

describe("bannière de la fiche — tâche échue (CRM-45, contrat 12)", () => {
  it("signale une tâche dont l'échéance est la veille, ne signale ni celle qui échoit aujourd'hui ni celle qui est faite", async () => {
    const aujourdhui = await createCompany("Échéance du jour");
    await createActivity("company", aujourdhui, { type: "tache", title: "Appeler ce soir", dueDate: dayShift(0), assigneeId: memberId }, { id: memberId });
    expect(await collectBanners("company", aujourdhui)).toEqual([]);

    const veille = await createCompany("Échéance de la veille");
    const tache = await createActivity("company", veille, { type: "tache", title: "Relancer la proposition", dueDate: dayShift(-1), assigneeId: memberId }, { id: memberId });
    expect(await collectBanners("company", veille)).toEqual([{ rank: "tache_echue", tone: "warning", message: "1 tâche échue." }]);

    await setTaskDone(tache.id, true);
    expect(await collectBanners("company", veille)).toEqual([]);
  });

  it("compte les tâches échues d'une même fiche dans une seule bannière", async () => {
    const companyId = await createCompany("Deux tâches en retard");
    for (const title of ["Envoyer le devis", "Relancer Claire"]) await createActivity("company", companyId, { type: "tache", title, dueDate: dayShift(-2), assigneeId: memberId }, { id: memberId });
    expect(await collectBanners("company", companyId)).toEqual([{ rank: "tache_echue", tone: "warning", message: "2 tâches échues." }]);
  });
});

describe("rangs de bannière (CRM-45, D5)", () => {
  it("classe les signalements du plus grave au moins grave — archivée, puis doublon probable, puis tâche échue — quel que soit l'ordre reçu", () => {
    const banners = [
      { rank: "tache_echue", tone: "warning" as const, message: "1 tâche échue." },
      { rank: "doublon", tone: "info" as const, message: "Doublon probable." },
      { rank: "archivee", tone: "danger" as const, message: "Fiche archivée." },
    ];
    expect(sortBanners(banners).map((banner) => banner.rank)).toEqual(["archivee", "doublon", "tache_echue"]);
  });
});
