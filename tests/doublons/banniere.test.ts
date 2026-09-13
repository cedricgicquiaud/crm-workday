import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, company, person, user } from "@/db/schema";
import { archiveRecord } from "@/features/archive/archive";
import { createUserWithPassword } from "@/features/auth/accounts";
import { collectBanners } from "@/features/objects/banners";
import { createObject } from "@/features/objects/service";
import { closeDb, db } from "@/lib/db";

const MEMBER = { email: "membre-banniere-doublon@exemple.fr", firstName: "Nadia", lastName: "Rey", password: "MotDePasse-Banniere-Doublon-1", role: "membre" as const };

let memberId: string;

async function cleanup() {
  await db.delete(auditLog);
  await db.delete(person);
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

const newCompany = (name: string) => createObject("company", { name, type: "client" }, { id: memberId });

describe("bannière « doublon probable » (CRM-60, contrat 28, D5)", () => {
  it("signale la fiche jumelle des deux côtés, en la nommant, avec le lien qui ouvre la fusion", async () => {
    const acme = await newCompany("Acme");
    const acmeSas = await newCompany("ACME SAS");

    expect(await collectBanners("company", acme.id)).toEqual([
      { rank: "doublon", tone: "warning", message: "Doublon probable : « ACME SAS » porte un nom très proche.", action: { label: "Fusionner…", href: `/entreprises/${acme.id}?fusion=${acmeSas.id}` } },
    ]);
    expect(await collectBanners("company", acmeSas.id)).toEqual([
      { rank: "doublon", tone: "warning", message: "Doublon probable : « Acme » porte un nom très proche.", action: { label: "Fusionner…", href: `/entreprises/${acmeSas.id}?fusion=${acme.id}` } },
    ]);
  });

  it("compte les fiches jumelles sans les nommer quand il y en a plusieurs", async () => {
    const premiere = await newCompany("Fonderie Bertin");
    await newCompany("Fonderie Bertin SARL");
    await newCompany("Société Fonderie Bertin");

    expect((await collectBanners("company", premiere.id))[0].message).toBe("Doublon probable : 2 fiches portent un nom très proche.");
  });

  it("passe après la bannière d'archivage et avant celle des tâches échues (D5)", async () => {
    const rangee = await newCompany("Presses Aubry");
    await newCompany("Presses Aubry SAS");
    await archiveRecord("company", rangee.id, { id: memberId });

    /* Une fiche archivée n'entre plus dans aucun rapprochement : seule la bannière d'archivage reste. */
    expect((await collectBanners("company", rangee.id)).map((banner) => banner.rank)).toEqual(["archivee"]);
  });

  it("ne signale rien sur une fiche dont le nom ne se réduit à celui d'aucune autre", async () => {
    const seule = await newCompany("Acmé Conseil");
    expect(await collectBanners("company", seule.id)).toEqual([]);
  });
});
