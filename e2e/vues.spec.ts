import type { Page } from "@playwright/test";
import { expect, MEMBER, seedAccounts, signInAs, test } from "./fixtures/auth";
import { resetObjects } from "./fixtures/objets";
import { resetPersons } from "./fixtures/personnes";
import { resetViews } from "./fixtures/vues";

/* Fiches et vues finissent par « (e2e) » : les fixtures les effacent, et rien d'autre. */
const VIEW_BAR = '[data-slot="view-bar"]';
const VIEW_FORM = '[data-slot="view-form"]';
const VIEW_MENU = '[data-slot="view-menu"]';
const SIDEBAR = '[data-slot="sidebar"]';
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

/** Vues épinglées de la barre latérale d'une page, dans l'ordre affiché. */
const pinnedNav = (page: Page) => page.locator(SIDEBAR).getByRole("navigation", { name: "Vues épinglées" }).getByRole("link");

test.describe("vues épinglées dans la barre latérale (CRM-52, contrat 24)", () => {
  test("un membre épingle deux vues, les range, et sa barre latérale les garde après reconnexion sans les imposer au collègue", async ({ memberPage, adminPage, browser }) => {
    const mark = tag();
    for (const [name, query] of [[named("Clients", mark), "f=type:est:client"], [named("Lyon", mark), "f=city:contient:Lyon"]]) {
      const res = await memberPage.request.post("/api/vues", { data: { objectType: "company", name, query } });
      expect(res.status()).toBe(201);
    }

    await memberPage.goto("/entreprises");
    await memberPage.locator(VIEW_BAR).getByRole("button", { name: /^Vue : / }).click();
    const menu = memberPage.locator(VIEW_MENU);
    await menu.getByRole("checkbox", { name: `Épingler ${named("Clients", mark)}` }).click();
    await menu.getByRole("checkbox", { name: `Épingler ${named("Lyon", mark)}` }).click();
    await expect(pinnedNav(memberPage)).toHaveText([named("Clients", mark), named("Lyon", mark)]);

    /* L'ordre de la barre latérale est choisi, donc enregistré. */
    await menu.getByRole("button", { name: `Monter la vue ${named("Lyon", mark)}` }).click();
    await expect(pinnedNav(memberPage)).toHaveText([named("Lyon", mark), named("Clients", mark)]);

    /* Le collègue voit ces vues dans le menu des vues, mais sa barre latérale reste la sienne. */
    await adminPage.goto("/entreprises");
    await expect(adminPage.locator(SIDEBAR).getByRole("navigation", { name: "Vues épinglées" })).toHaveCount(0);
    await adminPage.locator(VIEW_BAR).getByRole("button", { name: /^Vue : / }).click();
    await expect(adminPage.locator(VIEW_MENU).getByRole("link", { name: named("Lyon", mark) })).toBeVisible();

    /* Reconnexion : la barre latérale les garde, dans l'ordre choisi (contrat 24). */
    const context = await browser.newContext();
    await signInAs(context.request, MEMBER);
    const again = await context.newPage();
    await again.goto("/accueil");
    await expect(pinnedNav(again)).toHaveText([named("Lyon", mark), named("Clients", mark)]);
    await context.close();

    /* Une vue épinglée ouvre la liste dans son état, et se retire de la barre depuis le même menu. */
    await pinnedNav(memberPage).first().click();
    await expect(memberPage).toHaveURL(/vue=/);
    await memberPage.locator(VIEW_BAR).getByRole("button", { name: /^Vue : / }).click();
    await menu.getByRole("checkbox", { name: `Épingler ${named("Lyon", mark)}` }).click();
    await expect(pinnedNav(memberPage)).toHaveText([named("Clients", mark)]);
  });
});
