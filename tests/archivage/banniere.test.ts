import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activity, auditLog, company, user } from "@/db/schema";
import { createActivity } from "@/features/activities/activities";
import { parisDay } from "@/features/activities/overdue";
import { archiveRecord, restoreRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { collectBanners } from "@/features/objects/banners";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-banniere-archivee@exemple.fr", firstName: "Hugo", lastName: "Perrin", password: "MotDePasse-Banniere-Archivee-1", role: "membre" as const };

let memberId: string;

/** Jour à Paris, décalé de `days` jours (négatif = dans le passé). */
const dayShift = (days: number) => parisDay(new Date(Date.now() + days * 86_400_000));

async function cleanup() {
  await db.delete(activity);
  await db.delete(auditLog);
  await db.delete(company);
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

describe("bannière de la fiche — archivée (CRM-61, contrat 30, D5)", () => {
  it("signale une fiche archivée en tête des autres signalements, et le signalement disparaît à la restauration", async () => {
    const created = await createObject("company", { name: "Charpentes Ollivier", type: "client" }, { id: memberId });
    await createActivity("company", created.id, { type: "tache", title: "Relancer la proposition", dueDate: dayShift(-1), assigneeId: memberId }, { id: memberId });
    expect(await collectBanners("company", created.id)).toEqual([{ rank: "tache_echue", tone: "warning", message: "1 tâche échue." }]);

    await archiveRecord("company", created.id, { id: memberId });
    expect(await collectBanners("company", created.id)).toEqual([
      { rank: "archivee", tone: "info", message: "Entreprise archivée : la fiche est en lecture seule." },
      { rank: "tache_echue", tone: "warning", message: "1 tâche échue." },
    ]);

    await restoreRecord("company", created.id, { id: memberId });
    expect((await collectBanners("company", created.id)).map((banner) => banner.rank)).toEqual(["tache_echue"]);
  });
});
