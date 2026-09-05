import { ADMIN, expect, seedAccounts, test } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

const SIDEBAR_TOGGLE = "Replier ou déployer la barre latérale";

test.describe("barre latérale (CRM-27, contrat 21)", () => {
  test("montre Accueil, Paramètres et Mon profil ; repliée, elle le reste d'une page à l'autre et au rechargement", async ({ adminPage }) => {
    await adminPage.goto("/accueil");
    const nav = adminPage.getByRole("navigation", { name: "Navigation principale" });
    for (const name of ["Accueil", "Paramètres", "Mon profil"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
    const sidebar = adminPage.locator('[data-slot="sidebar"]');
    await expect(sidebar.getByText(`${ADMIN.firstName} ${ADMIN.lastName}`)).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await adminPage.getByRole("button", { name: SIDEBAR_TOGGLE }).click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");

    await nav.getByRole("link", { name: "Mon profil" }).click();
    await expect(adminPage).toHaveURL(/\/profil$/);
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(nav.getByRole("link", { name: "Mon profil" })).toHaveAttribute("aria-current", "page");

    await adminPage.reload();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    const cookie = (await adminPage.context().cookies()).find((c) => c.name === "sidebar_state");
    expect(cookie?.value).toBe("false");

    await adminPage.getByRole("button", { name: SIDEBAR_TOGGLE }).click();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  });
});

const PALETTE_INPUT = "Rechercher une page ou une action";
const THEME_ENTRY = "Basculer le thème clair / sombre";

test.describe("palette Cmd+K (CRM-28, contrat 22)", () => {
  test("Cmd+K ouvre la palette ; « para » puis Entrée ouvre Paramètres ; « sombre » bascule le thème et l'enregistre", async ({ memberPage }) => {
    await memberPage.goto("/accueil");
    const html = memberPage.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    await memberPage.keyboard.press("ControlOrMeta+k");
    const palette = memberPage.getByRole("dialog", { name: "Palette de commandes" });
    await expect(palette).toBeVisible();
    await palette.getByPlaceholder(PALETTE_INPUT).fill("para");
    await expect(palette.getByRole("option", { name: "Aller à Paramètres" })).toHaveAttribute("aria-selected", "true");
    await memberPage.keyboard.press("Enter");
    await expect(memberPage).toHaveURL(/\/parametres(\/|$)/);
    await expect(palette).toBeHidden();

    await memberPage.keyboard.press("ControlOrMeta+k");
    await palette.getByPlaceholder(PALETTE_INPUT).fill("sombre");
    await expect(palette.getByRole("option", { name: THEME_ENTRY })).toHaveAttribute("aria-selected", "true");
    await memberPage.keyboard.press("Enter");
    await expect(html).toHaveClass(/dark/);
    await memberPage.reload();
    await expect(html).toHaveClass(/dark/);

    await memberPage.keyboard.press("ControlOrMeta+k");
    await palette.getByPlaceholder(PALETTE_INPUT).fill("clair");
    await expect(palette.getByRole("option", { name: THEME_ENTRY })).toHaveAttribute("aria-selected", "true");
    await memberPage.keyboard.press("Enter");
    await expect(html).not.toHaveClass(/dark/);
    await memberPage.reload();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("le bouton ⌘K de la barre supérieure ouvre la palette", async ({ memberPage }) => {
    await memberPage.goto("/accueil");
    await memberPage.getByRole("button", { name: "Rechercher" }).click();
    await expect(memberPage.getByRole("dialog", { name: "Palette de commandes" })).toBeVisible();
  });
});
