import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as archiveRecord } from "@/app/api/objets/[type]/[id]/archiver/route";
import { POST as postOpportunity } from "@/app/api/opportunites/route";
import { POST as postPin } from "@/app/api/vues-epinglees/route";
import { POST as postView } from "@/app/api/vues/route";
import { auditLog, company, opportunity, pinnedView, savedView, user } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/accounts";
import { listForState } from "@/features/lists/apply-filters";
import { columnsOf, defaultColumnKeys } from "@/features/lists/columns";
import { getObject } from "@/features/objects/registry";
import { createObject, listObjectRecords } from "@/features/objects/service";
import { listPinnedViews } from "@/features/views/pinned";
import { listStateWithView, listViews } from "@/features/views/views";
import { closeDb, db } from "@/lib/db";
import { jsonRequest, sessionCookie } from "../helpers/auth";

const MEMBER = { email: "membre-liste-opportunite@exemple.fr", firstName: "Awa", lastName: "Sylla", password: "MotDePasse-Liste-Opp-1", role: "membre" as const };

let memberId: string;
let memberCookie: string;
let bankId: string;

/** Les opportunités de la liste, dans l'état porté par une adresse : ce que l'écran et l'API rendent tous deux. */
async function shown(query: string): Promise<string[]> {
  const state = await listStateWithView("opportunity", new URLSearchParams(query));
  const records = await listObjectRecords("opportunity", { includeArchived: state.includeArchived });
  return listForState("opportunity", records, state).map((record) => String(record.title));
}

type OpportunityInput = { title: string; expectedClose?: string; stage?: string; targetDailyRate?: number; estimatedDays?: number };

/** Une opportunité par l'API ; les étapes gagnée et perdue, posées par leur geste (4.2d), s'écrivent en base. */
async function create({ title, expectedClose = "2026-10-30", stage, ...rest }: OpportunityInput): Promise<string> {
  const res = await postOpportunity(jsonRequest("POST", "/api/opportunites", { title, companyId: bankId, modules: ["hcm"], expectedClose, ...rest }, memberCookie));
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  if (stage) await db.update(opportunity).set({ stage }).where(eq(opportunity.id, id));
  return id;
}

async function archive(id: string): Promise<void> {
  const res = await archiveRecord(jsonRequest("POST", `/api/objets/opportunity/${id}/archiver`, undefined, memberCookie), { params: Promise.resolve({ type: "opportunity", id }) });
  expect(res.status).toBe(200);
}

/** Les enfants avant les parents : une opportunité retient son entreprise (clé sans cascade) ; ses modules partent avec elle. */
async function cleanup() {
  await db.delete(pinnedView);
  await db.delete(savedView);
  await db.delete(auditLog);
  await db.delete(opportunity);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(company);
  await db.delete(user).where(eq(user.email, MEMBER.email));
  memberId = (await createUserWithPassword(MEMBER)).id;
  memberCookie = await sessionCookie(MEMBER.email, MEMBER.password);
  bankId = (await createObject("company", { name: "Banque X", type: "prospect" }, { id: memberId })).id;
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await db.delete(company);
  await closeDb();
});

/** Libellés des colonnes d'une liste, dans l'ordre où le menu des colonnes les propose. */
const columnLabels = (keys: readonly string[]) => keys.map((key) => columnsOf("opportunity").find((column) => column.key === key)!.label);

/** D38, contrat 36 : sept colonnes à l'ouverture, les autres champs à portée du menu des colonnes. */
describe("colonnes de la liste des opportunités (CRM-106, D38, contrat 36)", () => {
  it("montre Titre, Entreprise, Étape, Probabilité, Montant estimé, Clôture prévue et Responsable, et garde les autres champs à portée du menu", () => {
    const titleField = getObject("opportunity").titleField;
    expect(columnLabels([titleField, ...defaultColumnKeys("opportunity")])).toEqual([
      "Titre",
      "Entreprise",
      "Étape",
      "Probabilité",
      "Montant estimé",
      "Clôture prévue",
      "Responsable",
      /* « Modifiée le » suit les colonnes déclarées sur toute liste qui ne cite pas elle-même une colonne de base (D26). */
      "Modifiée le",
    ]);
    const shownByDefault = new Set([titleField, ...defaultColumnKeys("opportunity")]);
    const available = columnsOf("opportunity").filter((column) => !shownByDefault.has(column.key));
    expect(available.map((column) => column.label)).toEqual(["Contact", "Modules Workday", "TJM de vente cible", "Durée estimée", "Démarrage souhaité", "Motif de perte", "Besoin", "Créé le"]);
  });
});

