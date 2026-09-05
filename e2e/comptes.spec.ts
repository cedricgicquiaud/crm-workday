import { expect, seedAccounts, test } from "./fixtures/auth";

test.beforeAll(() => seedAccounts());

test.describe("accès administrateur protégé (CRM-20, contrat 16)", () => {
  test("un membre qui ouvre la gestion des comptes est renvoyé vers Accueil, et l'appel serveur répond 403", async ({ memberPage }) => {
    await memberPage.goto("/parametres/comptes");
    await expect(memberPage).toHaveURL(/\/accueil$/);
    const res = await memberPage.request.get("/api/accounts");
    expect(res.status()).toBe(403);
  });
});
