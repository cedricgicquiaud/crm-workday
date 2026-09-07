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

  test("repliée, un clic sur le bas de l'icône « Mon profil » ouvre la page (CRM-64)", async ({ adminPage }) => {
    await adminPage.goto("/accueil");
    const sidebar = adminPage.locator('[data-slot="sidebar"]');
    await adminPage.getByRole("button", { name: SIDEBAR_TOGGLE }).click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    /* Repliée, chaque entrée fait 32 × 32 px. Le libellé « Objets » du groupe suivant, transparent mais remonté sur
       la moitié basse de ce bouton, avalait le clic : on vise le bas, là où la CI tombait. */
    const link = adminPage.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Mon profil" });
    await link.click({ position: { x: 16, y: 30 }, timeout: 5_000 });
    await expect(adminPage).toHaveURL(/\/profil$/);
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  });
});

const PALETTE_INPUT = "Rechercher une page ou une action";
const THEME_ENTRY = "Basculer le thème clair / sombre";

/** Cmd+K (Ctrl+K hors macOS). Le raccourci n'existe qu'une fois la page hydratée : en développement, la première compilation peut prendre quelques secondes, on réessaie. */
async function openPaletteWithKeyboard(page: import("@playwright/test").Page) {
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return palette;
}

test.describe("palette Cmd+K (CRM-28, contrat 22)", () => {
  test("Cmd+K ouvre la palette ; « para » puis Entrée ouvre Paramètres ; « sombre » bascule le thème et l'enregistre", async ({ memberPage }) => {
    /* Le serveur de la CI met plusieurs centaines de millisecondes à enregistrer : le rechargement qui suit la bascule doit trouver la valeur en base. */
    await memberPage.route("**/api/theme", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await memberPage.goto("/accueil");
    const html = memberPage.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    const palette = await openPaletteWithKeyboard(memberPage);
    await palette.getByPlaceholder(PALETTE_INPUT).fill("para");
    await expect(palette.getByRole("option", { name: "Aller à Paramètres" })).toHaveAttribute("aria-selected", "true");
    await memberPage.keyboard.press("Enter");
    await expect(memberPage).toHaveURL(/\/parametres(\/|$)/);
    await expect(palette).toBeHidden();

    await openPaletteWithKeyboard(memberPage);
    await palette.getByPlaceholder(PALETTE_INPUT).fill("sombre");
    await expect(palette.getByRole("option", { name: THEME_ENTRY })).toHaveAttribute("aria-selected", "true");
    await memberPage.keyboard.press("Enter");
    await expect(html).toHaveClass(/dark/);
    await memberPage.reload();
    await expect(html).toHaveClass(/dark/);

    await openPaletteWithKeyboard(memberPage);
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

test.describe("thème : échec d'enregistrement (retour du verifier 1.3)", () => {
  test("quand l'API échoue, le pied de la barre latérale le dit et le thème revient à sa valeur ; même chose depuis la palette", async ({ memberPage }) => {
    await memberPage.route("**/api/theme", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await memberPage.goto("/accueil");
    const html = memberPage.locator("html");
    const wasDark = await html.evaluate((el) => el.classList.contains("dark"));
    const sidebar = memberPage.locator('[data-slot="sidebar"]');
    /* Dans la barre latérale : Next.js pose son propre `role="alert"` (annonce de route), toujours présent et vide. */
    const alert = sidebar.getByRole("alert");

    await sidebar.getByRole("button", { name: /Passer en thème/ }).click();
    await expect(alert).toHaveText("Le thème n'a pas pu être enregistré.");
    expect(await html.evaluate((el) => el.classList.contains("dark"))).toBe(wasDark);

    await memberPage.reload();
    await expect(alert).toHaveCount(0);
    const palette = await openPaletteWithKeyboard(memberPage);
    await palette.getByPlaceholder(PALETTE_INPUT).fill("sombre");
    await expect(palette.getByRole("option", { name: THEME_ENTRY })).toHaveAttribute("aria-selected", "true");
    await memberPage.keyboard.press("Enter");
    await expect(alert).toHaveText("Le thème n'a pas pu être enregistré.");
    expect(await html.evaluate((el) => el.classList.contains("dark"))).toBe(wasDark);
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
    const palette = await openPaletteWithKeyboard(page);
    await palette.getByPlaceholder(PALETTE_INPUT).fill("déco");
    await expect(palette.getByRole("option", { name: "Se déconnecter" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/connexion$/);
    await context.close();
  });
});

test.describe("téléphone, 375 px (CRM-27, contrat 25)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** Aucun défilement horizontal de la page, un seul h1, et aucun cadre qui défile en largeur (un texte tronqué par des points de suspension n'est pas un débordement). */
  async function fitsTheScreen(page: import("@playwright/test").Page, label: string) {
    await expect(page.getByRole("heading", { level: 1 }), label).toHaveCount(1);
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

  test("les pages sans session tiennent dans l'écran et leur action principale est visible", async ({ page }) => {
    await page.goto("/connexion");
    await fitsTheScreen(page, "connexion");
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeInViewport();

    await page.goto("/reinitialisation");
    await fitsTheScreen(page, "réinitialisation");
    await expect(page.getByRole("button", { name: "Envoyer le lien" })).toBeInViewport();

    await page.goto("/invitation/lien-de-test-invalide");
    await fitsTheScreen(page, "invitation, lien invalide");
    await expect(page.getByRole("link", { name: "réinitialisez votre mot de passe" })).toBeInViewport();
  });

  test("les pages de l'application tiennent dans l'écran, leur action principale est visible, et la barre latérale est un tiroir ouvert par son bouton", async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 375, height: 812 });

    await adminPage.goto("/accueil");
    await fitsTheScreen(adminPage, "accueil");
    await expect(adminPage.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
    await adminPage.getByRole("button", { name: SIDEBAR_TOGGLE }).click();
    const drawer = adminPage.getByRole("dialog").filter({ has: adminPage.getByRole("navigation", { name: "Navigation principale" }) });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Mon profil" })).toBeInViewport();
    await drawer.getByRole("link", { name: "Mon profil" }).click();
    await expect(adminPage).toHaveURL(/\/profil$/);
    await expect(drawer).toBeHidden();
    await fitsTheScreen(adminPage, "profil");
    await expect(adminPage.getByRole("form", { name: "Identité" }).getByRole("button", { name: "Enregistrer" })).toBeVisible();

    await adminPage.goto("/parametres/comptes");
    await fitsTheScreen(adminPage, "comptes");
    await expect(adminPage.getByRole("button", { name: "Inviter" })).toBeInViewport();

    await adminPage.goto("/parametres/modeles");
    await fitsTheScreen(adminPage, "modèles");
    await expect(adminPage.getByRole("button", { name: "Modifier Invitation" })).toBeInViewport();

    await adminPage.goto("/parametres/journal");
    await fitsTheScreen(adminPage, "journal");
    await expect(adminPage.getByRole("form", { name: "Filtres du journal" }).getByRole("button", { name: "Filtrer" })).toBeInViewport();
  });
});

test.describe("Accueil (retour de recette 1.2a)", () => {
  test("la date du jour est courte : « 5 sept. 2026 »", async ({ adminPage }) => {
    await adminPage.goto("/accueil");
    const expected = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());
    await expect(adminPage.getByText(expected, { exact: true })).toBeVisible();
  });
});
