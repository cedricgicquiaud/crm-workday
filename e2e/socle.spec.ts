import { expect, test } from "@playwright/test";
import pkg from "../package.json";

test.describe("socle (contrats 1 et 2)", () => {
  test("la racine renvoie vers la connexion sans session", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
  });

  test("la route de santé répond 200 avec la version", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.version);
    expect(body.commit).toMatch(/^[0-9a-f]{7,}$/);
  });
});
