import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";

/* Les fiches finissent par « (e2e) » : la fixture des objets les efface, et rien d'autre. */
const mark = () => `${Date.now().toString(36)} (e2e)`;

test.beforeAll(() => {
  resetObjects();
  seedAccounts();
});
test.afterAll(() => resetObjects());

async function createCompany(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/entreprises", { data: { name, type: "client" } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/**
 * CRM-68 : une fois l'interrupteur « Archivées » allumé, rien ne distinguait une fiche archivée
 * d'une fiche vivante — même fond, même couleur de texte, en 1280 comme en 375 px. La marque est
 * un badge en toutes lettres : l'information n'est jamais portée par la couleur seule (fondations).
 */
test.describe("fiche archivée dans la liste (CRM-68)", () => {
  test("marque la fiche archivée dans la liste dense et sur la carte à 375 px, et ne marque rien quand le filtre est éteint", async ({ memberPage }) => {
    const suffix = mark();
    const vivante = `Alpha vivante ${suffix}`;
    const rangee = `Bravo rangée ${suffix}`;
    await createCompany(memberPage, vivante);
    const archivedId = await createCompany(memberPage, rangee);
    expect((await memberPage.request.post(`/api/objets/company/${archivedId}/archiver`)).status()).toBe(200);

    const filtre = `f=name:contient:${encodeURIComponent(suffix)}`;
    await memberPage.goto(`/entreprises?${filtre}&archivees=1`);
    const table = memberPage.getByRole("table", { name: "Entreprises" });
    const ligne = (name: string) => table.getByRole("row").filter({ has: memberPage.getByRole("link", { name }) });
    await expect(ligne(rangee).getByText("Archivée", { exact: true })).toBeVisible();
    await expect(ligne(vivante).getByText("Archivée", { exact: true })).toHaveCount(0);

    /* Filtre éteint : aucune archivée à l'écran, donc aucune marque. */
    await memberPage.goto(`/entreprises?${filtre}`);
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table.getByText("Archivée", { exact: true })).toHaveCount(0);
  });

  test("marque la carte de la fiche archivée à 375 px, sans ajouter de défilement horizontal", async ({ memberPage }) => {
    const suffix = mark();
    const rangee = `Charlie rangée ${suffix}`;
    await createCompany(memberPage, `Delta vivante ${suffix}`);
    const archivedId = await createCompany(memberPage, rangee);
    expect((await memberPage.request.post(`/api/objets/company/${archivedId}/archiver`)).status()).toBe(200);

    await memberPage.setViewportSize({ width: 375, height: 812 });
    await memberPage.goto(`/entreprises?f=name:contient:${encodeURIComponent(suffix)}&archivees=1`);
    const cartes = memberPage.getByRole("list", { name: "Entreprises" });
    const carte = (name: string) => cartes.getByRole("listitem").filter({ has: memberPage.getByRole("link", { name }) });
    await expect(carte(rangee).getByText("Archivée", { exact: true })).toBeVisible();
    await expect(carte(`Delta vivante ${suffix}`).getByText("Archivée", { exact: true })).toHaveCount(0);

    const { scrollWidth, clientWidth } = await memberPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
