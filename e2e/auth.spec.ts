import { ADMIN, expect, seedAccounts, test } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

test.describe("connexion et session (CRM-14, contrats 6, 14, 19)", () => {
  test("une page privée sans session renvoie vers la connexion en conservant la page demandée", async ({ page }) => {
    await page.goto("/parametres/journal");
    await expect(page).toHaveURL(/\/connexion\?next=%2Fparametres%2Fjournal$/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  });

  test("un email inconnu et un mot de passe faux affichent le même message", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Email").fill("inconnu@exemple.fr");
    await page.getByLabel("Mot de passe").fill("MotDePasse-Faux-1");
    await page.getByRole("button", { name: "Se connecter" }).click();
    const alert = page.getByRole("form", { name: "Formulaire de connexion" }).getByRole("alert");
    await expect(alert).toHaveText("Email ou mot de passe incorrect.");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(alert).toHaveText("Email ou mot de passe incorrect.");
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("le bon mot de passe ouvre la page demandée, puis Accueil salue par le prénom", async ({ page }) => {
    await page.goto("/parametres/journal");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Mot de passe").fill(ADMIN.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/parametres\/journal$/);
    await page.goto("/accueil");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bonjour ${ADMIN.firstName}`);
  });
});
