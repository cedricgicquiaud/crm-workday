import { ADMIN, MEMBER, expect, lastEmailTo, seedAccounts, test } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

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
    const row = adminPage.getByRole("table", { name: "Comptes" }).getByRole("row", { name: new RegExp(disabled.email) });
    await expect(row.getByText("Actif", { exact: true })).toBeVisible();
  });
});
