import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { parisDayFromToday } from "./helpers/paris-day";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les opportunités d'abord (`resetPersons` les efface avant les personnes, et leurs propositions partent avec elles), puis les entreprises. */
function resetAll() {
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.beforeEach(resetAll);
test.afterAll(resetAll);

async function post(page: Page, url: string, data: Record<string, unknown>): Promise<string> {
  const created = await page.request.post(url, { data });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/** Une entreprise et une opportunité à ses quatre champs obligatoires, créées par l'API. */
async function createOpportunity(page: Page, mark: string, extra: Record<string, unknown> = {}): Promise<string> {
  const companyId = await post(page, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
  return post(page, "/api/opportunites", { title: named("Refonte Payroll", mark), companyId, modules: ["hcm", "payroll"], expectedClose: "2026-10-30", ...extra });
}

/** Un consultant freelance, en mission jusqu'à `availableFrom` s'il est donné. */
async function createConsultant(page: Page, firstName: string, lastName: string, availableFrom?: string): Promise<string> {
  const id = await post(page, "/api/consultants", { firstName, lastName, status: "freelance" });
  if (availableFrom) expect((await page.request.patch(`/api/personnes/${id}/profil-consultant`, { data: { availableFrom } })).status()).toBe(200);
  return id;
}

test.describe("ajouter un consultant sur la fiche d'une opportunité (CRM-107, D44 à D46, contrat 51)", () => {
  test("la section « Consultants proposés » suit « Champs » ; Marc, en mission, s'ajoute « Proposé » à 650,00 € et l'historique le dit", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark, { targetDailyRate: 650 });
    const marc = named("Petit", mark);
    await createConsultant(memberPage, "Marc", marc, parisDayFromToday(30));
    await memberPage.goto(`/opportunites/${id}`);

    const fields = memberPage.getByRole("region", { name: "Champs", exact: true });
    const section = memberPage.getByRole("region", { name: "Consultants proposés" });
    await expect(section.getByRole("heading", { level: 2, name: "Consultants proposés" })).toBeVisible();
    expect(await fields.evaluate((champs, proposes) => Boolean(champs.compareDocumentPosition(proposes!) & Node.DOCUMENT_POSITION_FOLLOWING), await section.elementHandle())).toBe(true);
    await expect(section.getByText("Aucun consultant proposé.")).toBeVisible();

    await section.getByRole("button", { name: "Ajouter un consultant" }).click();
    await section.getByRole("combobox", { name: "Consultant" }).click();
    const option = memberPage.getByRole("option", { name: new RegExp(`^Marc ${marc.replace(/[()]/g, "\\$&")} · En mission`) });
    await expect(option).toBeVisible();
    const [response] = await Promise.all([memberPage.waitForResponse((res) => res.url().includes(`/api/opportunites/${id}/propositions`) && res.request().method() === "POST"), option.click()]);
    expect(response.status()).toBe(201);

    const row = section.getByRole("listitem").filter({ hasText: `Marc ${marc}` });
    await expect(row).toContainText("Proposé");
    await expect(row.getByLabel("TJM de vente proposé")).toHaveValue("650,00 €");
    await expect(memberPage.getByText(`Consultant proposé : Marc ${marc}`)).toBeVisible();
  });
});

/** Propose un consultant par l'API, comme « Ajouter un consultant » le ferait. */
async function propose(page: Page, opportunityId: string, personId: string): Promise<void> {
  expect((await page.request.post(`/api/opportunites/${opportunityId}/propositions`, { data: { personId } })).status()).toBe(201);
}

/** Attend la réponse du `method` sur la proposition en déclenchant `act` : deux écritures successives attendent chacune la leur. */
async function answered(page: Page, opportunityId: string, method: string, act: () => Promise<void>) {
  const [response] = await Promise.all([page.waitForResponse((res) => res.url().includes(`/api/opportunites/${opportunityId}/propositions/`) && res.request().method() === method), act()]);
  return response;
}

test.describe("faire avancer une proposition sur la fiche (CRM-108, D45, D46, contrat 51)", () => {
  test("Julie passe de « Proposé » à « Entretien » depuis la section, et l'historique le dit", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark, { targetDailyRate: 650 });
    const julie = `Julie ${named("Martin", mark)}`;
    await propose(memberPage, id, await createConsultant(memberPage, "Julie", named("Martin", mark)));
    await memberPage.goto(`/opportunites/${id}`);

    const row = memberPage.getByRole("region", { name: "Consultants proposés" }).getByRole("listitem").filter({ hasText: julie });
    await row.getByRole("combobox", { name: "Résultat" }).click();
    const response = await answered(memberPage, id, "PATCH", () => memberPage.getByRole("option", { name: "Entretien", exact: true }).click());
    expect(response.status()).toBe(200);

    await expect(row.getByRole("combobox", { name: "Résultat" })).toContainText("Entretien");
    await expect(memberPage.getByText(`${julie} : Proposé → Entretien`)).toBeVisible();
  });

  test("le TJM proposé de Julie passe à 700 depuis la section, et l'historique le dit", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark, { targetDailyRate: 650 });
    const julie = `Julie ${named("Martin", mark)}`;
    await propose(memberPage, id, await createConsultant(memberPage, "Julie", named("Martin", mark)));
    await memberPage.goto(`/opportunites/${id}`);

    const rate = memberPage.getByRole("region", { name: "Consultants proposés" }).getByRole("listitem").filter({ hasText: julie }).getByLabel("TJM de vente proposé");
    await rate.fill("700");
    const response = await answered(memberPage, id, "PATCH", () => memberPage.keyboard.press("Enter"));
    expect(response.status()).toBe(200);

    await expect(rate).toHaveValue("700,00 €");
    await expect(memberPage.getByText(`${julie} : TJM de vente proposé 650,00 € → 700,00 €`)).toBeVisible();
  });

  test("un second « Retenu » est refusé sous le résultat de Marc, qui nomme Julie, et Marc reste « Proposé »", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark);
    const julieId = await createConsultant(memberPage, "Julie", named("Martin", mark));
    await propose(memberPage, id, julieId);
    await propose(memberPage, id, await createConsultant(memberPage, "Marc", named("Petit", mark)));
    expect((await memberPage.request.patch(`/api/opportunites/${id}/propositions/${julieId}`, { data: { result: "retenu" } })).status()).toBe(200);
    await memberPage.goto(`/opportunites/${id}`);

    const row = memberPage.getByRole("region", { name: "Consultants proposés" }).getByRole("listitem").filter({ hasText: `Marc ${named("Petit", mark)}` });
    await row.getByRole("combobox", { name: "Résultat" }).click();
    const response = await answered(memberPage, id, "PATCH", () => memberPage.getByRole("option", { name: "Retenu", exact: true }).click());
    expect(response.status()).toBe(409);

    await expect(row.getByRole("alert")).toHaveText(`« Julie ${named("Martin", mark)} » est déjà retenu sur cette opportunité : changez d'abord son résultat.`);
    await expect(row.getByRole("combobox", { name: "Résultat" })).toContainText("Proposé");
  });

  test("Julie, retenue, se retire depuis la section : sa ligne part et l'historique le dit", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark);
    const julie = `Julie ${named("Martin", mark)}`;
    const julieId = await createConsultant(memberPage, "Julie", named("Martin", mark));
    await propose(memberPage, id, julieId);
    expect((await memberPage.request.patch(`/api/opportunites/${id}/propositions/${julieId}`, { data: { result: "retenu" } })).status()).toBe(200);
    await memberPage.goto(`/opportunites/${id}`);

    const section = memberPage.getByRole("region", { name: "Consultants proposés" });
    const response = await answered(memberPage, id, "DELETE", () => section.getByRole("button", { name: `Retirer ${julie}` }).click());
    expect(response.status()).toBe(200);

    await expect(section.getByRole("listitem").filter({ hasText: julie })).toHaveCount(0);
    await expect(memberPage.getByText(`Consultant retiré : ${julie}`)).toBeVisible();
  });
});

test.describe("section « Consultants proposés » à 375 px (CRM-107, D49, contrat 60)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("« Ajouter un consultant » reste atteignable et la section tient sans défilement horizontal", async ({ memberPage }) => {
    const mark = tag();
    const id = await createOpportunity(memberPage, mark, { targetDailyRate: 650 });
    const consultantId = await createConsultant(memberPage, "Julie", named("Martin-Delacroix-Beaumont de la Fontaine", mark));
    expect((await memberPage.request.post(`/api/opportunites/${id}/propositions`, { data: { personId: consultantId } })).status()).toBe(201);
    await memberPage.goto(`/opportunites/${id}`);

    const section = memberPage.getByRole("region", { name: "Consultants proposés" });
    const add = section.getByRole("button", { name: "Ajouter un consultant" });
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();
    await expect(section.getByRole("listitem").getByLabel("TJM de vente proposé")).toHaveValue("650,00 €");
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