/** D38, contrat 36 : la liste s'ouvre sur les affaires en cours, de la clôture la plus proche à la plus lointaine. */
describe("vue par défaut « Opportunités en cours » (CRM-106, D38, contrat 36)", () => {
  it("écarte les gagnées et les perdues par deux puces, trie par clôture prévue croissante, et porte ce nom dans la barre des vues", async () => {
    await create({ title: "Gagnée", stage: "gagnee", expectedClose: "2026-10-05" });
    await create({ title: "Perdue", stage: "perdue", expectedClose: "2026-10-06" });
    await create({ title: "Négociation lointaine", stage: "negociation", expectedClose: "2026-12-01" });
    await create({ title: "Nouveau besoin proche", expectedClose: "2026-10-30" });

    const state = await listStateWithView("opportunity", new URLSearchParams());
    expect(state.filters).toEqual([
      { field: "stage", operator: "n_est_pas", value: "gagnee" },
      { field: "stage", operator: "n_est_pas", value: "perdue" },
    ]);
    expect(state.sort).toEqual({ field: "expectedClose", direction: "asc" });
    expect(await shown("")).toEqual(["Nouveau besoin proche", "Négociation lointaine"]);
    expect((await listViews("opportunity")).map((view) => view.name)).toEqual(["Opportunités en cours"]);
  });

  it("fait apparaître les gagnées et les perdues quand on retire ses deux puces", async () => {
    await create({ title: "Gagnée", stage: "gagnee", expectedClose: "2026-10-05" });
    await create({ title: "Perdue", stage: "perdue", expectedClose: "2026-10-06" });
    await create({ title: "Nouveau besoin", expectedClose: "2026-10-30" });

    expect(await shown("filtres=aucun")).toEqual(["Gagnée", "Perdue", "Nouveau besoin"]);
  });

  it("laisse dehors une opportunité archivée, que la bascule « archivées » ramène", async () => {
    await archive(await create({ title: "Archivée", expectedClose: "2026-10-05" }));
    await create({ title: "En cours", expectedClose: "2026-10-30" });

    expect(await shown("")).toEqual(["En cours"]);
    expect(await shown("archivees=1")).toEqual(["Archivée", "En cours"]);
  });
});

/** D33, contrat 36 : la probabilité se filtre comme une colonne, alors qu'elle se déduit de l'étape à la lecture. */
describe("filtre sur la probabilité (CRM-106, D33, contrat 36)", () => {
  it("ne garde, au-dessus de 50, que Proposition envoyée (70 %), Négociation (80 %) et Gagnée (100 %)", async () => {
    const stages = [
      ["nouveau_besoin", "2026-10-01"],
      ["qualifie", "2026-10-02"],
      ["profils_proposes", "2026-10-03"],
      ["entretien_client", "2026-10-04"],
      ["proposition_envoyee", "2026-10-05"],
      ["negociation", "2026-10-06"],
      ["gagnee", "2026-10-07"],
      ["perdue", "2026-10-08"],
    ] as const;
    for (const [stage, expectedClose] of stages) await create({ title: `Étape ${stage}`, stage, expectedClose });

    expect(await shown("f=probability:plus_grand:50")).toEqual(["Étape proposition_envoyee", "Étape negociation", "Étape gagnee"]);
  });
});

/** D31, contrat 36 : le montant estimé se filtre et se trie comme une colonne, et l'absence de montant se range en fin de liste. */
describe("filtre et tri sur le montant estimé (CRM-106, D31, contrat 36)", () => {
  it("ne garde au-dessus de 30 000 que les montants qui y sont, et range en dernier une opportunité sans montant quand on trie par montant", async () => {
    await create({ title: "Cinquante mille", targetDailyRate: 1000, estimatedDays: 50 });
    await create({ title: "Trente-neuf mille", targetDailyRate: 650, estimatedDays: 60 });
    await create({ title: "Vingt-six mille", targetDailyRate: 650, estimatedDays: 40 });
    await create({ title: "Sans montant", targetDailyRate: 650 });

    expect(await shown("f=estimatedAmount:plus_grand:30000&tri=estimatedAmount:desc")).toEqual(["Cinquante mille", "Trente-neuf mille"]);
    expect(await shown("tri=estimatedAmount:asc")).toEqual(["Vingt-six mille", "Trente-neuf mille", "Cinquante mille", "Sans montant"]);
  });
});

/** D37, contrat 36 : une liste d'opportunités se range sous un nom, s'épingle, et se rouvre au même état. */
describe("vue enregistrée et épinglée (CRM-106, D37, contrat 36)", () => {
  const QUERY = "f=estimatedAmount:plus_grand:30000&tri=estimatedAmount:desc";

  it("rouvre au même état la vue « Grosses affaires » enregistrée, et la porte dans la barre latérale une fois épinglée", async () => {
    await create({ title: "Cinquante mille", targetDailyRate: 1000, estimatedDays: 50 });
    await create({ title: "Vingt-six mille", targetDailyRate: 650, estimatedDays: 40 });

    const saved = await postView(jsonRequest("POST", "/api/vues", { objectType: "opportunity", name: "Grosses affaires", query: QUERY }, memberCookie));
    expect(saved.status).toBe(201);
    const { id } = (await saved.json()) as { id: string };
    expect((await listViews("opportunity")).map((view) => view.name)).toEqual(["Opportunités en cours", "Grosses affaires"]);

    expect(await shown(`vue=${id}`)).toEqual(["Cinquante mille"]);

    const pinned = await postPin(jsonRequest("POST", "/api/vues-epinglees", { viewId: id }, memberCookie));
    expect(pinned.status).toBe(201);
    expect((await listPinnedViews(memberId)).map((view) => view.name)).toEqual(["Grosses affaires"]);
  });
});
