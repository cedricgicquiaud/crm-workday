import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetOpportunities } from "./fixtures/opportunites";

/* Les fiches finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les opportunités d'abord : elles retiennent leur entreprise. */
function resetAll() {
  resetOpportunities();
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

test.describe("montant estimé dans la liste (CRM-103, contrat 33)", () => {
  test("écrit « 39 000,00 € » sur la ligne d'une opportunité à 650 € par jour sur 60 jours", async ({ memberPage }) => {
    const mark = tag();
    const companyId = await post(memberPage, "/api/entreprises", { name: named("Banque X", mark), type: "prospect" });
    const title = named("Refonte Payroll", mark);
    await post(memberPage, "/api/opportunites", { title, companyId, modules: ["payroll"], expectedClose: "2026-10-30", targetDailyRate: 650, estimatedDays: 60 });

    await memberPage.goto("/opportunites");
    const row = memberPage.getByRole("table", { name: "Opportunités" }).getByRole("row").filter({ has: memberPage.getByRole("link", { name: title }) });
    await expect(row).toContainText("39 000,00 €");
  });
});
