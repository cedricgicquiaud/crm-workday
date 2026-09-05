import { ADMIN, MEMBER, expect, seedAccounts, test } from "./fixtures/auth";

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
