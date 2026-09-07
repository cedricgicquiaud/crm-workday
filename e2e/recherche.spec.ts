import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";

/* Les fiches finissent par « (e2e) » : la fixture des objets les efface, et rien d'autre. */
const suffix = () => `${Date.now().toString(36)} (e2e)`;
/* SIREN propre à ce fichier : distinct de l'amorce de recette et de `entreprises.spec.ts`. */
const ACME_SIREN = "421100999";

const PALETTE_INPUT = "Rechercher une page ou une action";

test.beforeAll(() => {
  resetObjects();
  seedAccounts();
});
test.afterAll(() => resetObjects());

/** Cmd+K (Ctrl+K hors macOS). Le raccourci n'existe qu'une fois la page hydratée : on réessaie. */
async function openPalette(page: Page) {
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return palette;
}

async function createAcme(page: Page): Promise<{ id: string; name: string }> {
  const name = `ACME SAS ${suffix()}`;
  const created = await page.request.post("/api/entreprises", { data: { name, type: "client", siren: ACME_SIREN } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  return { id, name };
}

test.describe("recherche dans la palette (CRM-39, contrat 3)", () => {
  test("« acm », « me s » et le SIREN font apparaître « ACME SAS » en tête, préfixée de l'icône entreprise et présélectionnée ; Entrée ouvre sa fiche ; sous trois caractères, aucune requête ne part", async ({ memberPage }) => {
    const { id, name } = await createAcme(memberPage);
    const searches: string[] = [];
    memberPage.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/recherche") searches.push(url.searchParams.get("q") ?? "");
    });
    await memberPage.goto("/accueil");

    const palette = await openPalette(memberPage);
    const input = palette.getByPlaceholder(PALETTE_INPUT);
    const results = palette.getByRole("group", { name: "Résultats" });
    const acme = palette.getByRole("option", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) });

    await input.pressSequentially("acm");
    await expect(acme).toBeVisible();
    await expect(acme).toHaveAttribute("aria-selected", "true");
    await expect(acme.locator("svg.lucide-building-2")).toBeVisible();
    await expect(acme).toContainText("Client");
    /* Le groupe « Résultats » précède Navigation et Actions. */
    await expect(palette.getByRole("listbox").getByRole("group").first()).toHaveAccessibleName("Résultats");
    expect(searches.every((q) => q.trim().length >= 3), searches.join(", ")).toBe(true);
    await memberPage.keyboard.press("Enter");
    await expect(memberPage).toHaveURL(`/entreprises/${id}`);
    await expect(palette).toBeHidden();
    await expect(memberPage.getByRole("heading", { level: 1, name })).toBeVisible();

    await openPalette(memberPage);
    await input.fill("me s");
    await expect(acme).toBeVisible();
    await expect(acme).toHaveAttribute("aria-selected", "true");
    await input.fill("421 100 999");
    await expect(acme).toBeVisible();
    await expect(results).toBeVisible();

    /* Deux caractères : le groupe disparaît et aucune source n'est interrogée. */
    const before = searches.length;
    await input.fill("ac");
    await expect(results).toBeHidden();
    await expect(palette.getByRole("option", { name: "Aller à Accueil" })).toBeVisible();
    expect(searches.length).toBe(before);
    await expect(acme).toBeHidden();
  });
});

test.describe("aucun résultat (CRM-39, refus)", () => {
  test("« zzz » affiche « Aucun résultat. » et Entrée n'ouvre rien", async ({ memberPage }) => {
    await memberPage.goto("/accueil");
    const palette = await openPalette(memberPage);
    await palette.getByPlaceholder(PALETTE_INPUT).fill("zzz");
    await expect(palette.getByText("Aucun résultat.")).toBeVisible();
    await expect(palette.getByRole("option")).toHaveCount(0);
    await memberPage.keyboard.press("Enter");
    await expect(memberPage).toHaveURL(/\/accueil$/);
    await expect(palette).toBeVisible();
  });
});

test.describe("téléphone, 375 px (contrat 25 de la feature 1)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("la palette avec des résultats tient dans l'écran, sans défilement horizontal ni cadre qui défile en largeur", async ({ memberPage }) => {
    await memberPage.setViewportSize({ width: 375, height: 812 });
    const { name } = await createAcme(memberPage);
    await memberPage.goto("/accueil");
    const palette = await openPalette(memberPage);
    await palette.getByPlaceholder(PALETTE_INPUT).fill("acme");
    await expect(palette.getByRole("option", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) })).toBeVisible();

    const { scrollWidth, clientWidth } = await memberPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    const wider = await memberPage.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
        .filter((el) => getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis")
        .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(wider).toEqual([]);
  });
});

test.describe("échec de la recherche (idiome : aucun appel serveur avalé en silence)", () => {
  test("quand l'API répond 500, la palette le dit dans un message d'alerte et repart quand l'API répond", async ({ memberPage }) => {
    const { name } = await createAcme(memberPage);
    await memberPage.route("**/api/recherche?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await memberPage.goto("/accueil");
    const palette = await openPalette(memberPage);
    const input = palette.getByPlaceholder(PALETTE_INPUT);
    await input.fill("acme");
    await expect(palette.getByRole("alert")).toHaveText("La recherche n'a pas répondu.");
    await expect(palette.getByRole("group", { name: "Résultats" })).toBeHidden();
    await expect(palette.getByText("Aucun résultat.")).toBeHidden();

    await memberPage.unroute("**/api/recherche?*");
    await input.fill("acme sas");
    await expect(palette.getByRole("option", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) })).toBeVisible();
    await expect(palette.getByRole("alert")).toHaveCount(0);
  });
});
