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

test.describe("modifier sur la fiche, relire, historique (CRM-36, contrat 2)", () => {
  test("type, conditions de paiement, adresse et email de facturation sont relus après rechargement ; l'historique montre chaque changement avec ancienne et nouvelle valeur, auteur et date", async ({ memberPage }) => {
    const name = `Assurances Vaubourg ${suffix()}`;
    const created = await memberPage.request.post("/api/entreprises", { data: { name, type: "prospect" } });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await memberPage.goto(`/entreprises/${id}`);
    const fields = memberPage.getByRole("region", { name: "Champs" });
    const address = memberPage.getByRole("region", { name: "Adresse" });
    const history = memberPage.getByRole("region", { name: "Historique" });

    await pickOption(memberPage, fields.getByRole("combobox", { name: "Type" }), "Client");
    await expect(history.getByText("Type : Prospect → Client")).toBeVisible();
    await pickOption(memberPage, fields.getByRole("combobox", { name: "Conditions de paiement" }), "60 jours");
    await expect(history.getByText("Conditions de paiement : 30 jours → 60 jours")).toBeVisible();
    await address.getByLabel("Rue").fill("12 rue de la Paix");
    await memberPage.keyboard.press("Tab");
    await address.getByLabel("Code postal").fill("75002");
    await memberPage.keyboard.press("Tab");
    await address.getByLabel("Ville").fill("Paris");
    await memberPage.keyboard.press("Enter");
    await expect(history.getByText("Ville : vide → Paris")).toBeVisible();
    await fields.getByLabel("Email de facturation").fill("Compta@Vaubourg.fr");
    await memberPage.keyboard.press("Enter");
    await expect(history.getByText("Email de facturation : vide → compta@vaubourg.fr")).toBeVisible();

    await memberPage.reload();
    await expect(fields.getByRole("combobox", { name: "Type" })).toContainText("Client");
    await expect(fields.getByRole("combobox", { name: "Conditions de paiement" })).toContainText("60 jours");
    await expect(address.getByLabel("Rue")).toHaveValue("12 rue de la Paix");
    await expect(address.getByLabel("Code postal")).toHaveValue("75002");
    await expect(address.getByLabel("Ville")).toHaveValue("Paris");
    await expect(fields.getByLabel("Email de facturation")).toHaveValue("compta@vaubourg.fr");

    const entries = history.getByRole("listitem");
    await expect(entries).toHaveCount(7);
    await expect(entries.first()).toContainText("Email de facturation : vide → compta@vaubourg.fr");
    await expect(entries.last()).toContainText("Fiche créée");
    const today = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());
    for (let i = 0; i < 7; i++) await expect(entries.nth(i)).toContainText(new RegExp(`Marc Leroy · ${today.replace(".", "\\.")}, \\d{2}:\\d{2}`));
  });
});
