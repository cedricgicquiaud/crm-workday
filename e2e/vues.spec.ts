import type { Page } from "@playwright/test";
import { expect, seedAccounts, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { resetViews } from "./fixtures/vues";

/* Fiches et vues finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const VIEW_BAR = '[data-slot="view-bar"]';
const VIEW_FORM = '[data-slot="view-form"]';
const VIEW_MENU = '[data-slot="view-menu"]';
const tag = () => Date.now().toString(36);
const named = (prefix: string, mark: string) => `${prefix} ${mark} (e2e)`;

/* Les vues d'abord : elles retiennent les fiches par personne. */
function resetAll() {
  resetViews();
  resetPersons();
  resetObjects();
}

test.beforeAll(() => {
  resetAll();
  seedAccounts();
});
test.afterAll(resetAll);

async function createCompany(page: Page, name: string, values: Record<string, string>) {
  const res = await page.request.post("/api/entreprises", { data: { name, ...values } });
  expect(res.status()).toBe(201);
}

/** Les raisons sociales affichées par la liste, dans l'ordre. */
const names = async (page: Page) => (await page.getByRole("table", { name: "Entreprises" }).getByRole("row").filter({ hasNot: page.getByRole("columnheader") }).getByRole("link").allTextContents()).map((text) => text.trim());

test.describe("barre des vues d'une liste (CRM-53, contrat 24)", () => {
  test("un membre enregistre l'état d'une liste sous un nom, et le rouvre depuis la barre des vues", async ({ memberPage }) => {
    const mark = tag();
    await createCompany(memberPage, named("Alpha", mark), { type: "client", city: "Paris" });
    await createCompany(memberPage, named("Bravo", mark), { type: "prospect", city: "Lyon" });

    /* L'état à ranger sous un nom : les fiches de ce test, les clients seulement, triées. */
    await memberPage.goto(`/entreprises?f=name:contient:${mark}&f=type:est:client&tri=name:asc`);
    const bar = memberPage.locator(VIEW_BAR);
    await expect(bar.getByRole("button", { name: "Vue : Toutes les entreprises" })).toBeVisible();

    await bar.getByRole("button", { name: "Enregistrer la vue" }).click();
    const form = memberPage.locator(VIEW_FORM);
    await form.getByLabel("Nom de la vue").fill(named("Clients", mark));
    await form.getByRole("button", { name: "Enregistrer", exact: true }).click();

    /* La vue devient la vue courante et l'adresse la porte (contrat 24). */
    await expect(memberPage).toHaveURL(/vue=/);
    await expect(bar.getByRole("button", { name: `Vue : ${named("Clients", mark)}` })).toBeVisible();
    expect(await names(memberPage)).toEqual([named("Alpha", mark)]);

    /* La liste nue revient à la vue par défaut ; la vue enregistrée attend dans le menu. */
    await memberPage.goto("/entreprises");
    await expect(bar.getByRole("button", { name: "Vue : Toutes les entreprises" })).toBeVisible();
    await bar.getByRole("button", { name: "Vue : Toutes les entreprises" }).click();
    const menu = memberPage.locator(VIEW_MENU);
    await expect(menu.getByRole("link", { name: "Toutes les entreprises" })).toHaveAttribute("aria-current", "true");

    await menu.getByRole("link", { name: named("Clients", mark) }).click();
    await expect(memberPage).toHaveURL(/vue=/);
    expect(await names(memberPage)).toEqual([named("Alpha", mark)]);
    /* L'état de la vue est appliqué : la puce du filtre enregistré est de retour. */
    await expect(memberPage.getByRole("button", { name: "Retirer le filtre Type est Client" })).toBeVisible();
  });
});
