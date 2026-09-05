import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";

/* Les fiches finissent par « (e2e) » : la fixture des objets les efface, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;

test.beforeAll(() => {
  resetObjects();
  seedAccounts();
});
test.afterAll(() => resetObjects());

async function pickOption(page: Page, combobox: import("@playwright/test").Locator, option: string) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("créer une entreprise depuis la liste (CRM-35, contrat 1)", () => {
  test("un membre ouvre Entreprises depuis la barre latérale, crée « raison sociale + type » : la fiche s'ouvre en trois colonnes et la liste la montre en tête", async ({ memberPage }) => {
    const name = `Banque Solveige ${suffix()}`;
    await memberPage.goto("/accueil");
    const objectsNav = memberPage.locator('[data-slot="sidebar"]').getByRole("navigation", { name: "Objets" });
    await objectsNav.getByRole("link", { name: "Entreprises" }).click();
    await expect(memberPage).toHaveURL(/\/entreprises$/);
    await expect(memberPage.getByRole("heading", { level: 1, name: "Entreprises" })).toBeVisible();
    await expect(objectsNav.getByRole("link", { name: "Entreprises" })).toHaveAttribute("aria-current", "page");

    await memberPage.getByRole("button", { name: "Nouvelle entreprise" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle entreprise" });
    await dialog.getByLabel("Raison sociale").fill(name);
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Type" }), "Client");
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(memberPage).toHaveURL(/\/entreprises\/[0-9a-f-]{36}$/);
    await expect(memberPage.getByRole("heading", { level: 1, name })).toBeVisible();
    const regions = ["Liens", "Champs", "Historique"].map((label) => memberPage.getByRole("region", { name: label }));
    for (const region of regions) await expect(region).toBeVisible();
    /* Trois colonnes côte à côte à 1280 px (D5) : même haut de page, de gauche à droite. */
    const boxes = await Promise.all(regions.map((r) => r.boundingBox()));
    expect(boxes.every((b) => b && Math.abs(b.y - boxes[0]!.y) < 2)).toBe(true);
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
    expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
    await expect(regions[2].getByText("Fiche créée")).toBeVisible();

    await memberPage.goto("/entreprises");
    const table = memberPage.getByRole("table", { name: "Entreprises" });
    await expect(table.getByRole("row").nth(1).getByRole("link", { name })).toBeVisible();
    await expect(memberPage.getByText(/^\d+ entreprises?$/)).toBeVisible();
  });
});
