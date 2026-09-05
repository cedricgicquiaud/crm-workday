import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { ADMIN, MEMBER, expect, lastEmailTo, seedAccounts, signInAs, test, type Account } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

/**
 * Les tests qui désactivent un compte, ferment ses sessions ou changent son mot de passe le font
 * sur un compte à eux, créé par le circuit réel (invitation puis choix du mot de passe) : les
 * comptes partagés `ADMIN` / `MEMBER` restent intacts, et leurs échecs de connexion (D14) ne
 * s'accumulent pas d'un test à l'autre. Le suffixe `-e2e@exemple.fr` les fait nettoyer par la fixture.
 */
function ownAccount(prefix: string, firstName: string, lastName: string): Account {
  return { email: `${prefix}-${Date.now()}-comptes-e2e@exemple.fr`, password: `MotDePasse-${firstName}-E2E-1`, firstName, lastName, role: "membre" };
}

async function createActiveAccount(admin: APIRequestContext, fresh: APIRequestContext, account: Account): Promise<void> {
  const { email, firstName, lastName, role } = account;
  expect((await admin.post("/api/accounts", { data: { email, firstName, lastName, role } })).status()).toBe(201);
  const token = lastEmailTo(email)!.links.find((l) => l.includes("/invitation/"))!.split("/invitation/")[1];
  expect((await fresh.post(`/api/invitations/${token}`, { data: { password: account.password } })).status()).toBe(200);
}

async function pageAs(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  await signInAs(context.request, account);
  return context.newPage();
}

test.describe("accès administrateur protégé (CRM-20, contrat 16)", () => {
  test("un membre qui ouvre la gestion des comptes est renvoyé vers Accueil, et l'appel serveur répond 403", async ({ memberPage }) => {
    await memberPage.goto("/parametres/comptes");
    await expect(memberPage).toHaveURL(/\/accueil$/);
    const res = await memberPage.request.get("/api/accounts");
    expect(res.status()).toBe(403);
  });
});

test.describe("liste des comptes (CRM-18)", () => {
  test("un administrateur voit chaque compte avec son nom, son email, son rôle et son état", async ({ adminPage }) => {
    const invitee = { email: "invitee-liste-e2e@exemple.fr", firstName: "Inès", lastName: "Roux", role: "membre" };
    expect((await adminPage.request.post("/api/accounts", { data: invitee })).status()).toBe(201);

    await adminPage.goto("/parametres/comptes");
    await expect(adminPage.getByRole("heading", { level: 2, name: "Comptes" })).toBeVisible();
    const table = adminPage.getByRole("table", { name: "Comptes" });
    const adminRow = table.getByRole("row", { name: new RegExp(ADMIN.email) });
    await expect(adminRow).toContainText(`${ADMIN.firstName} ${ADMIN.lastName}`);
    await expect(adminRow).toContainText("Administrateur");
    await expect(adminRow.getByText("Actif", { exact: true })).toBeVisible();
    const memberRow = table.getByRole("row", { name: new RegExp(MEMBER.email) });
    await expect(memberRow).toContainText("Membre");
    await expect(memberRow.getByText("Actif", { exact: true })).toBeVisible();
    const inviteeRow = table.getByRole("row", { name: new RegExp(invitee.email) });
    await expect(inviteeRow).toContainText("Inès Roux");
    await expect(inviteeRow.getByText("Invité", { exact: true })).toBeVisible();
  });
});

