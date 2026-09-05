import { ADMIN, expect, seedAccounts, test } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

const SIDEBAR_TOGGLE = "Replier ou déployer la barre latérale";

test.describe("barre latérale (CRM-27, contrat 21)", () => {
  test("montre Accueil, Paramètres et Mon profil ; repliée, elle le reste d'une page à l'autre et au rechargement", async ({ adminPage }) => {
    await adminPage.goto("/accueil");
    const nav = adminPage.getByRole("navigation", { name: "Navigation principale" });
    for (const name of ["Accueil", "Paramètres", "Mon profil"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
    await expect(adminPage.getByText(ADMIN.firstName, { exact: false })).toBeVisible();

    const sidebar = adminPage.locator('[data-slot="sidebar"]');
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
