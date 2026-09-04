import { ADMIN, expect, lastEmailTo, seedAccounts, test } from "./fixtures/auth";

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

test.describe("invitation (CRM-15, contrats 6, 12, 13)", () => {
  const INVITEE = { email: "invitee-e2e@exemple.fr", firstName: "Inès", lastName: "Roux", role: "membre" };

  test("l'invité choisit son mot de passe, arrive sur Accueil salué par son prénom ; le lien ne sert qu'une fois", async ({ adminPage, page }) => {
    const created = await adminPage.request.post("/api/invitations", { data: INVITEE });
    expect(created.status()).toBe(201);
    const link = lastEmailTo(INVITEE.email)!.links.find((l) => l.includes("/invitation/"))!;

    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choisissez votre mot de passe");
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("Court-Mdp-1");
    await page.getByLabel("Confirmation du mot de passe").fill("Court-Mdp-1");
    await page.getByRole("button", { name: "Choisir ce mot de passe" }).click();
    await expect(page.getByRole("form").getByRole("alert")).toHaveText("Le mot de passe doit contenir 12 caractères au moins.");

    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("MotDePasse-Invite-E2E-1");
    await page.getByLabel("Confirmation du mot de passe").fill("MotDePasse-Invite-E2E-1");
    await page.getByRole("button", { name: "Choisir ce mot de passe" }).click();
    await expect(page).toHaveURL(/\/accueil$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bonjour ${INVITEE.firstName}`);

    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lien invalide");
    await expect(page.getByLabel("Nouveau mot de passe", { exact: true })).toHaveCount(0);
  });
});