test.describe("invitation depuis l'écran (CRM-18, contrats 5 et 7)", () => {
  test("« Inviter » crée un compte invité et envoie le lien ; « Renvoyer l'invitation » envoie un lien neuf et l'ancien affiche « Lien invalide »", async ({ adminPage, page }) => {
    const invitee = { email: "invitee-dialog-e2e@exemple.fr", firstName: "Inès", lastName: "Roux" };
    await adminPage.goto("/parametres/comptes");
    await adminPage.getByRole("button", { name: "Inviter" }).click();
    const dialog = adminPage.getByRole("dialog", { name: "Inviter une personne" });
    await dialog.getByLabel("Email").fill(invitee.email);
    await dialog.getByLabel("Prénom").fill(invitee.firstName);
    await dialog.getByLabel("Nom", { exact: true }).fill(invitee.lastName);
    await dialog.getByRole("radio", { name: "Membre" }).click();
    await dialog.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(dialog).toBeHidden();
    await expect(adminPage.getByRole("status")).toContainText(`Invitation envoyée à ${invitee.email}`);
    const row = adminPage.getByRole("table", { name: "Comptes" }).getByRole("row", { name: new RegExp(invitee.email) });
    await expect(row).toContainText("Inès Roux");
    await expect(row.getByText("Invité", { exact: true })).toBeVisible();
    const firstLink = lastEmailTo(invitee.email)!.links.find((l) => l.includes("/invitation/"))!;

    await row.getByRole("button", { name: "Actions" }).click();
    await adminPage.getByRole("menuitem", { name: "Renvoyer l'invitation" }).click();
    await expect(adminPage.getByRole("status")).toContainText(`Invitation renvoyée à ${invitee.email}`);
    const secondLink = lastEmailTo(invitee.email)!.links.find((l) => l.includes("/invitation/"))!;
    expect(secondLink).not.toBe(firstLink);

    await page.goto(firstLink);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lien invalide");
    await page.goto(secondLink);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choisissez votre mot de passe");
  });
});

