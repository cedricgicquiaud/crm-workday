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

test.describe("refus à la création (CRM-35, CRM-34, contrat 4)", () => {
  test("une raison sociale vide ou de 121 caractères et un SIREN de huit chiffres sont refusés sous le champ ; un SIREN déjà porté est refusé en nommant l'entreprise", async ({ memberPage }) => {
    const holder = `Première Titulaire ${suffix()}`;
    expect((await memberPage.request.post("/api/entreprises", { data: { name: holder, type: "client", siren: "813 562 734" } })).status()).toBe(201);
    await memberPage.goto("/entreprises");
    await memberPage.getByRole("button", { name: "Nouvelle entreprise" }).click();
    const dialog = memberPage.getByRole("dialog", { name: "Nouvelle entreprise" });
    const form = dialog.locator("form");
    const nameField = dialog.getByLabel("Raison sociale");
    await pickOption(memberPage, dialog.getByRole("combobox", { name: "Type" }), "Prospect");

    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toHaveText(["« Raison sociale » est obligatoire."]);
    await expect(nameField).toBeFocused();
    await expect(memberPage).toHaveURL(/\/entreprises$/);

    await nameField.fill("a".repeat(121));
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toHaveText(["« Raison sociale » dépasse 120 caractères."]);

    await nameField.fill(`Refusée ${suffix()}`);
    await dialog.getByLabel("SIREN").fill("12345678");
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toHaveText(["Le SIREN doit contenir neuf chiffres."]);

    await dialog.getByLabel("SIREN").fill("813562734");
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(form.getByRole("alert")).toContainText(`Le SIREN 813562734 est déjà porté par « ${holder} ».`);
    await expect(form.getByRole("link", { name: "Ouvrir la fiche" })).toBeVisible();
    await expect(memberPage).toHaveURL(/\/entreprises$/);
  });
});

test.describe("téléphone, 375 px (contrat 25 de la feature 1, D9)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** Aucun défilement horizontal de la page, un seul h1, et aucun cadre qui défile en largeur (un texte tronqué par des points de suspension n'est pas un débordement). */
  async function fitsTheScreen(page: Page, label: string, { modalOpen = false } = {}) {
    /* Un dialogue ouvert masque le reste de la page à l'accessibilité : le titre ne se compte qu'à dialogue fermé. */
    if (!modalOpen) await expect(page.getByRole("heading", { level: 1 }), label).toHaveCount(1);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
    const wider = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis")
        .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(wider, label).toEqual([]);
  }

  test("la liste des entreprises et une fiche tiennent dans l'écran, avec le bouton de création atteignable et un seul titre", async ({ memberPage }) => {
    await memberPage.setViewportSize({ width: 375, height: 812 });
    const name = `Groupe Ferrandi et Associés du Sud-Ouest ${suffix()}`;
    const created = await memberPage.request.post("/api/entreprises", { data: { name, type: "partenaire" } });
    const { id } = (await created.json()) as { id: string };

    await memberPage.goto("/entreprises");
    await fitsTheScreen(memberPage, "liste des entreprises");
    await expect(memberPage.getByRole("button", { name: "Nouvelle entreprise" })).toBeInViewport();
    await memberPage.getByRole("button", { name: "Nouvelle entreprise" }).click();
    await expect(memberPage.getByRole("dialog", { name: "Nouvelle entreprise" })).toBeVisible();
    await fitsTheScreen(memberPage, "dialogue de création", { modalOpen: true });
    await memberPage.keyboard.press("Escape");

    await memberPage.goto(`/entreprises/${id}`);
    await fitsTheScreen(memberPage, "fiche entreprise");
    await expect(memberPage.getByRole("heading", { level: 1, name })).toBeVisible();
    for (const region of ["Liens", "Champs", "Historique"]) await expect(memberPage.getByRole("region", { name: region })).toBeVisible();
  });
});

test.describe("identifiant qui n'est pas un UUID (CRM-34, D24)", () => {
  test("la fiche /entreprises/abc répond 404 et affiche l'écran « introuvable », pas une erreur", async ({ memberPage }) => {
    const response = await memberPage.goto("/entreprises/abc");
    expect(response?.status()).toBe(404);
    await expect(memberPage.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(memberPage.getByText(/Internal Server Error|Application error|Unhandled Runtime Error/)).toHaveCount(0);
  });
});

test.describe("échec de l'enregistrement en place (CRM-36, idiome : aucune écriture avalée en silence)", () => {
  test("quand le serveur répond 500 à un PATCH, un message s'affiche sous le champ et la valeur enregistrée revient", async ({ memberPage }) => {
    const name = `Panne Serveur ${suffix()}`;
    const created = await memberPage.request.post("/api/entreprises", { data: { name, type: "client", city: "Lyon" } });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    await memberPage.goto(`/entreprises/${id}`);
    const address = memberPage.getByRole("region", { name: "Adresse" });
    const city = address.getByLabel("Ville");
    await expect(city).toHaveValue("Lyon");

    await memberPage.route("**/api/entreprises/*", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500 }) : route.continue()));
    await city.fill("Paris");
    await memberPage.keyboard.press("Enter");
    await expect(address.getByRole("alert")).toHaveText("La modification n'a pas pu être enregistrée.");
    await expect(city).toHaveValue("Lyon");
    await expect(city).toHaveAttribute("aria-invalid", "true");

    /* Sur une panne réseau (requête interrompue), même comportement. */
    await memberPage.unroute("**/api/entreprises/*");
    await memberPage.route("**/api/entreprises/*", (route) => (route.request().method() === "PATCH" ? route.abort() : route.continue()));
    await city.fill("Marseille");
    await memberPage.keyboard.press("Enter");
    await expect(address.getByRole("alert")).toHaveText("La modification n'a pas pu être enregistrée.");
    await expect(city).toHaveValue("Lyon");

    /* Le serveur revient : l'enregistrement passe, le message disparaît. */
    await memberPage.unroute("**/api/entreprises/*");
    await city.fill("Paris");
    await memberPage.keyboard.press("Enter");
    await expect(address.getByRole("alert")).toHaveCount(0);
    await expect(memberPage.getByRole("region", { name: "Historique" }).getByText("Ville : Lyon → Paris")).toBeVisible();
  });
});
