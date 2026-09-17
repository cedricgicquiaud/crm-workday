import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { pickOption, resetOpportunities } from "./fixtures/opportunites";

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

test.describe("création rapide depuis la liste (CRM-104, contrat 31)", () => {
  test("« Nouvelle opportunité » ouvre la création à quatre champs ; « Refonte Payroll » chez Banque X, HCM et Payroll, clôture au 30 octobre : la fiche s'ouvre, Marc Leroy en responsable, à l'étape « Nouveau besoin »", async ({ memberPage }) => {
    const mark = tag();
    const bank = named("Banque X", mark);
    await post(memberPage, "/api/entreprises", { name: bank, type: "prospect" });
    const title = named("Refonte Payroll", mark);

    await memberPage.goto("/opportunites");
    await memberPage.getByRole("button", { name: "Nouvelle opportunité" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    await dialog.getByLabel("Titre").fill(title);
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Entreprise" }), bank);
    const modules = dialog.getByRole("group", { name: "Modules Workday" });
    await modules.getByRole("checkbox", { name: "HCM", exact: true }).click();
    await modules.getByRole("checkbox", { name: "Payroll", exact: true }).click();
    await dialog.getByLabel("Clôture prévue").fill("2026-10-30");
    /* Quatre champs, rien d'autre : le reste se règle sur la fiche (D34). */
    await expect(dialog.locator("label, [id$='-label']")).toHaveText(["Titre", "Entreprise", "Modules Workday", "Clôture prévue"]);
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(memberPage).toHaveURL(/\/opportunites\/[0-9a-f-]{36}$/);
    await expect(memberPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(memberPage.getByText("responsable : Marc Leroy")).toBeVisible();
    const id = memberPage.url().split("/").pop()!;
    const created = (await (await memberPage.request.get(`/api/opportunites/${id}`)).json()) as Record<string, unknown>;
    expect(created).toMatchObject({ stage: "nouveau_besoin", modules: ["hcm", "payroll"], expectedClose: "2026-10-30", companyIdLabel: bank });
  });
});

test.describe("création depuis la palette (CRM-104, contrat 32)", () => {
  test("la palette ⌘K propose « Nouvelle opportunité », qui ouvre la même création rapide à quatre champs", async ({ memberPage }) => {
    await memberPage.goto("/accueil");
    await memberPage.keyboard.press("ControlOrMeta+k");
    const palette = memberPage.getByRole("dialog");
    await palette.getByRole("combobox").fill("Nouvelle opp");
    await palette.getByRole("option", { name: /^Nouvelle opportunité/ }).click();

    await expect(memberPage).toHaveURL(/\/opportunites\?creation=1/);
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle opportunité" });
    await expect(dialog.locator("label, [id$='-label']")).toHaveText(["Titre", "Entreprise", "Modules Workday", "Clôture prévue"]);
  });
});