test.describe("refus d'un email déjà pris (CRM-18, contrat 18, D12)", () => {
  test("inviter un email déjà actif affiche un message qui nomme le compte ; un compte désactivé peut être réactivé depuis le dialogue", async ({ adminPage }) => {
    await adminPage.goto("/parametres/comptes");
    await adminPage.getByRole("button", { name: "Inviter" }).click();
    const dialog = adminPage.getByRole("dialog", { name: "Inviter une personne" });
    await dialog.getByLabel("Email").fill(MEMBER.email);
    await dialog.getByLabel("Prénom").fill("X");
    await dialog.getByLabel("Nom", { exact: true }).fill("Y");
    await dialog.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(dialog.getByRole("alert")).toContainText(`Un compte existe déjà pour ${MEMBER.email} : ${MEMBER.firstName} ${MEMBER.lastName} (actif).`);
    await expect(dialog.getByRole("button", { name: "Réactiver ce compte" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Annuler" }).click();

    const disabled = { email: "desactive-dialog-e2e@exemple.fr", firstName: "Dan", lastName: "Petit", role: "membre" };
    const created = await adminPage.request.post("/api/accounts", { data: disabled });
    const { userId } = (await created.json()) as { userId: string };
    expect((await adminPage.request.patch(`/api/accounts/${userId}`, { data: { status: "desactive" } })).status()).toBe(200);

    await adminPage.getByRole("button", { name: "Inviter" }).click();
    await dialog.getByLabel("Email").fill(disabled.email);
    await dialog.getByLabel("Prénom").fill("X");
    await dialog.getByLabel("Nom", { exact: true }).fill("Y");
    await dialog.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Dan Petit (désactivé)");
    await dialog.getByRole("button", { name: "Réactiver ce compte" }).click();
    await expect(dialog).toBeHidden();
    await expect(adminPage.getByRole("status")).toContainText("Compte de Dan Petit réactivé");
    // Dan n'avait pas choisi de mot de passe : réactivé, il redevient invité, pas actif (D12, D7).
    const row = adminPage.getByRole("table", { name: "Comptes" }).getByRole("row", { name: new RegExp(disabled.email) });
    await expect(row.getByText("Invité", { exact: true })).toBeVisible();
  });
});

test.describe("désactivation et réactivation (CRM-19, contrat 10)", () => {
  test("désactiver un compte déconnecte la personne à sa prochaine requête ; réactivé, il se reconnecte avec le même mot de passe", async ({ adminPage, browser, request }) => {
    const dan = ownAccount("dan", "Dan", "Petit");
    await createActiveAccount(adminPage.request, request, dan);
    const danPage = await pageAs(browser, dan);
    await danPage.goto("/accueil");
    await expect(danPage.getByRole("heading", { level: 1 })).toHaveText("Bonjour Dan");

    await adminPage.goto("/parametres/comptes");
    const row = adminPage.getByRole("table", { name: "Comptes" }).getByRole("row", { name: new RegExp(dan.email) });
    await row.getByRole("button", { name: "Actions" }).click();
    await adminPage.getByRole("menuitem", { name: "Désactiver" }).click();
    await expect(adminPage.getByRole("status")).toContainText("Compte de Dan Petit désactivé");
    await expect(row.getByText("Désactivé", { exact: true })).toBeVisible();

    await danPage.reload();
    await expect(danPage).toHaveURL(/\/connexion/);
    await danPage.getByLabel("Email").fill(dan.email);
    await danPage.getByLabel("Mot de passe").fill(dan.password);
    await danPage.getByRole("button", { name: "Se connecter" }).click();
    await expect(danPage.getByRole("form", { name: "Formulaire de connexion" }).getByRole("alert")).toHaveText("Email ou mot de passe incorrect.");

    await row.getByRole("button", { name: "Actions" }).click();
    await adminPage.getByRole("menuitem", { name: "Réactiver" }).click();
    await expect(adminPage.getByRole("status")).toContainText("Compte de Dan Petit réactivé");
    await expect(row.getByText("Actif", { exact: true })).toBeVisible();

    await danPage.getByRole("button", { name: "Se connecter" }).click();
    await expect(danPage).toHaveURL(/\/accueil$/);
    await danPage.context().close();
  });
});

test.describe("fermeture des sessions et rôle (CRM-19, contrat 11, D11)", () => {
  test("« Fermer toutes les sessions » force la reconnexion du compte ; « Passer administrateur » puis « Passer membre » changent le rôle affiché", async ({ adminPage, browser, request }) => {
    const sam = ownAccount("sam", "Sam", "Girard");
    await createActiveAccount(adminPage.request, request, sam);
    const samPage = await pageAs(browser, sam);
    await samPage.goto("/accueil");
    await expect(samPage.getByRole("heading", { level: 1 })).toHaveText("Bonjour Sam");

    await adminPage.goto("/parametres/comptes");
    const row = adminPage.getByRole("table", { name: "Comptes" }).getByRole("row", { name: new RegExp(sam.email) });
    await row.getByRole("button", { name: "Actions" }).click();
    await adminPage.getByRole("menuitem", { name: "Fermer toutes les sessions" }).click();
    await expect(adminPage.getByRole("status")).toContainText("Sessions de Sam Girard fermées");
    await expect(row.getByText("Actif", { exact: true })).toBeVisible();

    await samPage.reload();
    await expect(samPage).toHaveURL(/\/connexion/);
    await samPage.getByLabel("Email").fill(sam.email);
    await samPage.getByLabel("Mot de passe").fill(sam.password);
    await samPage.getByRole("button", { name: "Se connecter" }).click();
    await expect(samPage).toHaveURL(/\/accueil$/);
    await samPage.context().close();

    await row.getByRole("button", { name: "Actions" }).click();
    await adminPage.getByRole("menuitem", { name: "Passer administrateur" }).click();
    await expect(adminPage.getByRole("status")).toContainText("Sam Girard est maintenant administrateur");
    await expect(row).toContainText("Administrateur");
    await row.getByRole("button", { name: "Actions" }).click();
    await adminPage.getByRole("menuitem", { name: "Passer membre" }).click();
    await expect(adminPage.getByRole("status")).toContainText("Sam Girard est maintenant membre");
    await expect(row).toContainText("Membre");
  });
});

test.describe("dernier administrateur (CRM-19, contrat 17, D12)", () => {
  test("quand un seul administrateur est actif, « Désactiver » et « Passer membre » de son menu sont inactifs et sous-titrés", async ({ adminPage }) => {
    // La base de développement compte d'autres administrateurs actifs (dont le compte de recette) :
    // on les passe membres le temps du test, puis on les restaure quoi qu'il arrive.
    type Row = { id: string; email: string; role: string; status: string };
    const { accounts } = (await (await adminPage.request.get("/api/accounts")).json()) as { accounts: Row[] };
    const otherAdmins = accounts.filter((a) => a.role === "administrateur" && a.status === "actif" && a.email !== ADMIN.email);
    const setRole = async (id: string, role: "administrateur" | "membre") =>
      expect((await adminPage.request.patch(`/api/accounts/${id}`, { data: { role } })).status()).toBe(200);
    for (const other of otherAdmins) await setRole(other.id, "membre");
    try {
      await adminPage.goto("/parametres/comptes");
      const row = adminPage.getByRole("table", { name: "Comptes" }).getByRole("row", { name: new RegExp(ADMIN.email) });
      await row.getByRole("button", { name: "Actions" }).click();
      const menu = adminPage.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Désactiver" })).toBeDisabled();
      await expect(menu.getByRole("menuitem", { name: "Passer membre" })).toBeDisabled();
      await expect(menu.getByText("Dernier administrateur actif")).toHaveCount(2);
      await expect(menu.getByRole("menuitem", { name: "Fermer toutes les sessions" })).toBeEnabled();
      await adminPage.keyboard.press("Escape");
    } finally {
      for (const other of otherAdmins) await setRole(other.id, "administrateur");
    }
  });
});

test.describe("Mon profil (CRM-21, contrat 13, D13)", () => {
  test("un prénom modifié apparaît dans la salutation d'Accueil ; un mot de passe de 11 caractères est rejeté avec la règle ; le bon change le mot de passe", async ({ adminPage, browser, request }) => {
    const paul = ownAccount("paul", "Paul", "Martin");
    await createActiveAccount(adminPage.request, request, paul);
    const paulPage = await pageAs(browser, paul);

    await paulPage.goto("/profil");
    await expect(paulPage.getByRole("heading", { level: 1 })).toHaveText("Mon profil");
    const identity = paulPage.getByRole("form", { name: "Identité" });
    await expect(identity.getByLabel("Prénom")).toHaveValue("Paul");
    await expect(identity.getByLabel("Nom", { exact: true })).toHaveValue("Martin");
    await identity.getByLabel("Prénom").fill("Paolo");
    await identity.getByRole("button", { name: "Enregistrer" }).click();
    await expect(identity.getByRole("status")).toHaveText("Profil enregistré.");
    await paulPage.goto("/accueil");
    await expect(paulPage.getByRole("heading", { level: 1 })).toHaveText("Bonjour Paolo");

    await paulPage.goto("/profil");
    const password = paulPage.getByRole("form", { name: "Mot de passe" });
    await password.getByLabel("Mot de passe actuel").fill(paul.password);
    await password.getByLabel("Nouveau mot de passe", { exact: true }).fill("Court-Mdp-1");
    await password.getByLabel("Confirmation du nouveau mot de passe").fill("Court-Mdp-1");
    await password.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(password.getByRole("alert")).toHaveText("Le mot de passe doit contenir 12 caractères au moins.");

    await password.getByLabel("Mot de passe actuel").fill("MotDePasse-Faux-1");
    await password.getByLabel("Nouveau mot de passe", { exact: true }).fill("MotDePasse-Membre-E2E-2");
    await password.getByLabel("Confirmation du nouveau mot de passe").fill("MotDePasse-Membre-E2E-2");
    await password.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(password.getByRole("alert")).toHaveText("Le mot de passe actuel est incorrect.");

    await password.getByLabel("Mot de passe actuel").fill(paul.password);
    await password.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(password.getByRole("status")).toHaveText("Mot de passe modifié.");
    await paulPage.context().close();
    // Depuis un contexte vierge : Better Auth exige un en-tête Origin dès qu'un cookie de session accompagne la requête.
    const fresh = await browser.newContext();
    expect((await fresh.request.post("/api/auth/sign-in/email", { data: { email: paul.email, password: paul.password } })).status()).toBe(401);
    expect((await fresh.request.post("/api/auth/sign-in/email", { data: { email: paul.email, password: "MotDePasse-Membre-E2E-2" } })).status()).toBe(200);
    await fresh.close();
  });
});

test.describe("écrans à 375 px", () => {
  test("les comptes et le profil n'ont aucun défilement horizontal et un seul titre h1", async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 375, height: 800 });
    for (const path of ["/parametres/comptes", "/profil"]) {
      await adminPage.goto(path);
      await expect(adminPage.getByRole("heading", { level: 1 })).toHaveCount(1);
      const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBe(0);
    }
    await adminPage.goto("/parametres/comptes");
    await adminPage.getByRole("button", { name: "Inviter" }).click();
    const dialog = adminPage.getByRole("dialog", { name: "Inviter une personne" });
    await expect(dialog).toBeVisible();
    const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
