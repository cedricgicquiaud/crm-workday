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
    await expect(row).toContainText("650,00 €");
    await expect(memberPage.getByText(`Consultant proposé : Marc ${marc}`)).toBeVisible();
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
    await expect(section.getByRole("listitem")).toContainText("650,00 €");
    expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
