import { ADMIN, expect, MEMBER, seedAccounts, signInAs, test } from "./fixtures/auth";

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

test.describe("thème mémorisé (CRM-29, contrats 24 et 26)", () => {
  test("le thème choisi dans Mon profil revient sur un autre navigateur, déjà dans le HTML servi ; avant connexion, la page suit le navigateur", async ({ browser, adminPage }) => {
    await adminPage.goto("/profil");
    const choice = adminPage.getByRole("radiogroup", { name: "Thème" });
    await expect(choice.getByRole("radio", { name: "Système" })).toBeChecked();
    await choice.getByRole("radio", { name: "Sombre" }).click();
    await expect(adminPage.locator("html")).toHaveClass(/dark/);
    await expect(adminPage.getByRole("status")).toHaveText("Thème enregistré.");

    /* Un autre navigateur : la valeur vient de la base, et la classe est dans la réponse HTML, avant tout script (contrat 26). */
    const other = await browser.newContext();
    await signInAs(other.request, ADMIN);
    const served = await (await other.request.get("/accueil")).text();
    expect(served.match(/<html[^>]*>/)![0]).toMatch(/class="[^"]*\bdark\b/);
    expect(served.indexOf("<html")).toBeLessThan(served.indexOf("<script"));
    const otherPage = await other.newPage();
    await otherPage.goto("/profil");
    await expect(otherPage.locator("html")).toHaveClass(/dark/);
    await expect(otherPage.getByRole("radiogroup", { name: "Thème" }).getByRole("radio", { name: "Sombre" })).toBeChecked();
    await otherPage.getByRole("radiogroup", { name: "Thème" }).getByRole("radio", { name: "Système" }).click();
    await expect(otherPage.locator("html")).not.toHaveClass(/dark/);
    await expect(otherPage.getByRole("status")).toHaveText("Thème enregistré.");
    await other.close();

    /* Sans session, la préférence du navigateur décide (D17). */
    for (const [colorScheme, dark] of [["dark", true], ["light", false]] as const) {
      const anonymous = await browser.newContext({ colorScheme });
      const page = await anonymous.newPage();
      await page.goto("/connexion");
      await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.classList.contains("dark")), colorScheme).toBe(dark);
      await anonymous.close();
    }
  });
});

test.describe("sous-navigation Paramètres (CRM-30, contrat 16)", () => {
  test("un membre voit Journal seulement, un administrateur les cinq entrées ; l'entrée courante est marquée ; une entrée masquée reste protégée", async ({ memberPage, adminPage }) => {
    await memberPage.goto("/parametres/journal");
    const memberNav = memberPage.getByRole("navigation", { name: "Sections des paramètres" });
    await expect(memberNav.getByRole("link")).toHaveText(["Journal des envois"]);
    await expect(memberNav.getByRole("link", { name: "Journal des envois" })).toHaveAttribute("aria-current", "page");
    await memberPage.goto("/parametres");
    await expect(memberPage).toHaveURL(/\/parametres\/journal$/);
    await memberPage.goto("/parametres/comptes");
    await expect(memberPage).toHaveURL(/\/accueil$/);
    expect((await memberPage.request.get("/api/accounts")).status()).toBe(403);

    await adminPage.goto("/parametres/modeles");
    const adminNav = adminPage.getByRole("navigation", { name: "Sections des paramètres" });
    await expect(adminNav.getByRole("link")).toHaveText(["Comptes", "Cabinet", "Modèles d'emails", "Journal des envois", "Envoi de test"]);
    await expect(adminNav.getByRole("link", { name: "Modèles d'emails" })).toHaveAttribute("aria-current", "page");
    await expect(adminNav.getByRole("link", { name: "Comptes" })).not.toHaveAttribute("aria-current", "page");
    await adminPage.goto("/parametres");
    await expect(adminPage).toHaveURL(/\/parametres\/comptes$/);
  });
});

test.describe("déconnexion (D16)", () => {
  test("« Se déconnecter » dans le pied de la barre latérale mène à la connexion, et la palette propose la même action", async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context.request, MEMBER);
    const page = await context.newPage();
    await page.goto("/accueil");
    await page.locator('[data-slot="sidebar"]').getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto("/accueil");
    await expect(page).toHaveURL(/\/connexion/);

    await signInAs(context.request, MEMBER);
    await page.goto("/profil");
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Palette de commandes" });
    await palette.getByPlaceholder(PALETTE_INPUT).fill("déco");
    await expect(palette.getByRole("option", { name: "Se déconnecter" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/connexion$/);
    await context.close();
  });
});
